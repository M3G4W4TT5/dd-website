import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { OPTIONS, POST } from "../app/api/contact/route";
import { bookingAutoReply, personalAutoReply, reserveContactAutoReply } from "./contact-email";

process.env.CONTACT_PERSONAL_ORIGIN = "https://didde-mie.com";
process.env.CONTACT_BOOKING_ORIGIN = "https://booking.didde-mie.com";
delete process.env.CONTACT_SMTP_PASSWORD;
delete process.env.BOOKING_SMTP_PASSWORD;

const validPersonal = {
  site: "personal", name: "Example Person", email: "person@example.com",
  subject: "dance", message: "A project inquiry",
};
const validBooking = {
  site: "booking", name: "Example Visitor", email: "visitor@example.com",
  topic: "booking", message: "I would like to ask about the studio.",
};

function request(origin: string, body: unknown) {
  return new Request("https://booking.didde-mie.com/api/contact", {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("personal origin receives a limited CORS preflight", async () => {
  const result = await OPTIONS(new Request("https://booking.didde-mie.com/api/contact", {
    method: "OPTIONS", headers: { origin: "https://didde-mie.com" },
  }));
  assert.equal(result.status, 204);
  assert.equal(result.headers.get("access-control-allow-origin"), "https://didde-mie.com");
  assert.equal(result.headers.get("access-control-allow-methods"), "POST, OPTIONS");
});

test("unknown origins and cross-site mailbox selection are rejected", async () => {
  assert.equal((await POST(request("https://elsewhere.example", validPersonal))).status, 403);
  assert.equal((await POST(request("https://booking.didde-mie.com", validPersonal))).status, 403);
});

test("invalid details are rejected before delivery", async () => {
  assert.equal((await POST(request("https://didde-mie.com", { ...validPersonal, subject: "arbitrary" }))).status, 400);
  assert.equal((await POST(request("https://didde-mie.com", validPersonal))).status, 503);
  assert.equal((await POST(request("https://didde-mie.com", { ...validPersonal, subject: "brand_partnerships" }))).status, 503);
});

test("studio contact requires explicit privacy acceptance", async () => {
  assert.equal((await POST(request("https://booking.didde-mie.com", validBooking))).status, 400);
  assert.equal((await POST(request("https://booking.didde-mie.com", { ...validBooking, privacyAccepted: false }))).status, 400);
  assert.equal((await POST(request("https://booking.didde-mie.com", { ...validBooking, privacyAccepted: true }))).status, 503);
});

test("personal auto-reply has a text fallback and escapes the greeting in HTML", () => {
  const reply = personalAutoReply("<DD> Example", "visitor@example.com");
  assert.equal(reply.to, "visitor@example.com");
  assert.equal(reply.from.address, "contact@didde-mie.com");
  assert.match(reply.text, /Hi <DD>,/);
  assert.match(reply.html, /Hi &lt;DD&gt;,/);
  assert.match(reply.html, /color:#09090b">DD<\/span><span style="color:#ffb3eb">\.<\/span>/);
  assert.equal(reply.headers["Auto-Submitted"], "auto-replied");
});

test("booking auto-reply has plural copy and an inline TTD mark", () => {
  const reply = bookingAutoReply("<TTD> Example", "visitor@example.com");
  assert.equal(reply.to, "visitor@example.com");
  assert.equal(reply.from.address, "booking@didde-mie.com");
  assert.match(reply.text, /We have received your message and will get back to you soon/);
  assert.match(reply.text, /Best,\nDidde-Mie & Toniah/);
  assert.match(reply.html, /Hi &lt;TTD&gt;,/);
  assert.match(reply.html, /cid:ttd-studio-mark/);
  assert.equal(reply.attachments[0].cid, "ttd-studio-mark");
  assert.equal(existsSync(reply.attachments[0].path), true);
});

test("auto-replies are limited per recipient and separately for each site", () => {
  assert.equal(reserveContactAutoReply("personal", "Visitor@example.com", 1_000_000), true);
  assert.equal(reserveContactAutoReply("personal", "visitor@example.com", 1_000_001), false);
  assert.equal(reserveContactAutoReply("booking", "visitor@example.com", 1_000_001), true);
  assert.equal(reserveContactAutoReply("personal", "visitor@example.com", 1_000_000 + 3_600_001), true);
});

test("honeypot submissions do not require SMTP delivery", async () => {
  const result = await POST(request("https://didde-mie.com", { ...validPersonal, website: "spam.example" }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
});
