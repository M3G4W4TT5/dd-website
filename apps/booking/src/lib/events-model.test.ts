import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { checkoutPath, remainingPlaces, normalizeEvent, occupiesRoom, overlaps, type RawEvent, type RawDate, type RawItem, type RawQuota } from "./events-model";

const now = DateTime.fromISO("2026-10-01T12:00:00Z");
const event: RawEvent = { slug: "dance", name: { da: "Dans", en: "Dance" }, live: true, is_public: true, has_subevents: true, date_from: "2026-10-01T19:00:00+02:00", date_to: null, location: { da: "TTD Studio" }, meta_data: {} };
const date: RawDate = { id: 42, name: { da: "Dans", en: "Dance" }, active: true, is_public: true, date_from: "2026-10-28T19:00:00+01:00", date_to: "2026-10-28T22:00:00+01:00", location: null, frontpage_text: { da: "Beskrivelse", en: "Description" } };
const item: RawItem = { id: 7, name: { da: "Billet", en: "Ticket" }, active: true, default_price: "125.00" };
const quota: RawQuota = { subevent: 42, items: [7], closed: false, available: true, available_number: 4 };

test("series dates normalize individually with Copenhagen winter time and exact checkout target", () => {
  const occurrence = normalizeEvent(event, date, [item], [quota], now)!;
  assert.equal(occurrence.key, "dance:42");
  assert.equal(occurrence.start, "2026-10-28T19:00:00+01:00");
  assert.equal(checkoutPath("ttd", occurrence), "/ttd/dance/?subevent=42");
  assert.equal(occurrence.descriptionEn, "Description");
  assert.equal(occurrence.status, "available");
  assert.equal(occurrence.tickets[0].remaining, 4);
  assert.equal(occurrence.roomVerified, false);
  assert.equal(normalizeEvent(event, { ...date, meta_data: { ttd_room_verified: true } }, [item], [quota], now)?.roomVerified, true);
});
test("single event has its own checkout and does not invent dates", () => {
  const workshop = { ...event, slug: "workshop", has_subevents: false, date_from: "2026-10-03T12:00:00+02:00", date_to: "2026-10-03T20:00:00+02:00" };
  const occurrence = normalizeEvent(workshop, null, [item], [{ ...quota, subevent: null }], now)!;
  assert.equal(occurrence.dateId, null);
  assert.equal(checkoutPath("ttd", occurrence), "/ttd/workshop/");
});
test("visibility, past dates, sold out and test mode are honest", () => {
  assert.equal(normalizeEvent({ ...event, live: false }, date, [item], [quota], now), null);
  assert.equal(normalizeEvent(event, { ...date, is_public: false }, [item], [quota], now), null);
  assert.equal(normalizeEvent(event, { ...date, meta_data: { ttd_cancelled: true } }, [item], [quota], now), null);
  assert.equal(normalizeEvent(event, { ...date, date_to: "2026-09-30T22:00:00+02:00" }, [item], [quota], now), null);
  assert.equal(normalizeEvent(event, date, [item], [{ ...quota, available_number: 0, available: false }], now)?.status, "sold-out");
  assert.equal(normalizeEvent({ ...event, testmode: true }, date, [item], [quota], now)?.status, "test");
  assert.equal(normalizeEvent({ ...event, live: false, testmode: true }, date, [item], [quota], now, true)?.status, "test");
});
test("room blocking includes unpublished and sold out dates, and only explicit cancellation releases it", () => {
  const hidden = { ...date, active: false, is_public: false };
  assert.equal(occupiesRoom(event, hidden, "2026-10-28T18:30:00+01:00", "2026-10-28T19:30:00+01:00"), true);
  assert.equal(occupiesRoom(event, { ...hidden, meta_data: { ttd_cancelled: true } }, "2026-10-28T18:30:00+01:00", "2026-10-28T19:30:00+01:00"), false);
  assert.equal(overlaps("2026-10-28T22:00:00+01:00", "2026-10-28T23:00:00+01:00", date.date_from, date.date_to!), false);
});
test("DST start offsets define real instant overlap", () => {
  assert.equal(overlaps("2027-03-28T01:00:00+01:00", "2027-03-28T03:00:00+02:00", "2027-03-28T03:00:00+02:00", "2027-03-28T04:00:00+02:00"), false);
  assert.equal(overlaps("2027-10-31T02:00:00+02:00", "2027-10-31T03:00:00+01:00", "2027-10-31T02:30:00+01:00", "2027-10-31T03:30:00+01:00"), true);
});

test("remaining places count shared, independent and nested quotas without double counting", () => {
  const second = { ...item, id: 8 };
  assert.equal(remainingPlaces([item, second], [{ ...quota, items: [7, 8], available_number: 12 }]), 12);
  assert.equal(remainingPlaces([item, second], [quota, { ...quota, items: [8], available_number: 6 }]), 10);
  assert.equal(remainingPlaces([item, second], [quota, { ...quota, items: [8], available_number: 6 }, { ...quota, items: [7, 8], available_number: 7 }]), 7);
  assert.equal(remainingPlaces([item], [{ ...quota, available_number: null }]), null);
  assert.equal(remainingPlaces([item], [{ ...quota, available_number: 0, available: false }]), 0);
  assert.equal(remainingPlaces([item], [{ ...quota, closed: true }]), 0);
  assert.equal(remainingPlaces([item, second, { ...item, id: 9 }], [{ ...quota, items: [7, 8] }, { ...quota, items: [8, 9] }]), null);
});
