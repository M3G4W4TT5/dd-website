import assert from "node:assert/strict";
import test from "node:test";
import { canManageBooking, cancellationDeadline } from "./cancellation";

test("changes and cancellation close at the exact 24-hour boundary", () => {
  const start = "2026-10-02T10:00:00+02:00";
  assert.equal(canManageBooking(start, "2026-10-01T09:59:59.999+02:00"), true);
  assert.equal(canManageBooking(start, "2026-10-01T10:00:00+02:00"), false);
  assert.equal(canManageBooking(start, "2026-10-01T10:00:01+02:00"), false);
});

test("the cutoff is 24 elapsed hours across the Copenhagen autumn clock change", () => {
  const start = "2026-10-25T10:00:00+01:00";
  assert.equal(cancellationDeadline(start)?.toISO(), "2026-10-24T09:00:00.000Z");
  assert.equal(canManageBooking(start, "2026-10-24T10:59:59.999+02:00"), true);
  assert.equal(canManageBooking(start, "2026-10-24T11:00:00+02:00"), false);
  assert.equal(canManageBooking(start, "2026-10-24T11:00:01+02:00"), false);
});

test("invalid timestamps cannot authorize booking management", () => {
  assert.equal(canManageBooking("invalid", "2026-10-01T09:00:00+02:00"), false);
  assert.equal(canManageBooking("2026-10-02T10:00:00+02:00", "invalid"), false);
});
