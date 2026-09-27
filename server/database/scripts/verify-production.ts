import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { communicationsConfig } from "@dd/runtime";
import {
  validateBooking,
  managementCookie,
} from "../../../apps/booking/server/config";
for (const [port, path] of [
  [3100, "/api/health"],
  [3112, "/health"],
  [3113, "/health"],
] as const)
  assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 200);
const base = "http://127.0.0.1:3100";
assert.equal(
  (await fetch(base + "/internal/booking-subscription")).status,
  404,
);
assert.equal(
  (
    await fetch(base + "/api/manage/pretix-webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  401,
);
const post = (origin: string, body: unknown) =>
  fetch(base + "/api/contact", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
assert.equal((await post("http://127.0.0.1:3100", {})).status, 403);
assert.equal((await post("https://studio.didde-mie.com", {})).status, 400);
assert.equal(
  (await post("https://studio.didde-mie.com", { message: "x".repeat(9000) }))
    .status,
  413,
);
const c = await fetch(base + "/marketing/confirm");
assert.equal(c.status, 200);
assert.match(c.headers.get("referrer-policy") ?? "", /no-referrer/);
assert.match(c.headers.get("x-robots-tag") ?? "", /noindex/);
const web = parseEnv(readFileSync("infra/local/booking-web.env", "utf8"));
validateBooking({
  ...web,
  DD_MODE: "production",
  BOOKING_PUBLIC_BASE_URL: "https://studio.didde-mie.com",
  CONTACT_BOOKING_ORIGIN: "https://studio.didde-mie.com",
  PRETIX_MANAGE_WEBHOOK_USER: "fixture",
  PRETIX_MANAGE_WEBHOOK_PASSWORD: "x".repeat(32),
});
assert.throws(() => validateBooking({ ...web, DD_MODE: "production" }));
assert.equal(managementCookie({ DD_MODE: "production" }).secure, true);
const comm = parseEnv(
  readFileSync("infra/local/booking-communications.env", "utf8"),
);
const cfg = communicationsConfig(
  {
    ...comm,
    DD_MODE: "production",
    ALLOWED_ORIGINS: "https://studio.didde-mie.com",
    MARKETING_ACTION_BASE_URL: "https://studio.didde-mie.com",
  },
  "booking",
);
assert.equal(cfg.mail.delivery, "capture");
console.log(
  "PASS restarted production booking-only stack, authenticated webhook rejection, private route absence, HTTPS-origin/body checks, action privacy headers and fail-closed configuration/secure cookie policy; actual browser HTTPS remains hosted gate",
);
