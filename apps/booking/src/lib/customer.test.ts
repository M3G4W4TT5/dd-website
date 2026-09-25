import assert from "node:assert/strict";
import test from "node:test";
import { customerDetailsSchema, preflightSchema } from "./customer";

const base = {
  name: "Demo Visitor",
  email: "demo@example.invalid",
  phone: "+45 12 34 56 78",
  customerType: "private",
  attendeeCount: 2,
  purpose: "Dance practice",
  company: "",
  comment: "",
};

test("a business inquiry needs a company, while a private booking does not", () => {
  assert.equal(customerDetailsSchema.safeParse(base).success, true);
  assert.equal(customerDetailsSchema.safeParse({ ...base, customerType: "business" }).success, false);
  assert.equal(customerDetailsSchema.safeParse({ ...base, customerType: "business", company: "Example ApS" }).success, true);
});

test("contact details and attendee count are validated before a booking can be prepared", () => {
  assert.equal(customerDetailsSchema.safeParse({ ...base, email: "not-an-email" }).success, false);
  assert.equal(customerDetailsSchema.safeParse({ ...base, attendeeCount: 0 }).success, false);
});

test("booking preflight requires explicit acceptance of the terms", () => {
  const request = { date: "2026-09-26", startId: "slot-08", hours: 1, details: base };
  assert.equal(preflightSchema.safeParse(request).success, false);
  assert.equal(preflightSchema.safeParse({ ...request, termsAccepted: false }).success, false);
  assert.equal(preflightSchema.safeParse({ ...request, termsAccepted: true }).success, true);
});

test("booking marketing choice is optional and remains separate from terms", () => {
  const request = { date: "2026-09-26", startId: "slot-08", hours: 1, details: base };
  assert.equal(preflightSchema.safeParse({ ...request, termsAccepted: true, marketingOptIn: false }).success, true);
  assert.equal(preflightSchema.safeParse({ ...request, termsAccepted: true, marketingOptIn: true, marketingLanguage: "en" }).success, true);
  assert.equal(preflightSchema.safeParse({ ...request, termsAccepted: false, marketingOptIn: true }).success, false);
});
