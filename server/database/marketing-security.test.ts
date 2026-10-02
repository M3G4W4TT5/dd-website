import { test } from "node:test";
import assert from "node:assert/strict";
import { marketing } from "../marketing/index";
import { securityFixture } from "./security-fixture";
import { clientIdentity } from "./admission";
import { cleanupMarketing } from "./retention";
import { pollDelivery } from "./delivery";
import { digest } from "./index";

test("distributed marketing admission is atomic, persistent, site scoped and withdrawal protected", {skip:!process.env.SECURITY_TEST_DATABASE_URL}, async()=>{
 const a=await securityFixture("marketing"),b=await securityFixture("marketing");
 const key="a".repeat(64),list=marketing(a.pool,"booking","https://fixture.invalid",key);
 Object.assign(process.env,{MARKETING_SIGNUP_QUEUE_MAX:"5",MARKETING_SIGNUP_HOURLY:"60"});
 try {
  const flood=await Promise.allSettled(Array.from({length:100},(_,i)=>list.request(`distributed${i}@example.invalid`,"en","confirm","fixture","idempotency-key-"+i,clientIdentity(`2001:db8:${i.toString(16)}::1`))));
  assert.equal(flood.filter(r=>r.status==="fulfilled").length,5);
  assert.equal((await a.pool.query("SELECT count(*)::int n FROM marketing_subscriptions")).rows[0].n,5);
  assert.equal((await a.pool.query("SELECT count(*)::int n FROM internal_requests")).rows[0].n,5);
  assert.equal((await a.pool.query("SELECT sum(hits)::int n FROM admission_budgets")).rows[0].n,15);
  // New helper/process instance uses the same persistent capacity; duplicate stays free.
  const stored=(await a.pool.query("SELECT email FROM marketing_subscriptions ORDER BY email LIMIT 1")).rows[0].email as string;
  const index=stored.match(/distributed(\d+)/)![1];
  await marketing(a.pool,"booking","https://fixture.invalid",key).request(stored,"en","confirm","fixture","idempotency-key-"+index);
  await assert.rejects(()=>list.request("blocked@example.invalid","en","confirm","fixture","new-key"));
  await marketing(b.pool,"primary","https://other.invalid",key).request("independent@example.invalid","en","confirm","fixture","different-key");
  await a.pool.query("UPDATE marketing_subscriptions SET status='active',confirmed_at=now() WHERE email=$1",[stored]);
  await list.request(stored,"en","unsubscribe","fixture");
  let kind="";await pollDelivery(a.pool,key,async row=>{kind=row.kind;});assert.equal(kind,"marketing-withdrawal");
  const token="x".repeat(43);await a.pool.query("INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,'unsubscribe',now()+interval '1 hour')",[digest(token),stored]);
  assert.equal(await list.consume(token,"unsubscribe",clientIdentity("192.0.2.1")),true);
  assert.equal(await list.consume(token,"unsubscribe"),false);
  // Queue allocation failure rolls back subscription, idempotency and all budgets.
  await a.pool.query("UPDATE deliveries SET state='sent'");
  const before=(await a.pool.query("SELECT sum(hits)::int n FROM admission_budgets")).rows[0].n;
  await a.pool.query("CREATE FUNCTION reject_delivery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture rejected insert'; END $$; CREATE TRIGGER reject_delivery BEFORE INSERT ON deliveries FOR EACH ROW EXECUTE FUNCTION reject_delivery()");
  await assert.rejects(()=>list.request("rollback@example.invalid","en","confirm","fixture","rollback-key",clientIdentity("198.51.100.1")));
  assert.equal((await a.pool.query("SELECT sum(hits)::int n FROM admission_budgets")).rows[0].n,before);
  assert.equal((await a.pool.query("SELECT 1 FROM marketing_subscriptions WHERE email='rollback@example.invalid'")).rowCount,0);
 } finally {await a.close();await b.close();}
});

test("bounded retention preserves active/suppression/withdrawal and ambiguous evidence", {skip:!process.env.SECURITY_TEST_DATABASE_URL}, async()=>{
 const f=await securityFixture("marketing"),key="b".repeat(64),list=marketing(f.pool,"primary","https://fixture.invalid",key);
 Object.assign(process.env,{MARKETING_SIGNUP_QUEUE_MAX:"50",MARKETING_CLEANUP_BATCH:"2"});
 try {
  for(const name of ["expired","active","withdrawn","suppressed","ambiguous"])
   await list.request(`${name}@example.invalid`,"en","confirm","fixture",`fixture-${name}`);
  await f.pool.query("UPDATE marketing_subscriptions SET status=CASE split_part(email,'@',1) WHEN 'active' THEN 'active' WHEN 'withdrawn' THEN 'unsubscribed' WHEN 'suppressed' THEN 'suppressed' ELSE 'pending' END,requested_at=now()-interval '31 days'");
  await f.pool.query("UPDATE deliveries SET state='sent',created_at=now()-interval '31 days'");
  await f.pool.query("UPDATE deliveries SET state='ambiguous' WHERE identity LIKE $1",["%:"+digest("ambiguous@example.invalid")+":%"]);
  await f.pool.query("INSERT INTO delivery_attempts(delivery_id,attempt,outcome) SELECT id,1,state FROM deliveries");
  await f.pool.query("UPDATE internal_requests SET created_at=now()-interval '8 days'");
  await f.pool.query("UPDATE marketing_subscriptions SET status='pending' WHERE email='withdrawn@example.invalid'");
  for(let i=0;i<4;i++)await cleanupMarketing(f.pool);
  const retained=(await f.pool.query("SELECT email FROM marketing_subscriptions ORDER BY email")).rows.map(r=>r.email);
  assert.ok(!retained.includes("expired@example.invalid"));
  for(const name of ["active","withdrawn","suppressed","ambiguous"])assert.ok(retained.includes(`${name}@example.invalid`));
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM deliveries WHERE state='ambiguous'")).rows[0].n,1);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM delivery_attempts")).rows[0].n,1);
  assert.equal((await f.pool.query("SELECT count(*)::int n FROM internal_requests")).rows[0].n,0);
 }finally{await f.close();}
});
