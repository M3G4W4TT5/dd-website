import assert from "node:assert/strict";
import test from "node:test";
import { OPTIONS, POST } from "../app/api/marketing/route";
import { normalizeEmail } from "./marketing";

test("marketing signup is restricted to its matching site origin", async () => {
  const body = JSON.stringify({ list: "personal", action: "subscribe", language: "en", email: "person@example.com" });
  const wrong = await POST(new Request("http://127.0.0.1:3000/api/marketing", {
    method: "POST", headers: { origin: "http://127.0.0.1:3000", "content-type": "application/json" }, body,
  }));
  assert.equal(wrong.status, 403);
  const preflight = await OPTIONS(new Request("http://127.0.0.1:3000/api/marketing", {
    method: "OPTIONS", headers: { origin: "http://127.0.0.1:4321" },
  }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:4321");
});

test("marketing honeypot does not contact the database or send mail", async () => {
  const result = await POST(new Request("http://127.0.0.1:3000/api/marketing", {
    method: "POST", headers: { origin: "http://127.0.0.1:4321", "content-type": "application/json" },
    body: JSON.stringify({ list: "personal", action: "subscribe", language: "en", email: "person@example.com", website: "spam" }),
  }));
  assert.equal(result.status, 200);
});

test("email normalization keeps the two lists distinct but removes case and spaces", () => {
  assert.equal(normalizeEmail(" Person@Example.COM "), "person@example.com");
});
