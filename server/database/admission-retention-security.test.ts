import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";
import { securityFixture } from "./security-fixture";
import { cleanupAdmissionBudgets } from "./admission-retention";
import { admission, budget } from "./admission";

test("worker cleanup is bounded, schema-scoped and preserves live counters", async () => {
  const fixture = await securityFixture(), other = await securityFixture();
  const schema = (await fixture.pool.query("SELECT current_schema() s")).rows[0].s;
  await fixture.pool.query(`GRANT USAGE ON SCHEMA ${schema} TO booking_worker_runtime`);
  const url = new URL(fixture.url);
  url.searchParams.set("options",`-c search_path=${schema},pg_catalog -c role=booking_worker_runtime`);
  const worker = new Pool({connectionString:url.toString()});
  try {
    await fixture.pool.query("INSERT INTO admission_budgets SELECT 'expired'||i,6,now()-interval '1 hour' FROM generate_series(1,250) i");
    await fixture.pool.query("INSERT INTO admission_budgets VALUES('live',6,now()+interval '1 hour')");
    await other.pool.query("INSERT INTO admission_budgets VALUES('other',6,now()-interval '1 hour')");
    const live = (await fixture.pool.query("SELECT * FROM admission_budgets WHERE key='live'")).rows[0];
    assert.equal(await cleanupAdmissionBudgets(worker),100);
    assert.equal(await cleanupAdmissionBudgets(worker),100);
    assert.equal(await cleanupAdmissionBudgets(worker),50);
    assert.equal(await cleanupAdmissionBudgets(worker),0);
    assert.deepEqual((await fixture.pool.query("SELECT * FROM admission_budgets")).rows,[live]);
    assert.equal((await other.pool.query("SELECT count(*)::int n FROM admission_budgets")).rows[0].n,1);
  } finally { await worker.end(); await fixture.close(); await other.close(); }
});

test("concurrent renewal wins over expiry deletion without resetting an active allowance", async () => {
  const fixture = await securityFixture();
  const writer = await fixture.pool.connect();
  try {
    await fixture.pool.query("INSERT INTO admission_budgets VALUES('renew',6,now()-interval '1 hour')");
    await writer.query("BEGIN");
    await writer.query("SELECT * FROM admission_budgets WHERE key='renew' FOR UPDATE");
    const cleaning = cleanupAdmissionBudgets(fixture.pool);
    // Wait for cleanup to be contending on this row, rather than a timing-only assertion.
    for (let i = 0; i < 100; i++) {
      const blocked = await fixture.pool.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'DELETE FROM admission_budgets%' AND pid<>pg_backend_pid()");
      if (blocked.rowCount) break;
      if (i === 99) throw new Error("fixture cleanup never acquired contention");
      await new Promise(r => setTimeout(r,10));
    }
    await budget(writer,"renew",6,3600);
    await writer.query("COMMIT");
    assert.equal(await cleaning,0);
    assert.equal((await fixture.pool.query("SELECT hits FROM admission_budgets WHERE key='renew'")).rows[0].hits,1);
    await admission(fixture.pool,"fixture-renew",c => budget(c,"renew",6,3600));
    assert.equal((await fixture.pool.query("SELECT hits FROM admission_budgets WHERE key='renew'")).rows[0].hits,2);
  } finally { await writer.query("ROLLBACK"); writer.release(); await fixture.close(); }
});
