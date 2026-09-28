import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { DateTime } from "luxon";
import { startRentalCheckout, type RentalCheckoutInput, RentalConflict } from "../../server/rental-checkout";
import { quoteInterval, type Availability } from "./booking";

const key = "12345678-1234-1234-1234-123456789abc";
const writeToken = "synthetic-write-token";
const code = "R" + createHmac("sha256", writeToken).update(key).digest("hex").slice(0, 15).toUpperCase();
const day = DateTime.now().setZone("Europe/Copenhagen").plus({ days: 20 }).startOf("day");
const date = day.toISODate()!;
const availability: Availability = {
  date, source: "pretix", currency: "DKK", checkedAt: DateTime.utc().toISO()!,
  fullDayDiscount: { id: 7, discountedHours: 2 },
  slots: Array.from({ length: 14 }, (_, index) => ({
    id: String(index + 1),
    start: day.set({ hour: 8 + index }).toUTC().toISO()!,
    end: day.set({ hour: 9 + index }).toUTC().toISO()!,
    available: true, priceOre: 25_000,
  })),
};

function input(purpose = "Synthetic rental", hours = 2): RentalCheckoutInput {
  return {
    date, startId: "1", hours, acceptedQuote: quoteInterval(availability, "1", hours)!,
    termsAccepted: true, marketingOptIn: false, marketingLanguage: "en",
    details: { name: "Synthetic Test", email: "synthetic@example.invalid", phone: "+4512345678",
      customerType: "private", attendeeCount: 2, purpose, company: "", comment: "" },
  };
}

function configure() {
  Object.assign(process.env, {
    PREVIEW: "false", PAYMENT_ENVIRONMENT: "sandbox", PAYMENT_RELEASE_ENABLED: "false",
    PRETIX_EVENTS_CHECKOUT_ENABLED: "true", PRETIX_ORGANIZER_SLUG: "synthetic",
    PRETIX_EVENT_SLUG: "studio", PRETIX_ITEM_ID: "9", PRETIX_MANAGE_WRITE_API_TOKEN: writeToken,
    PRETIX_MANAGE_API_TOKEN: "synthetic-read-token", PRETIX_SHOP_BASE: "https://shop.example.invalid",
    PRETIX_API_BASE: "https://api.example.invalid",
  });
}

type TestOrder = Record<string, unknown> & { status: string; api_meta: Record<string, unknown> };
function orderFrom(payload: Record<string, unknown>, hourlyOre = 25_000): TestOrder {
  const positions = payload.positions as Array<Record<string, unknown>>;
  const total = positions.filter(position => position.discount == null).length * hourlyOre / 100;
  return {
    code, event: "studio", status: "n", testmode: true, email: payload.email,
    total: `${total}.00`, expires: "2099-01-01T00:00:00Z",
    url: `https://shop.example.invalid/synthetic/studio/order/${code}/`,
    api_meta: payload.api_meta as Record<string, unknown>,
    positions: positions.map(position => ({ ...position, price: position.discount ? "0.00" : `${hourlyOre / 100}.00` })),
    payments: [{ provider: "stripe", amount: `${total}.00`, state: "created",
      payment_url: `https://shop.example.invalid/synthetic/studio/order/${code}/pay/change` }],
  };
}

