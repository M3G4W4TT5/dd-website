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
assert.equal((await post("https://booking.didde-mie.com", {})).status, 400);
assert.equal(
  (await post("https://booking.didde-mie.com", { message: "x".repeat(9000) }))
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
  BOOKING_PUBLIC_BASE_URL: "https://booking.didde-mie.com",
  CONTACT_BOOKING_ORIGIN: "https://booking.didde-mie.com",
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
    ALLOWED_ORIGINS: "https://booking.didde-mie.com",
    MARKETING_ACTION_BASE_URL: "https://booking.didde-mie.com",
  },
  "booking",
);
assert.equal(cfg.mail.delivery, "capture");
console.log(
  "PASS restarted production booking-only stack, authenticated webhook rejection, private route absence, HTTPS-origin/body checks, action privacy headers and fail-closed configuration/secure cookie policy; actual browser HTTPS remains hosted gate",
);
assert.equal(
  (
    await fetch(base + "/api/manage/eligibility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  404,
);
assert.equal(
  (
    await fetch(base + "/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "x".repeat(3000) }),
    })
  ).status,
  413,
);
assert.equal(
  (
    await fetch(base + "/api/manage/booking", {
      method: "POST",
      headers: {
        Origin: "https://booking.didde-mie.com",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "cancel", code: "ABCDE" }),
    })
  ).status,
  401,
);
console.log(
  "PASS final production cleanup: legacy eligibility removed, quote size bounded, unauthenticated mutation denied",
);
// Exercise actual container lock ordering against a scoped disposable membership.
const { database, digest } = await import("../index");
const { randomUUID } = await import("node:crypto");
const roleEnv = parseEnv(readFileSync("infra/local/roles.env", "utf8"));
const runtime = database(
  roleEnv.BOOKING_MARKETING_RUNTIME_DATABASE_URL!,
  "booking_marketing",
);
const operator = database(
  roleEnv.BOOKING_MARKETING_OPERATOR_DATABASE_URL!,
  "booking_marketing",
);
const email = "fixture-" + randomUUID() + "@example.com",
  token = randomUUID().replaceAll("-", "") + "a".repeat(11);
const client = await operator.connect();
try {
  await runtime.query(
    "INSERT INTO marketing_subscriptions(email,language,status,source,consent_version) VALUES($1,'en','pending','fixture','fixture')",
    [email],
  );
  await runtime.query(
    "INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,'confirm',now()+interval '1 hour')",
    [digest(token), email],
  );
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
  await client.query(
    "UPDATE marketing_subscriptions SET status='unsubscribed' WHERE email=$1",
    [email],
  );
  const consuming = fetch(base + "/api/marketing/action", {
    method: "POST",
    headers: {
      Origin: "https://booking.didde-mie.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ list: "booking", purpose: "confirm", token }),
  });
  await new Promise((r) => setTimeout(r, 100));
  await client.query("DELETE FROM marketing_action_tokens WHERE email=$1", [
    email,
  ]);
  await client.query("COMMIT");
  assert.equal((await consuming).status, 410);
  console.log(
    "PASS current production concurrent withdrawal/token-consumption lock ordering without deadlock or reactivation",
  );
} finally {
  await client.query("ROLLBACK");
  client.release();
  await runtime.query("DELETE FROM marketing_subscriptions WHERE email=$1", [
    email,
  ]);
  await runtime.end();
  await operator.end();
}
