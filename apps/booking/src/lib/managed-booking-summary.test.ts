import assert from "node:assert/strict";
import test from "node:test";
import { bookingSummaryLabels } from "./managed-booking-summary";

const booking = { reference: "ABC12", firstHourIso: "2026-10-13T08:00:00Z", endIso: "2026-10-13T10:00:00Z" };

test("booking labels use Copenhagen time and localised date and duration", () => {
  assert.deepEqual(bookingSummaryLabels(booking, "en"), {
    date: "Date: 13 October 2026", time: "Time: 10:00", duration: "Duration: 2 hours",
  });
  assert.deepEqual(bookingSummaryLabels(booking, "da"), {
    date: "Dato: 13 oktober 2026", time: "Tid: 10:00", duration: "Varighed: 2 timer",
  });
  const winter = { ...booking, firstHourIso: "2026-12-01T09:00:00Z", endIso: "2026-12-01T10:00:00Z" };
  assert.equal(bookingSummaryLabels(winter, "en").time, "Time: 10:00");
  assert.equal(bookingSummaryLabels(winter, "en").duration, "Duration: 1 hour");
  assert.equal(bookingSummaryLabels(winter, "da").duration, "Varighed: 1 time");
});

test("duration follows elapsed booked hours and date follows Copenhagen across UTC midnight", () => {
  const changingClock = { ...booking, firstHourIso: "2026-10-25T00:00:00Z", endIso: "2026-10-25T03:00:00Z" };
  assert.equal(bookingSummaryLabels(changingClock, "en").duration, "Duration: 3 hours");
  assert.equal(bookingSummaryLabels({ ...booking, firstHourIso: "2026-10-12T23:00:00Z" }, "en").date, "Date: 13 October 2026");
});
