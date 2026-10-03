import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { clientIdentity, AdmissionDenied } from "./admission";
import { securityFixture } from "./security-fixture";
import { pollDelivery } from "./delivery";
import { enqueue } from "./index";
import { bookingClient } from "../../apps/booking/server/client-identity";
import { requestManageLinks } from "../../apps/booking/server/manage-recovery";

test("canonical identity and authenticated ingress reject spoofed forwarding", () => {
  assert.deepEqual(clientIdentity("::ffff:192.0.2.1"), clientIdentity("192.0.2.1"));
  assert.deepEqual(clientIdentity("2001:db8::1"), clientIdentity("2001:0db8:0:0:0:0:0:1"));
  for (const ip of ["192.0.2.001", "1.2.3.4, 5.6.7.8", "abc", "fe80::1%eth0"]) assert.throws(() => clientIdentity(ip));
  process.env.BOOKING_INGRESS_KEY = "a".repeat(64);
  assert.throws(() => bookingClient(new Request("http://fixture", { headers: {"x-real-ip":"192.0.2.1","cf-connecting-ip":"192.0.2.1"} })));
  assert.deepEqual(bookingClient(new Request("http://fixture", {headers:{"x-dd-booking-ingress-key":"a".repeat(64),"x-dd-client-ip":"192.0.2.1"}})), clientIdentity("192.0.2.1"));
});

test("atomic recovery fairness, concurrent UUID/email rotation, rollback, retries and lifecycle lane", { skip: !process.env.SECURITY_TEST_DATABASE_URL }, async () => {
  const f = await securityFixture();
  Object.assign(process.env, { BOOKING_DATABASE_URL: f.url, PRETIX_ORGANIZER_SLUG:"fixture", PRETIX_EVENT_SLUG:"studio", PRETIX_ITEM_ID:"1", PRETIX_MANAGE_API_TOKEN:"synthetic", PRETIX_SHOP_BASE:"https://fixture.invalid", MANAGE_RECOVERY_HASH_KEY:"a".repeat(64), PAYLOAD_KEY:"b".repeat(64), RECOVERY_CLIENT_HOURLY:"6", RECOVERY_PREFIX_HOURLY:"10", RECOVERY_CLIENT_OUTSTANDING:"2" });
  const a = clientIdentity("192.0.2.1"), b = clientIdentity("198.51.100.1");
  try {
    const results = await Promise.allSettled(Array.from({length:100}, (_,i) => requestManageLinks(`rotate${i}@example.invalid`, "en", randomUUID(), a)));
    assert.equal(results.filter((r)=>r.status==="fulfilled").length, 2);
    await requestManageLinks("other@example.invalid", "en", "independent", b);
    await Promise.all(Array.from({length:20},()=>requestManageLinks("other@example.invalid", "en", "independent", b)));
    assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM deliveries")).rows[0].n,3);
    assert.equal((await f.pool.query("SELECT sum(hits)::int AS n FROM admission_budgets")).rows[0].n,9);
    await f.pool.query("UPDATE deliveries SET state='sent'");
    await f.pool.query("DELETE FROM admission_budgets");
    // A failed queue allocation rolls back all client/contact/global reservations.
    await f.pool.query("CREATE FUNCTION reject_queue() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE TRIGGER reject_queue BEFORE INSERT ON deliveries FOR EACH ROW EXECUTE FUNCTION reject_queue()");
    await assert.rejects(()=>requestManageLinks("rollback@example.invalid","en","fail",b));
    assert.equal((await f.pool.query("SELECT count(*)::int AS n FROM admission_budgets")).rows[0].n,0);
    await f.pool.query("DROP TRIGGER reject_queue ON deliveries");
    process.env.RECOVERY_CLIENT_OUTSTANDING="20";
    const rotate = await Promise.allSettled(Array.from({length:20},(_,i)=>requestManageLinks(`prefix${i}@example.invalid`,"en",randomUUID(),clientIdentity(`2001:db8::${i+1}`))));
    assert.equal(rotate.filter(r=>r.status==="fulfilled").length,10);
    await enqueue(f.pool,"paid-fixture","paid",{code:"ABCDE"},process.env.PAYLOAD_KEY!);
    let kind = "";
    await pollDelivery(f.pool,process.env.PAYLOAD_KEY!,async row=>{kind=row.kind;},"lifecycle");
    assert.equal(kind,"paid");
    // Ambiguous sends are never resent; retain audit evidence without permanent client denial.
    await f.pool.query("UPDATE deliveries SET state='ambiguous' WHERE kind='recovery'");
    await requestManageLinks("after-ambiguity@example.invalid", "en", "new-link", clientIdentity("203.0.113.2"));
    process.env.RECOVERY_QUEUE_MAX="1";
    const before = (await f.pool.query("SELECT sum(hits)::int AS n FROM admission_budgets")).rows[0].n;
    await assert.rejects(()=>requestManageLinks("full@example.invalid","en","full",clientIdentity("203.0.113.1")), AdmissionDenied);
    assert.equal((await f.pool.query("SELECT sum(hits)::int AS n FROM admission_budgets")).rows[0].n,before);
  } finally { await f.close(); }
});
