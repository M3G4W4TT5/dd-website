import assert from "node:assert/strict";
import test from "node:test";
import { customerDetailsSchema } from "./customer";

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