test("concurrent conflicting key cannot expire the winning pending reservation", async () => {
  configure();
  let held: TestOrder | null = null;
  let lookups = 0;
  let releaseLookups!: () => void;
  const bothLookedUp = new Promise<void>(resolve => { releaseLookups = resolve; });
  let expiries = 0;
  const request = async (url: URL, _token: string, method = "GET", body?: unknown) => {
    if (method === "GET") {
      lookups += 1;
      if (lookups <= 2) {
        if (lookups === 2) releaseLookups();
        await bothLookedUp;
        return Response.json({}, { status: 404 });
      }
      return held ? Response.json(held) : Response.json({}, { status: 404 });
    }
    if (url.pathname.endsWith("mark_expired/")) {
      expiries += 1;
      if (held) held.status = "e";
      return Response.json({});
    }
    const payload = body as Record<string, unknown>;
    const candidate = orderFrom(payload);
    if (payload.simulate) return Response.json(candidate);
    if (held) return Response.json({}, { status: 409 });
    held = candidate;
    return Response.json(candidate);
  };
  const dependencies = { availability: async () => availability, request };
  const results = await Promise.allSettled([
    startRentalCheckout(input("First purpose"), key, dependencies),
    startRentalCheckout(input("Second purpose"), key, dependencies),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected" && result.reason instanceof RentalConflict).length, 1);
  assert.equal((held as TestOrder | null)?.status, "n");
  assert.equal(expiries, 0);
});

function service(options: {
  lostResponse?: boolean;
  orderChange?: (order: TestOrder) => void;
  simulationChange?: (order: TestOrder) => void;
  createStatus?: number;
  available?: Availability;
  simultaneousLookups?: boolean;
} = {}) {
  let held: TestOrder | null = null;
  let creations = 0;
  let expiries = 0;
  let simulations = 0;
  let initialReads = 0;
  let releaseInitial!: () => void;
  const bothLookedUp = new Promise<void>(resolve => { releaseInitial = resolve; });
  const request = async (url: URL, _token: string, method = "GET", body?: unknown) => {
    if (method === "GET") {
      if (options.simultaneousLookups && initialReads++ < 2) {
        if (initialReads === 2) releaseInitial();
        await bothLookedUp;
        return Response.json({}, { status: 404 });
      }
      return held ? Response.json(held) : Response.json({}, { status: 404 });
    }
    if (url.pathname.endsWith("mark_expired/")) {
      expiries += 1;
      if (held) held.status = "e";
      return Response.json({});
    }
    const payload = body as Record<string, unknown>;
    const candidate = orderFrom(payload, options.available?.slots[0].priceOre);
    if (payload.simulate) {
      simulations += 1;
      options.simulationChange?.(candidate);
      return Response.json(candidate);
    }
    if (options.createStatus) return Response.json({}, { status: options.createStatus });
    if (held) return Response.json({}, { status: 409 });
    creations += 1;
    options.orderChange?.(candidate);
    held = candidate;
    if (options.lostResponse) throw new Error("synthetic response lost after commit");
    return Response.json(candidate);
  };
  return {
    dependencies: { availability: async () => options.available ?? availability, request },
    get order() { return held; }, get creations() { return creations; },
    get expiries() { return expiries; }, get simulations() { return simulations; },
    setOrder(order: TestOrder) { held = order; },
  };
}

test("same-intent retry returns one reservation and the same handoff", async () => {
  configure();
  const fake = service({ simultaneousLookups: true });
  const [first, second] = await Promise.all([
    startRentalCheckout(input(), key, fake.dependencies),
    startRentalCheckout(input(), key, fake.dependencies),
  ]);
  assert.equal(fake.creations, 1);
  assert.equal(first.paymentUrl, second.paymentUrl);
  assert.equal(fake.expiries, 0);
});

test("lost create response recovers the committed order on retry", async () => {
  configure();
  const fake = service({ lostResponse: true });
  const first = await startRentalCheckout(input(), key, fake.dependencies);
  const second = await startRentalCheckout(input(), key, fake.dependencies);
  assert.equal(first.paymentUrl, second.paymentUrl);
  assert.equal(first.created, false);
  assert.equal(second.created, false);
  assert.equal(fake.creations, 1);
  assert.equal(fake.expiries, 0);
});

test("sequential conflicting reuse neither mutates nor reveals the handoff", async () => {
  configure();
  const fake = service();
  const first = await startRentalCheckout(input(), key, fake.dependencies);
  await assert.rejects(startRentalCheckout(input("Changed purpose"), key, fake.dependencies),
    error => error instanceof RentalConflict && error.message === "Submission changed" &&
      !error.message.includes(first.paymentUrl));
  assert.equal(fake.creations, 1);
  assert.equal(fake.expiries, 0);
  assert.equal((fake.order as TestOrder | null)?.status, "n");
});

test("expired and paid reservations cannot be revived or expired by retry", async () => {
  configure();
  for (const status of ["e", "p"]) {
    const fake = service();
    const first = await startRentalCheckout(input(), key, fake.dependencies);
    (fake.order as TestOrder).status = status;
    await assert.rejects(startRentalCheckout(input(), key, fake.dependencies), RentalConflict);
    assert.equal(fake.expiries, 0);
    assert.equal((fake.order as TestOrder).status, status);
    assert.ok(first.paymentUrl);
  }
});

test("post-create mismatch expires only this intent's pending order", async () => {
  configure();
  const fake = service({ orderChange: order => { order.total = "999.00"; } });
  await assert.rejects(startRentalCheckout(input(), key, fake.dependencies), RentalConflict);
  assert.equal(fake.creations, 1);
  assert.equal(fake.expiries, 1);
  assert.equal((fake.order as TestOrder).status, "e");
});

test("simulation rejects wrong positions, product, price and discount before create", async () => {
  configure();
  for (const change of [
    (order: TestOrder) => { (order.positions as Array<Record<string, unknown>>)[0].subevent = 99; },
    (order: TestOrder) => { (order.positions as Array<Record<string, unknown>>)[0].item = 99; },
    (order: TestOrder) => { (order.positions as Array<Record<string, unknown>>)[0].price = "249.00"; },
    (order: TestOrder) => { order.total = "499.00"; },
  ]) {
    const fake = service({ simulationChange: change });
    await assert.rejects(startRentalCheckout(input(), key, fake.dependencies), RentalConflict);
    assert.equal(fake.creations, 0);
    assert.equal(fake.expiries, 0);
  }
});

test("inventory conflict and stale quote return no handoff or partial reservation", async () => {
  configure();
  const unavailable = { ...availability, slots: availability.slots.map((slot, index) =>
    index === 1 ? { ...slot, available: false } : slot) };
  const stale = service({ available: unavailable });
  await assert.rejects(startRentalCheckout(input(), key, stale.dependencies), RentalConflict);
  assert.equal(stale.simulations, 0);
  const rejected = service({ createStatus: 409 });
  await assert.rejects(startRentalCheckout(input(), key, rejected.dependencies), RentalConflict);
  assert.equal(rejected.creations, 0);
  assert.equal(rejected.order, null);
});

test("full-day selection uses configured price, final positions and rule identity", async () => {
  configure();
  for (const hourlyOre of [25_000, 31_000]) {
    const priced = { ...availability, slots: availability.slots.map(slot => ({ ...slot, priceOre: hourlyOre })) };
    const fake = service({ available: priced });
    const body = { ...input("Synthetic full day", 14), acceptedQuote: quoteInterval(priced, "1", 14)! };
    await startRentalCheckout(body, key, fake.dependencies);
    const held = fake.order as TestOrder;
    const positions = held.positions as Array<Record<string, unknown>>;
    assert.deepEqual(positions.map(position => position.subevent), Array.from({ length: 14 }, (_, index) => index + 1));
    assert.deepEqual(positions.filter(position => position.discount != null).map(position => position.subevent), [13, 14]);
    assert.ok(positions.filter(position => position.discount != null).every(position => position.discount === 7 && position.price === "0.00"));
    assert.equal(held.total, `${12 * hourlyOre / 100}.00`);
    assert.equal(held.api_meta.ttd_discount_id, 7);
    assert.equal(fake.simulations, 1);
  }
});

test("short bookings receive no full-day discount", async () => {
  configure();
  const fake = service();
  await startRentalCheckout(input("Short rental", 13), key, fake.dependencies);
  const positions = (fake.order as TestOrder).positions as Array<Record<string, unknown>>;
  assert.equal(positions.length, 13);
  assert.ok(positions.every(position => position.discount == null));
  assert.equal((fake.order as TestOrder).total, "3250.00");
});

test("full-day simulation rejects a discount on the wrong positions", async () => {
  configure();
  const fake = service({ simulationChange: order => {
    const positions = order.positions as Array<Record<string, unknown>>;
    positions[0].discount = 7;
    positions[0].price = "0.00";
    positions[12].discount = null;
    positions[12].price = "250.00";
  } });
  await assert.rejects(startRentalCheckout(input("Full day", 14), key, fake.dependencies), RentalConflict);
  assert.equal(fake.creations, 0);
});

test("created order with an incomplete interval is expired before handoff", async () => {
  configure();
  const fake = service({ orderChange: order => {
    (order.positions as Array<Record<string, unknown>>)[1].subevent = 99;
  } });
  await assert.rejects(startRentalCheckout(input(), key, fake.dependencies), RentalConflict);
  assert.equal(fake.expiries, 1);
  assert.equal((fake.order as TestOrder).status, "e");
});

test("payment completed during mismatch cleanup is never expired", async () => {
  configure();
  let reads = 0;
  let expiries = 0;
  let held: TestOrder | null = null;
  const request = async (url: URL, _token: string, method = "GET", body?: unknown) => {
    if (method === "GET") {
      reads += 1;
      if (reads === 2 && held) held.status = "p";
      return held ? Response.json(held) : Response.json({}, { status: 404 });
    }
    if (url.pathname.endsWith("mark_expired/")) { expiries += 1; return Response.json({}); }
    const payload = body as Record<string, unknown>;
    const candidate = orderFrom(payload);
    if (payload.simulate) return Response.json(candidate);
    candidate.total = "999.00";
    held = candidate;
    return Response.json(candidate);
  };
  await assert.rejects(startRentalCheckout(input(), key, { availability: async () => availability, request }), RentalConflict);
  assert.equal(expiries, 0);
  assert.equal((held as TestOrder | null)?.status, "p");
});
