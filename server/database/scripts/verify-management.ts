import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import { database, decrypt } from "../index";
const read = (name: string) =>
  parseEnv(readFileSync(`infra/local/${name}.env`, "utf8")) as Record<
    string,
    string
  >;
const migration = database(
  read("migration").BOOKING_MANAGEMENT_MIGRATOR_DATABASE_URL,
);
const schema = "fixture_" + randomUUID().replaceAll("-", "");
await migration.query(
  `CREATE SCHEMA ${schema}; SET search_path=${schema},pg_catalog`,
);
await migration.query(
  readFileSync("server/database/migrations/001-management.sql", "utf8"),
);
await migration.query(
  `GRANT USAGE ON SCHEMA ${schema} TO booking_web_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO booking_web_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO booking_web_runtime`,
);
const url = new URL(read("booking-web").BOOKING_DATABASE_URL);
url.searchParams.set("options", `-c search_path=${schema},pg_catalog`);
Object.assign(process.env, {
  BOOKING_DATABASE_URL: url.toString(),
  PAYLOAD_KEY: "a".repeat(64),
  MANAGE_RECOVERY_HASH_KEY: "fixture-hash-key-not-a-secret-00000000",
  PRETIX_API_BASE: "https://fixture.invalid",
  PRETIX_ORGANIZER_SLUG: "fixture",
  PRETIX_EVENT_SLUG: "studio",
  PRETIX_ITEM_ID: "1",
  PRETIX_API_TOKEN: "fixture-availability",
  PRETIX_MANAGE_API_TOKEN: "fixture-read",
  PRETIX_MANAGE_WRITE_API_TOKEN: "fixture-write",
  BOOKING_SELF_SERVICE_ENABLED: "true",
  PRETIX_SHOP_BASE: "https://fixture.invalid/fixture/studio/",
  BOOKING_PUBLIC_BASE_URL: "https://studio.fixture.invalid",
  NODE_ENV: "test",
});
const now = Date.now() + 7 * 86400000,
  start = new Date(Math.floor(now / 3600000) * 3600000).toISOString(),
  end = new Date(Date.parse(start) + 3600000).toISOString();
let order = {
  code: "ABCDE",
  event: "studio",
  email: "fixture@example.com",
  locale: "da",
  status: "p",
  total: "350.00",
  positions: [{ id: 1, item: 1, subevent: 1 }],
  payments: [
    { local_id: 1, state: "confirmed", amount: "350.00", provider: "stripe" },
  ],
  refunds: [] as { local_id: number; state: string; amount: string }[],
};
let posts = 0,
  ambiguous = false;
const newStart = new Date(Date.parse(start) + 86400000).toISOString(),
  newEnd = new Date(Date.parse(end) + 86400000).toISOString();
const dates = [
  { id: 1, date_from: start, date_to: end, active: true, is_public: true },
  {
    id: 2,
    date_from: newStart,
    date_to: newEnd,
    active: true,
    is_public: true,
  },
];
let staleRead = false,
  detailReads = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(String(input));
  assert.equal(
    u.origin,
    "https://fixture.invalid",
    "No real provider access permitted",
  );
  if (init?.method === "POST") {
    posts++;
    if (u.pathname.endsWith("/change/")) {
      const body = JSON.parse(String(init.body));
      assert.equal(body.send_email, false);
      order = {
        ...order,
        positions: [
          {
            ...order.positions[0],
            subevent: body.patch_positions[0].body.subevent,
          },
        ],
      };
    } else
      order = {
        ...order,
        status: "c",
        refunds: [{ local_id: 1, state: "created", amount: "350.00" }],
      };
    if (ambiguous)
      throw new TypeError("Fixture timeout after remote acceptance");
    return Response.json({});
  }
  const page = (results: unknown[]) => Response.json({ next: null, results });
  if (u.pathname.endsWith("/events/")) return page([]);
  if (u.pathname.endsWith("/items/1/"))
    return Response.json({ id: 1, active: true, default_price: "350.00" });
  if (u.pathname.endsWith("/subevents/")) return page(dates);
  if (u.pathname.endsWith("/quotas/"))
    return page(
      dates.map((d) => ({
        subevent: d.id,
        size: 1,
        items: [1],
        closed: false,
        available: true,
        available_number: 1,
      })),
    );
  if (u.pathname.endsWith("/discounts/"))
    return page([
      {
        active: true,
        all_sales_channels: true,
        available_from: null,
        available_until: null,
        subevent_mode: "distinct",
        subevent_date_from: null,
        subevent_date_until: null,
        condition_all_products: false,
        condition_limit_products: [1],
        condition_min_count: 14,
        condition_min_value: "0.00",
        benefit_same_products: true,
        benefit_discount_matching_percent: "100.00",
        benefit_only_apply_to_cheapest_n_matches: 2,
      },
    ]);
  if (u.pathname.includes("/subevents/"))
    return Response.json(
      dates.find((d) => u.pathname.endsWith("/" + d.id + "/")),
    );
  if (u.pathname.endsWith("/orders/ABCDE/")) {
    if (staleRead && ++detailReads === 2)
      order = { ...order, positions: [{ ...order.positions[0], subevent: 2 }] };
    return Response.json(order);
  }
  if (u.pathname.endsWith("/orders/"))
    return Response.json({
      next: null,
      results: [
        {
          ...order,
          url: "https://fixture.invalid/fixture/studio/order/ABCDE/",
        },
      ],
    });
  throw new Error("Unexpected fixture endpoint");
};
const { bookingDb, intakeWebhook, observeOrder, currentLifecycleMessage } =
  await import("../../../apps/booking/server/notifications");
