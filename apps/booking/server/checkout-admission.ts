import { Pool, type PoolClient } from "pg";
import { admission, budget, clientIdentity, lease, privateKey, setting, AdmissionDenied } from "../../../server/database/admission";
import { bookingDb } from "./notifications";
let locks: Pool | undefined, waiting = 0;
export class CheckoutIntentChanged extends Error {}
export type CheckoutIdentity = ReturnType<typeof clientIdentity>;
export async function lockedCheckout<T>(code: string, fn: () => Promise<T>) {
  if (waiting >= 8) throw new AdmissionDenied("capacity");
  waiting++;
  let release: (()=>Promise<void>) | undefined;
  let connection: PoolClient | undefined;
  try {
    release = await lease(bookingDb(), "checkout-operation", 2, 180);
    locks ??= new Pool({connectionString:process.env.BOOKING_DATABASE_URL,max:2,connectionTimeoutMillis:2000,allowExitOnIdle:true});
    connection=await locks.connect();
    await connection.query("SET statement_timeout='2s'");
    await connection.query("SELECT pg_advisory_lock(hashtext(current_schema()||':rental-intent'),hashtext($1))",[code]);
    return await fn();
  } finally {
    if (connection) {
      try {await connection.query("SELECT pg_advisory_unlock(hashtext(current_schema()||':rental-intent'),hashtext($1))",[code]);connection.release();}
      catch {connection.release(true);}
    }
    try { if (release) await release(); } finally { waiting--; }
  }
}
export async function reserveIntent(code: string, hash: string, email: string, selection: {start:string;end:string}, client: CheckoutIdentity) {
  const identity=clientIdentity(client.address);
  if (identity.prefix!==client.prefix) throw new Error("Invalid checkout client");
  const secret=process.env.MANAGE_RECOVERY_HASH_KEY ?? "";
  const keys={client:privateKey(secret,"checkout-client",identity.address),contact:privateKey(secret,"checkout-contact",email.trim().toLowerCase()),prefix:privateKey(secret,"checkout-prefix",identity.prefix)};
  return admission(bookingDb(),"checkout",async c=>{
    const existing=await c.query<{intent_hash:string;state:string;client_key:string;contact_key:string;prefix_key:string}>("SELECT intent_hash,state,client_key,contact_key,prefix_key FROM rental_intents WHERE order_code=$1",[code]);
    if (existing.rowCount) {
      if(existing.rows[0].intent_hash!==hash) throw new CheckoutIntentChanged("Checkout intent changed");
      if(existing.rows[0].state!=="terminal") return existing.rows[0].state;
      keys.client=existing.rows[0].client_key;keys.contact=existing.rows[0].contact_key;keys.prefix=existing.rows[0].prefix_key;
    }
    if(!existing.rowCount) {
    await budget(c,keys.client,setting("CHECKOUT_CLIENT_HOURLY",6),3600);
    await budget(c,keys.prefix,setting("CHECKOUT_PREFIX_HOURLY",60),3600);
    await budget(c,keys.contact,setting("CHECKOUT_CONTACT_HOURLY",6),3600,"contact");
    }
    const counts=await c.query<{total:string;client:string;contact:string;prefix:string}>("SELECT count(*) AS total,count(*) FILTER(WHERE client_key=$1) AS client,count(*) FILTER(WHERE contact_key=$2) AS contact,count(*) FILTER(WHERE prefix_key=$3) AS prefix FROM rental_intents WHERE state<>'terminal'",[keys.client,keys.contact,keys.prefix]);
    if(Number(counts.rows[0].client)>=setting("CHECKOUT_CLIENT_ACTIVE",1) || Number(counts.rows[0].contact)>=setting("CHECKOUT_CONTACT_ACTIVE",1)) throw new AdmissionDenied("client");
    if(Number(counts.rows[0].prefix)>=setting("CHECKOUT_PREFIX_ACTIVE",20)) throw new AdmissionDenied("client");
    if(Number(counts.rows[0].total)>=setting("CHECKOUT_ACTIVE_MAX",40)) throw new AdmissionDenied("capacity");
    if(existing.rowCount) {
      await c.query("UPDATE rental_intents SET state='reserved',updated_at=now() WHERE order_code=$1",[code]);
      return "reserved";
    }
    await c.query("INSERT INTO rental_intents(order_code,intent_hash,client_key,contact_key,prefix_key,start_at,end_at,state) VALUES($1,$2,$3,$4,$5,$6,$7,'reserved')",[code,hash,keys.client,keys.contact,keys.prefix,selection.start,selection.end]);
    return "reserved";
  });
}
export async function markIntent(code:string,state:"uncertain"|"pending"|"terminal",expires:string|null=null) {
  await bookingDb().query("UPDATE rental_intents SET state=$2,remote_expires=$3,updated_at=now() WHERE order_code=$1",[code,state,expires]);
}

export async function reconciliationCandidate(email:string,client:CheckoutIdentity) {
  const secret=process.env.MANAGE_RECOVERY_HASH_KEY ?? "";
  const contact=privateKey(secret,"checkout-contact",email.trim().toLowerCase());
  const clientKey=privateKey(secret,"checkout-client",client.address);
  return admission(bookingDb(),"checkout-reconcile",async c=>{
    const result=await c.query<{order_code:string;intent_hash:string;state:string}>(
      "SELECT order_code,intent_hash,state FROM rental_intents WHERE (contact_key=$1 OR client_key=$2) AND ((state='pending' AND remote_expires<=now()) OR (state IN ('reserved','uncertain') AND updated_at<now()-interval '3 minutes')) ORDER BY updated_at LIMIT 1",[contact,clientKey]);
    if(!result.rows[0]) return null;
    await budget(c,privateKey(secret,"checkout-reconcile",client.address),3,60);
    await budget(c,"checkout-reconcile-total",30,60,"capacity");
    return result.rows[0];
  });
}
export async function intentState(code:string) {
  return (await bookingDb().query<{state:string}>("SELECT state FROM rental_intents WHERE order_code=$1",[code])).rows[0]?.state;
}
