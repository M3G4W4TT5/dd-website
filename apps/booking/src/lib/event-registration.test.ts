import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { normalizeEvent, type RawDate, type RawEvent, type RawItem, type RawQuota } from "./events-model";
import { eventRegistrationSchema, nativeCartHandoff, registrationTicket, ticketLimit } from "./event-registration";

const event: RawEvent = { slug: "dance", live: true, is_public: true, has_subevents: true, date_from: "2026-10-28T19:00:00+01:00", date_to: null, meta_data: { ttd_room_verified: true } };
const date: RawDate = { id: 42, active: true, is_public: true, date_from: event.date_from, date_to: "2026-10-28T21:00:00+01:00", frontpage_text: null, meta_data: { ttd_room_verified: true } };
const item: RawItem = { id: 7, name: { en: "Ticket", da: "Billet" }, active: true, admission: true, default_price: "200.00" };
const quota: RawQuota = { subevent: 42, items: [7], closed: false, available: true, available_number: 5 };
const now = DateTime.fromISO("2026-10-01T12:00:00Z");
const occurrence = normalizeEvent(event, date, [item], [quota], now)!;
const input = eventRegistrationSchema.parse({ slug: "dance", dateId: 42, itemId: 7, quantity: 3, unitPrice: "200.00", language: "en", name: "Test Buyer", email: "buyer@example.org", phone: "+45 12345678", termsAccepted: true, marketingOptIn: false });

test("mandatory buyer data and terms, positive whole quantities, and optional marketing consent", () => {
  assert.equal(input.marketingOptIn, false);
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(eventRegistrationSchema.safeParse({ ...input, quantity: value }).success, false);
  for (const phone of ["", "      ", "++++++", "abcdef", "12345"]) assert.equal(eventRegistrationSchema.safeParse({ ...input, phone }).success, false);
  assert.equal(eventRegistrationSchema.safeParse({ ...input, termsAccepted: false }).success, false);
  assert.equal(eventRegistrationSchema.safeParse({ ...input, email: "invalid" }).success, false);
});

test("three tickets use one buyer; stale stock, price, products and room conflicts fail closed", () => {
  assert.equal(registrationTicket(occurrence, input)?.id, 7);
  assert.equal(registrationTicket(occurrence, { ...input, quantity: 6 }), null);
  assert.equal(registrationTicket(occurrence, { ...input, unitPrice: "1.00" }), null);
  assert.equal(registrationTicket(occurrence, { ...input, itemId: 999 }), null);
  assert.equal(registrationTicket({ ...occurrence, status: "room-conflict" }, input), null);
  assert.equal(registrationTicket({ ...occurrence, signupAvailable: false }, input), null);
});

test("product minimum and maximum and shared quota limit the quantity", () => {
  const ticket = { ...occurrence.tickets[0], minPerOrder: 2, maxPerOrder: 4 };
  assert.equal(ticketLimit(ticket, 3), 3);
  assert.equal(registrationTicket({ ...occurrence, tickets: [ticket] }, { ...input, quantity: 1 }), null);
  assert.equal(registrationTicket({ ...occurrence, tickets: [ticket] }, { ...input, quantity: 5 }), null);
  assert.equal(registrationTicket({ ...occurrence, tickets: [{ ...ticket, hasVariations: true }] }, input), null);
});

test("event inventory permits buying all 20 places without an application cap", () => {
  const fullEvent = normalizeEvent(event, date, [item], [{ ...quota, available_number: 20 }], now)!;
  const purchase = eventRegistrationSchema.parse({ ...input, quantity: 20 });
  assert.equal(ticketLimit(fullEvent.tickets[0], fullEvent.remaining), 20);
  assert.equal(registrationTicket(fullEvent, purchase)?.id, 7);
  assert.equal(registrationTicket(fullEvent, { ...purchase, quantity: 21 }), null);
  const reduced = normalizeEvent(event, date, [item], [{ ...quota, available_number: 12 }], now)!;
  assert.equal(ticketLimit(reduced.tickets[0], reduced.remaining), 12);
  assert.equal(registrationTicket(reduced, purchase), null);
});

test("closed quota and test events cannot disguise sold-out or unopened registration", () => {
  const closed = normalizeEvent(event, date, [item], [{ ...quota, closed: true }], now)!;
  assert.equal(closed.tickets[0].remaining, 0);
  assert.equal(closed.signupAvailable, false);
  assert.equal(normalizeEvent({ ...event, testmode: true, presale_start: "2026-11-01T00:00:00Z" }, date, [item], [quota], now)?.signupAvailable, false);
  assert.equal(normalizeEvent({ ...event, testmode: true }, date, [item], [{ ...quota, available: false, available_number: 0 }], now)?.signupAvailable, false);
});

test("native cart handoff targets the exact date and carries buyer data only in POST fields", () => {
  const result = nativeCartHandoff("ttd", occurrence, "https://tickets.example.org/", input, "a".repeat(16));
  const action = new URL(result.action);
  assert.equal(action.pathname, `/ttd/dance/w/${"a".repeat(16)}/cart/add`);
  assert.equal(action.searchParams.get("next"), `/ttd/dance/w/${"a".repeat(16)}/checkout/start`);
  assert.equal(action.searchParams.get("locale"), "en");
  assert.equal(result.fields.item_7, "3");
  assert.equal(result.fields.subevent, "42");
  assert.deepEqual(JSON.parse(result.fields.widget_data), { email: input.email, phone: input.phone, "invoice-address-name-full-name": input.name });
  assert.equal(result.action.includes(input.email), false);
  assert.equal("price_7" in result.fields, false);
});

test("singular events and trusted custom-domain paths work; foreign shop URLs and insecure origins do not", () => {
  const single = { ...occurrence, dateId: null, shopUrl: "https://tickets.example.org/workshop/" };
  const result = nativeCartHandoff("ttd", single, "https://tickets.example.org/", { ...input, dateId: null, language: "da" }, "b".repeat(16));
  assert.equal(new URL(result.action).pathname, `/workshop/w/${"b".repeat(16)}/cart/add`);
  assert.equal("subevent" in result.fields, false);
  assert.equal(new URL(nativeCartHandoff("ttd", { ...occurrence, shopUrl: "https://other.example.org/" }, "https://tickets.example.org/prefix/", input, "c".repeat(16)).action).pathname, `/prefix/ttd/dance/w/${"c".repeat(16)}/cart/add`);
  assert.throws(() => nativeCartHandoff("ttd", occurrence, "http://tickets.example.org/", input, "a".repeat(16)));
  assert.throws(() => nativeCartHandoff("ttd", occurrence, "https://tickets.example.org/", input, "../cart"));
});
