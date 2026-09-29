import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhone } from "./phone";
import { customerDetailsSchema } from "./customer";
import { rentalCheckoutSchema } from "../../server/rental-checkout";
import { eventRegistrationSchema } from "./event-registration";

test("Danish national and international input produce one prefix", () => {
  for (const value of ["20123456", "20 12 34 56", "+45 20 12 34 56", "0045 20123456"])
    assert.equal(normalizePhone(value, "DK"), "+4520123456");
  assert.equal(normalizePhone("+4520123456", "SE"), "+4520123456");
});

test("foreign national numbers use the selected country", () => {
  assert.equal(normalizePhone("070 123 45 67", "SE"), "+46701234567");
  assert.equal(normalizePhone("2025550123", "US"), "+12025550123");
});

test("invalid national, malformed international, and unknown countries fail", () => {
  for (const [value, country] of [["12345", "DK"], ["+45+4520123456", "DK"], ["20123456", "ZZ"]])
    assert.equal(normalizePhone(value, country), null);
});

test("rental details normalize phone on the server", () => {
  const parsed = customerDetailsSchema.parse({ name: "Synthetic Test", email: "synthetic@example.invalid", phone: "20123456",
    phoneCountry: "DK", customerType: "private", attendeeCount: 1, purpose: "Rehearsal", company: "", comment: "" });
  assert.equal(parsed.phone, "+4520123456");
});

test("both checkout schemas normalize before the Pretix handoff", () => {
  const details = { name: "Synthetic Test", email: "synthetic@example.invalid", phone: "20123456",
    phoneCountry: "DK", customerType: "private", attendeeCount: 1, purpose: "Rehearsal", company: "", comment: "" };
  const rental = rentalCheckoutSchema.parse({ date: "2026-10-20", startId: "1", hours: 1, termsAccepted: true, details,
    acceptedQuote: { slotIds: ["1"], start: "2026-10-20T08:00:00+02:00", end: "2026-10-20T09:00:00+02:00", hours: 1, totalOre: 25000, currency: "DKK" } });
  assert.equal(rental.details.phone, "+4520123456");
  const event = eventRegistrationSchema.parse({ slug: "dance", dateId: 1, itemId: 1, quantity: 1, unitPrice: "200.00",
    language: "da", name: details.name, email: details.email, phone: "070 123 45 67", phoneCountry: "SE",
    termsAccepted: true, marketingOptIn: false });
  assert.equal(event.phone, "+46701234567");
});
