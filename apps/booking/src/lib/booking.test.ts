import assert from "node:assert/strict";
import test from "node:test";
import { quoteInterval, type Availability } from "./booking";

const slots = [9, 10, 11, 12].map((hour) => ({
  id: String(hour),
  start: `2026-10-05T${String(hour).padStart(2, "0")}:00:00.000Z`,
  end: `2026-10-05T${String(hour + 1).padStart(2, "0")}:00:00.000Z`,
  available: true,
  priceOre: 30_000,
}));

const availability: Availability = {
  date: "2026-10-05",
  source: "demo",
  currency: "DKK",
  checkedAt: "2026-10-01T00:00:00.000Z",
  slots,
};

test("one to several consecutive hours form one quote and total", () => {
  const one = quoteInterval(availability, "9", 1);
  const three = quoteInterval(availability, "9", 3);
  assert.equal(one?.totalOre, 30_000);
  assert.deepEqual(three?.slotIds, ["9", "10", "11"]);
  assert.equal(three?.totalOre, 90_000);
  assert.equal(three?.end, slots[2].end);
});

test("a busy middle hour invalidates the entire proposed interval", () => {
  const blocked = {
    ...availability,
    slots: availability.slots.map((slot) =>
      slot.id === "10" ? { ...slot, available: false } : slot,
    ),
  };
  assert.equal(quoteInterval(blocked, "9", 3), null);
});

test("a missing hour or a request past closing cannot produce a quote", () => {
  const gap = { ...availability, slots: availability.slots.filter((slot) => slot.id !== "10") };
  assert.equal(quoteInterval(gap, "9", 2), null);
  assert.equal(quoteInterval(availability, "12", 2), null);
});

test("invalid durations and unknown slot IDs are rejected", () => {
  assert.equal(quoteInterval(availability, "9", 0), null);
  assert.equal(quoteInterval(availability, "9", 9), null);
  assert.equal(quoteInterval(availability, "missing", 1), null);
});
