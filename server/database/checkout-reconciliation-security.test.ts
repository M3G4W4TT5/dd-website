import assert from "node:assert/strict";
import test, { before, beforeEach, after } from "node:test";
import { Pool } from "pg";
import { securityFixture } from "./security-fixture";
import { AdmissionDenied, clientIdentity } from "./admission";
import { lockedCheckout, reserveIntent } from "../../apps/booking/server/checkout-admission";
import { reconcileAllocations, readAllocation } from "../../apps/booking/server/checkout-reconciliation";

let fixture: Awaited<ReturnType<typeof securityFixture>>;
before(async () => {
  fixture = await securityFixture();
  process.env.BOOKING_DATABASE_URL = fixture.url;
  process.env.MANAGE_RECOVERY_HASH_KEY = "a".repeat(64);
});
beforeEach(async () => { await fixture.pool.query("TRUNCATE rental_intents,admission_leases,admission_budgets"); });
after(async () => { await fixture.close(); });
async function seed(n: number, state = "pending") {
  await fixture.pool.query(`INSERT INTO rental_intents(order_code,intent_hash,client_key,contact_key,prefix_key,start_at,end_at,state,remote_expires,updated_at)
    SELECT 'R'||lpad(i::text,3,'0'),'hash'||i,'client'||i,'contact'||i,'prefix'||i,now(),now()+interval '1 hour',$2,now()-interval '1 hour',now()-interval '1 hour'
    FROM generate_series(1,$1::int) i`, [n,state]);
}
const expired = (code: string) => ({code,status:"e",api_meta:{ttd_checkout_intent:"hash"+Number(code.slice(1))}});

test("whole-ledger expiry frees a full global cap for an unrelated customer", async () => {
  await seed(40);
  const reserve = () => reserveIntent("NEW", "new-hash", "new@example.invalid", {start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()}, clientIdentity("198.51.100.9"));
  await assert.rejects(reserve, AdmissionDenied);
  const calls: string[] = [];
  for (let batch = 0; batch < 4; batch++) assert.equal(await reconcileAllocations(fixture.pool, async code => { calls.push(code); return expired(code); }),10);
  assert.equal(new Set(calls).size,40);
  assert.equal(await reserve(),"reserved");
  assert.equal((await fixture.pool.query("SELECT count(*)::int n FROM rental_intents WHERE state<>'terminal'")).rows[0].n,1);
});

test("ambiguous, malformed and pending authority retain allocations; later candidates progress", async () => {
  await seed(14,"uncertain");
  await fixture.pool.query("UPDATE rental_intents SET state='reserved' WHERE order_code='R013'");
  const read = async (code: string) => {
    const n = Number(code.slice(1));
    if (n === 1 || n === 13) return null;
    if (n === 2) return {...expired(code),status:"n",expires:"2000-01-01T00:00:00Z"};
    if (n === 3) return {...expired(code),api_meta:{ttd_checkout_intent:"wrong"}};
    if (n === 4) return {...expired(code),code:"OTHER"};
    if (n <= 10) throw new Error("fixture provider unavailable");
    return {...expired(code),status:n === 11 ? "p" : n === 12 ? "c" : "e"};
  };
  assert.equal(await reconcileAllocations(fixture.pool, read),0);
  assert.equal(await reconcileAllocations(fixture.pool, read),4);
  assert.equal((await fixture.pool.query("SELECT count(*)::int n FROM rental_intents WHERE state<>'terminal'")).rows[0].n,10);
});

test("reconciliation shares the checkout lock and retains a reservation during creation", async () => {
  await seed(1,"reserved");
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>(r => { entered = r; });
  const held = new Promise<void>(r => { finish = r; });
  const creation = lockedCheckout("R001", async () => { entered(); await held; });
  await started;
  try {
    let reads = 0;
    assert.equal(await reconcileAllocations(fixture.pool, async () => { reads++; return null; }),0);
    assert.equal(reads,0);
    assert.equal((await fixture.pool.query("SELECT state FROM rental_intents")).rows[0].state,"reserved");
  } finally { finish(); await creation; }
  assert.equal(await reconcileAllocations(fixture.pool, async () => null),1);
});

test("worker grants permit bounded reconciliation but deny identity reads and provider writes", async () => {
  await seed(1);
  const schema = (await fixture.pool.query("SELECT current_schema() s")).rows[0].s;
  await fixture.pool.query(`GRANT USAGE ON SCHEMA ${schema} TO booking_worker_runtime`);
  const url = new URL(fixture.url);
  url.searchParams.set("options",`-c search_path=${schema},pg_catalog -c role=booking_worker_runtime`);
  const worker = new Pool({connectionString:url.toString()});
  try {
    assert.equal(await reconcileAllocations(worker, async code => expired(code)),1);
    await assert.rejects(worker.query("SELECT client_key FROM rental_intents"), /permission denied/);
    await assert.rejects(worker.query("UPDATE admission_budgets SET hits=0"), /permission denied/);
  } finally { await worker.end(); }
});

test("production allocation reader only GETs scoped orders with the management read token", async () => {
  Object.assign(process.env,{PRETIX_API_BASE:"https://api.example.invalid",PRETIX_ORGANIZER_SLUG:"synthetic",PRETIX_EVENT_SLUG:"studio",PRETIX_MANAGE_API_TOKEN:"fixture-read-only"});
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url),`${process.env.PRETIX_API_BASE || "http://127.0.0.1:8345"}/api/v1/organizers/synthetic/events/studio/orders/R001/`);
    assert.equal(init?.method ?? "GET","GET");
    assert.equal(new Headers(init?.headers).get("Authorization"),"Token fixture-read-only");
    assert.ok(init?.signal);
    return Response.json(expired("R001"));
  };
  try {
    assert.deepEqual(await readAllocation("R001",AbortSignal.timeout(5000)),expired("R001"));
    delete process.env.PRETIX_API_BASE;
    assert.deepEqual(await readAllocation("R001",AbortSignal.timeout(5000)),expired("R001"));
  }
  finally { globalThis.fetch = original; }
});
