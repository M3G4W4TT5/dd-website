import assert from "node:assert/strict";
import test from "node:test";
import { firstBookedHour, type RentalDate, type RentalOrder } from "./pretix-order-model";

const order: RentalOrder = {
  code: "ABCDE", event: "studio", secret: "example-only-secret", status: "p",
  positions: [{ item: 1, subevent: 11 }, { item: 1, subevent: 10 }],
};
const dates: RentalDate[] = [
  { id: 10, date_from: "2026-10-25T10:00:00+01:00", date_to: "2026-10-25T11:00:00+01:00" },
  { id: 11, date_from: "2026-10-25T11:00:00+01:00", date_to: "2026-10-25T12:00:00+01:00" },
];

test("the first booked hour comes from pretix dates, independent of position order", () => {
  assert.equal(firstBookedHour(order, dates, 1), "2026-10-25T09:00:00.000Z");
});

test("mixed, missing, duplicate or nonconsecutive rental positions fail closed", () => {
  assert.equal(firstBookedHour({ ...order, status: "c" }, dates, 1), null);
  assert.equal(firstBookedHour({ ...order, positions: [{ item: 2, subevent: 10 }] }, dates, 1), null);
  assert.equal(firstBookedHour(order, dates.slice(0, 1), 1), null);
  assert.equal(firstBookedHour({ ...order, positions: [{ item: 1, subevent: 10 }, { item: 1, subevent: 10 }] }, dates, 1), null);
  assert.equal(firstBookedHour(order, [{ ...dates[0] }, { ...dates[1], date_from: "2026-10-25T12:00:00+01:00" }], 1), null);
});
