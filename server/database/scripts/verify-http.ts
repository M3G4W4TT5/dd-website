import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { database } from "../index";
const marker = "fixture-" + randomUUID();
const email = marker + "@example.com";
const read = (name: string) =>
  parseEnv(readFileSync(`infra/local/${name}.env`, "utf8")) as Record<
    string,
    string
  >;
const post = (
  base: string,
  path: string,
  origin: string,
  body: unknown,
  extra: Record<string, string> = {},
) =>
  fetch(base + path, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...extra },
    body: JSON.stringify(body),
  });
for (const [site, port, origin] of [
  ["primary", 3011, "http://127.0.0.1:4321"],
  ["booking", 3000, "http://127.0.0.1:3000"],
] as const) {
  const base = "http://127.0.0.1:" + port;
  const cfg = read(site + "-communications");
  const db = database(
    cfg.MARKETING_DATABASE_URL,
    site === "primary" ? "primary_marketing" : "booking_marketing",
  );
  try {
    const contact =
      site === "primary"
        ? {
            site: "personal",
            name: "Fixture Visitor",
            email,
            subject: "dance",
            message: "Isolated fixture inquiry",
          }
        : {
            site: "booking",
            name: "Fixture Visitor",
            email,
            topic: "booking",
            message: "Isolated fixture studio inquiry.",
            privacyAccepted: true,
          };
    assert.equal(
      (await post(base, "/api/contact", origin, contact)).status,
      200,
    );
    assert.equal(
      (await post(base, "/api/contact", "https://invalid.example", contact))
        .status,
      403,
    );
    assert.equal(
      (
        await post(base, "/api/contact", origin, {
          ...contact,
          message: "x".repeat(9000),
        })
      ).status,
      413,
    );
    const list = site === "primary" ? "personal" : "booking";
    assert.equal(
      (
        await post(base, "/api/marketing", origin, {
          list,
          action: "subscribe",
          language: "en",
          email,
        })
      ).status,
      200,
    );
    let token = "";
    for (let retry = 0; retry < 20 && !token; retry++) {
      const files = readdirSync(cfg.CAPTURE_DIRECTORY);
      for (const file of files) {
        const raw = readFileSync(cfg.CAPTURE_DIRECTORY + "/" + file, "utf8")
          .replace(/=\r?\n/g, "")
          .replace(/=3D/g, "=");
        if (raw.includes(email) && raw.includes("Subject: Confirm"))
          token = raw.match(/#token=([A-Za-z0-9_-]{43})/)?.[1] ?? "";
      }
      if (!token) await new Promise((r) => setTimeout(r, 500));
    }
    assert.ok(token, "Captured confirmation token required");
    const before = await db.query(
      "SELECT status FROM marketing_subscriptions WHERE email=$1",
      [email],
    );
    assert.equal(before.rows[0].status, "pending");
    const action = await fetch(
      (site === "primary" ? "http://127.0.0.1:4321" : base) +
        "/marketing/confirm",
    );
    assert.equal(action.status, 200);
    assert.equal(
      (
        await db.query(
          "SELECT status FROM marketing_subscriptions WHERE email=$1",
          [email],
        )
      ).rows[0].status,
      "pending",
    );
    assert.equal(
      (
        await post(base, "/api/marketing/action", origin, {
          list,
          purpose: "confirm",
          token,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(base, "/api/marketing/action", origin, {
          list,
          purpose: "confirm",
          token,
        })
      ).status,
      410,
    );
    assert.equal(
      (
        await post(base, "/api/marketing", origin, {
          list: site === "primary" ? "booking" : "personal",
          action: "subscribe",
          language: "en",
          email,
        })
      ).status,
      403,
    );
    await db.query("DELETE FROM marketing_subscriptions WHERE email=$1", [
      email,
    ]);
    console.log(
      "PASS " +
        site +
        " HTTP contact/capture, origin/body rejection, action-page nonconsumption and explicit confirmation",
    );
  } finally {
    await db.end();
  }
}
const cfg = read("booking-communications");
const base = "http://127.0.0.1:3012";
assert.equal(
  (
    await post(
      base,
      "/internal/booking-subscription",
      "http://127.0.0.1:3000",
      {
        email,
        language: "en",
        source: "event-signup",
        optIn: true,
        idempotencyKey: marker,
      },
    )
  ).status,
  401,
);
assert.equal(
  (
    await post(
      base,
      "/internal/booking-subscription",
      "http://127.0.0.1:3000",
      {
        email,
        language: "en",
        source: "event-signup",
        optIn: false,
        idempotencyKey: marker,
      },
      { Authorization: "Bearer " + cfg.BOOKING_MARKETING_BEARER },
    )
  ).status,
  400,
);
assert.equal(
  (await fetch("http://127.0.0.1:3000/internal/booking-subscription")).status,
  404,
);
assert.equal((await fetch("http://127.0.0.1:3013/health")).status, 200);
console.log(
  "PASS internal authentication/explicit consent, private-route absence on booking and worker health",
);