const { cancelManagedBooking, changeManagedBooking, getManagedBooking } =
  await import("../../../apps/booking/server/pretix-live-management");
const { deliverAccess, consumeManageLink, requestManageLinks } =
  await import("../../../apps/booking/server/manage-recovery");
const { authorizedSessionEmail } =
  await import("../../../apps/booking/server/manage-session");
const p = bookingDb();
try {
  await assert.rejects(() => getManagedBooking("ABCDE", "other@example.com"));
  let text = "",
    recipient = "",
    kind = "";
  const send = async (k: string, m: any) => {
    kind = k;
    text = m.text;
    recipient = m.to;
  };
  await deliverAccess(
    "paid",
    { code: "ABCDE", email: "attacker@example.com", language: "en" },
    send,
    "fixture",
  );
  assert.equal(recipient, order.email);
  assert.equal(kind, "paid");
  assert.match(text, /Din TTD/);
  const token = text.match(/#token=([A-Za-z0-9_-]{43})/)![1];
  assert.equal(
    (await p.query("SELECT token_hash FROM manage_link_tokens")).rows[0]
      .token_hash,
    createHash("sha256").update(token).digest("hex"),
  );
  const results = await Promise.all([
    consumeManageLink(token),
    consumeManageLink(token),
  ]);
  const access = results.find(Boolean)!;
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(
    await authorizedSessionEmail("ABCDE", access.session),
    order.email,
  );
  assert.equal(await authorizedSessionEmail("OTHER", access.session), null);
  await p.query(
    "UPDATE manage_sessions SET expires_at=now()-interval '1 second'",
  );
  assert.equal(await authorizedSessionEmail("ABCDE", access.session), null);
  await requestManageLinks(order.email, "en", "retry-one");
  await requestManageLinks(order.email, "en", "retry-one");
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='recovery'",
      )
    ).rows[0].n,
    1,
  );
  // A consumed or expired token must permit another request in the same hour.
  await requestManageLinks(order.email, "en", "replacement-after-consumption");
  await p.query(
    "UPDATE manage_link_tokens SET expires_at=now()-interval '1 second'",
  );
  // Reset only the fixture request counter: first two calls include a retry.
  await p.query("UPDATE manage_link_requests SET request_count=1");
  await requestManageLinks(order.email, "en", "replacement-after-expiry");
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='recovery'",
      )
    ).rows[0].n,
    3,
  );
  await requestManageLinks(order.email, "en", "allowed-third");
  await requestManageLinks(order.email, "en", "blocked-fourth");
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='recovery'",
      )
    ).rows[0].n,
    4,
  );
  // Pending and non-rental orders cannot create paid confirmation mail.
  const original = { ...order };
  order = { ...order, status: "n" };
  await assert.rejects(() =>
    deliverAccess("paid", { code: "ABCDE" }, send, "fixture"),
  );
  order = { ...original, positions: [{ id: 1, item: 2, subevent: 1 }] };
  await assert.rejects(() =>
    deliverAccess("paid", { code: "ABCDE" }, send, "fixture"),
  );
  order = original;
  const before = await getManagedBooking("ABCDE", order.email);
  await observeOrder("ABCDE", async () => before);
  for (const id of ["later", "earlier", "later"])
    await intakeWebhook({
      notification_id: id,
      organizer: "fixture",
      event: "studio",
      code: "ABCDE",
      action: "order.paid",
    });
  assert.equal(
    (await p.query("SELECT count(*)::int n FROM webhook_inbox")).rows[0].n,
    2,
  );
  await Promise.all([
    observeOrder("ABCDE", async () => before),
    observeOrder("ABCDE", async () => before),
  ]);
  assert.equal(
    (await p.query("SELECT count(*)::int n FROM deliveries WHERE kind='paid'"))
      .rows[0].n,
    1,
  );
  // Live adapter preserves duration/price and suppresses native mail. Concurrent repeats write once.
  await assert.rejects(() =>
    changeManagedBooking(
      "ABCDE",
      order.email,
      newStart,
      new Date(Date.parse(newEnd) + 3600000).toISOString(),
    ),
  );
  order = { ...original, total: "700.00" };
  await assert.rejects(() =>
    changeManagedBooking("ABCDE", order.email, newStart, newEnd),
  );
  order = original;
  staleRead = true;
  detailReads = 0;
  await assert.rejects(() =>
    changeManagedBooking("ABCDE", order.email, newStart, newEnd),
  );
  assert.equal(posts, 0);
  staleRead = false;
  order = original;
  const changes = await Promise.allSettled([
    changeManagedBooking("ABCDE", order.email, newStart, newEnd),
    changeManagedBooking("ABCDE", order.email, newStart, newEnd),
  ]);
  assert.equal(changes.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(posts, 1);
  await observeOrder("ABCDE", () => getManagedBooking("ABCDE", order.email));
  // Keep subsequent transition-count assertions isolated from this independently verified change.
  await p.query(
    "DELETE FROM deliveries WHERE kind='change'; DELETE FROM operations WHERE state='verified'",
  );
  posts = 0;
  ambiguous = true;
  const cancellations = await Promise.allSettled([
    cancelManagedBooking("ABCDE", order.email),
    cancelManagedBooking("ABCDE", order.email),
  ]);
  assert.ok(cancellations.every((r) => r.status === "rejected"));
  assert.equal(posts, 1);
  assert.equal(
    (await p.query("SELECT state FROM operations")).rows[0].state,
    "ambiguous",
  );
  await observeOrder("ABCDE", () => getManagedBooking("ABCDE", order.email));
  assert.equal(
    (await p.query("SELECT state FROM operations")).rows[0].state,
    "verified",
  );
  await assert.rejects(() => cancelManagedBooking("ABCDE", order.email));
  assert.equal(posts, 1);
  await observeOrder("ABCDE", () => getManagedBooking("ABCDE", order.email));
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='cancellation'",
      )
    ).rows[0].n,
    1,
  );
  order = {
    ...order,
    refunds: [{ local_id: 1, state: "done", amount: "350.00" }],
  };
  await observeOrder("ABCDE", () => getManagedBooking("ABCDE", order.email));
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='refund'",
      )
    ).rows[0].n,
    2,
  );
  // Delayed refund queue: pending and completed must not both render Completed.
  const refundSnapshot = (
    await p.query(
      "SELECT state,revision FROM order_snapshots WHERE order_code='ABCDE'",
    )
  ).rows[0];
  const refunds = (
    await p.query("SELECT payload FROM deliveries WHERE kind='refund'")
  ).rows;
  const renderedRefunds = refunds
    .map((row) => {
      const payload = decrypt<{ observed: typeof before; revision: number }>(
        row.payload,
        process.env.PAYLOAD_KEY!,
      );
      return currentLifecycleMessage(
        "refund",
        payload.observed,
        refundSnapshot.state,
        order.email,
        "da",
        payload.revision,
        Number(refundSnapshot.revision),
      );
    })
    .filter(Boolean);
  assert.equal(renderedRefunds.length, 1);
  assert.match(renderedRefunds[0]!.text, /Gennemført/);
  const changed = {
    ...before,
    firstHourIso: new Date(Date.parse(start) + 86400000).toISOString(),
    endIso: new Date(Date.parse(end) + 86400000).toISOString(),
  };
  await observeOrder("ABCDE", async () => changed);
  await observeOrder("ABCDE", async () => before);
  await observeOrder("ABCDE", async () => changed);
  assert.equal(
    (
      await p.query(
        "SELECT count(*)::int n FROM deliveries WHERE kind='change'",
      )
    ).rows[0].n,
    2,
  );
  const finalSnapshot = (
    await p.query(
      "SELECT state,revision FROM order_snapshots WHERE order_code='ABCDE'",
    )
  ).rows[0];
  const queuedChanges = (
    await p.query("SELECT payload FROM deliveries WHERE kind='change'")
  ).rows;
  const renderedChanges = queuedChanges
    .map((row) => {
      const payload = decrypt<{ observed: typeof before; revision: number }>(
        row.payload,
        process.env.PAYLOAD_KEY!,
      );
      return currentLifecycleMessage(
        "change",
        payload.observed,
        finalSnapshot.state,
        order.email,
        "en",
        payload.revision,
        Number(finalSnapshot.revision),
      );
    })
    .filter(Boolean);
  assert.equal(
    renderedChanges.length,
    1,
    "A/B/A delayed queue coalesces superseded revisions",
  );
  assert.match(renderedChanges[0]!.text, new RegExp(changed.firstHourIso));
  console.log(
    "PASS isolated management: authoritative recipient/language, paid/rental gates, hash-only single-use recovery, scoped/expired sessions, duplicate/reordered intake, stale/price/duration rejection, concurrent changes/refund timeout, reconciliation, no repeat remote write and revision-based transitions",
  );
} finally {
  globalThis.fetch = realFetch;
  await p.end();
  await migration.query(`DROP SCHEMA ${schema} CASCADE`);
  await migration.end();
}
