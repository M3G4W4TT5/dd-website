import { securityFixture } from "../../../../server/database/security-fixture";
import { invalidateCatalog } from "../../server/catalog-work";
import assert from "node:assert/strict";
import test, { before, after } from "node:test";
let fixture: Awaited<ReturnType<typeof securityFixture>>;
before(async()=>{ if (process.env.SECURITY_TEST_DATABASE_URL) fixture=await securityFixture(); });
after(async()=>{ if (fixture) await fixture.close(); });
import { DateTime } from "luxon";
import { getAvailability } from "../../server/availability";
import { quoteInterval } from "./booking";

const bookingDay = DateTime.now().setZone("Europe/Copenhagen").plus({ days: 20 }).startOf("day");
const day = bookingDay.toISODate()!;
const rule = {
  id: 7, active: true, all_sales_channels: true, available_from: null, available_until: null,
  subevent_mode: "distinct", subevent_date_from: null, subevent_date_until: null,
  condition_all_products: false, condition_limit_products: [9], condition_min_count: 14,
  condition_min_value: "0.00", benefit_same_products: true,
  benefit_discount_matching_percent: "100.00", benefit_only_apply_to_cheapest_n_matches: 2,
};

async function withPretix<T>(options: { price?: string; rule?: Record<string, unknown>; override?: string },
                             run: () => Promise<T>): Promise<T> {
  invalidateCatalog();
  Object.assign(process.env, { BOOKING_DATABASE_URL: fixture.url,
    PRETIX_ORGANIZER_SLUG: "synthetic", PRETIX_EVENT_SLUG: "studio", PRETIX_ITEM_ID: "9",
    PRETIX_API_TOKEN: "synthetic-read-token", PRETIX_API_BASE: "https://api.example.invalid",
  });
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/events/")) return Response.json({ results: [], next: null });
    if (path.endsWith("/subevents/")) return Response.json({ results: Array.from({ length: 14 }, (_, index) => ({
      id: index + 1, active: true, is_public: true,
      date_from: bookingDay.set({ hour: 8 + index }).toUTC().toISO()!,
      date_to: bookingDay.set({ hour: 9 + index }).toUTC().toISO()!,
      item_price_overrides: options.override && index === 2
        ? [{ item: 9, disabled: false, price: options.override }] : [],
    })), next: null });
    if (path.endsWith("/quotas/")) return Response.json({ results: Array.from({ length: 14 }, (_, index) => ({
      subevent: index + 1, size: 1, items: [9], closed: false, available: true, available_number: 1,
    })), next: null });
    if (path.endsWith("/items/9/")) return Response.json({ id: 9, active: true, default_price: options.price ?? "250.00" });
    if (path.endsWith("/discounts/")) return Response.json({ results: [{ ...rule, ...options.rule }], next: null });
    throw new Error(`Unexpected synthetic Pretix path: ${path}`);
  };
  try { return await run(); }
  finally { globalThis.fetch = previous; }
}

test("Pretix rule and hourly product determine the full-day quote", { skip: !process.env.SECURITY_TEST_DATABASE_URL }, async () => {
  await withPretix({ price: "310.00" }, async () => {
    const availability = await getAvailability(day);
    assert.equal(availability.source, "pretix");
    assert.deepEqual(availability.fullDayDiscount, { id: 7, discountedHours: 2 });
    assert.equal(availability.slots.length, 14);
    assert.equal(quoteInterval(availability, "1", 14)?.totalOre, 12 * 31_000);
    assert.equal(quoteInterval(availability, "1", 13)?.totalOre, 13 * 31_000);
  });
});

test("unsupported rule and nonuniform prices fail closed", { skip: !process.env.SECURITY_TEST_DATABASE_URL }, async () => {
  for (const changed of [
    { condition_min_count: 13 }, { benefit_discount_matching_percent: "90.00" },
    { benefit_only_apply_to_cheapest_n_matches: 3 }, { active: false },
  ]) await withPretix({ rule: changed }, async () => {
    await assert.rejects(getAvailability(day));
  });
  await withPretix({ override: "260.00" }, async () => {
    await assert.rejects(getAvailability(day), /one hourly price/);
  });
});
