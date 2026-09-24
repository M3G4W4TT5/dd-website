import assert from "node:assert/strict";
import { test } from "node:test";
import { OPTIONS, POST } from "../app/api/contact/route";

process.env.CONTACT_PERSONAL_ORIGIN = "https://didde-mie.com";
process.env.CONTACT_BOOKING_ORIGIN = "https://booking.didde-mie.com";
delete process.env.CONTACT_SMTP_PASSWORD;
delete process.env.BOOKING_SMTP_PASSWORD;

const validPersonal = {
  site: "personal", name: "Example Person", email: "person@example.com",
  subject: "dance", message: "A project inquiry",
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
});

test("honeypot submissions do not require SMTP delivery", async () => {
  const result = await POST(request("https://didde-mie.com", { ...validPersonal, website: "spam.example" }));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
});
