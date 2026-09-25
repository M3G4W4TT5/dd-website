import assert from "node:assert/strict";
import test from "node:test";
import { managedInterval, refundStatus, toOre, type ManagedOrder } from "./managed-order";

const order: ManagedOrder = {
  code: "ABC12", event: "studio", email: "guest@example.com", status: "p", total: "700.00",
  positions: [{ id: 2, item: 3, subevent: 22 }, { id: 1, item: 3, subevent: 21 }],
  payments: [], refunds: [],
};
const dates = [
  { id: 21, date_from: "2026-10-24T08:00:00+02:00", date_to: "2026-10-24T09:00:00+02:00" },
  { id: 22, date_from: "2026-10-24T09:00:00+02:00", date_to: "2026-10-24T10:00:00+02:00" },
];

test("live rental positions are ordered by actual time for atomic rescheduling", () => {
  const interval = managedInterval(order, dates, 3);
  assert.deepEqual(interval.entries.map(({ positionId, subeventId }) => [positionId, subeventId]), [[1, 21], [2, 22]]);
  assert.equal(Date.parse(interval.end) - Date.parse(interval.start), 2 * 3_600_000);
});

test("mixed products and gaps cannot be managed", () => {
  assert.throws(() => managedInterval({ ...order, positions: [{ ...order.positions[0], item: 99 }, order.positions[1]] }, dates, 3));
  assert.throws(() => managedInterval(order, [{ ...dates[0], date_to: "2026-10-24T08:30:00+02:00" }, dates[1]], 3));
});

test("refund status does not confuse cancellation with money returned", () => {
  assert.equal(refundStatus({ ...order, status: "c" }), "none");
  assert.equal(refundStatus({ ...order, status: "c", refunds: [{ local_id: 1, state: "transit", amount: "700.00" }] }), "pending");
  assert.equal(refundStatus({ ...order, status: "c", refunds: [{ local_id: 1, state: "done", amount: "700.00" }] }), "done");
  assert.equal(toOre("700.05"), 70005);
  assert.throws(() => toOre("700.005"));
});
