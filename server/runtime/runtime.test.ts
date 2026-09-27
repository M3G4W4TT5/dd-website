import assert from "node:assert/strict";
import test from "node:test";
import { communicationsConfig, mailConfig } from "./config";
import { boundedJson, HttpError } from "./http";
import { createMailer, classifySmtp, sender } from "@dd/mail";
import { contact } from "@dd/contact";
import { service } from "./index";
import {
  transitionKinds,
  lifecycleMessage,
  currentLifecycleMessage,
} from "../../apps/booking/server/notifications";
const env = {
  DD_MODE: "development",
  SERVICE_SITE: "primary",
  ALLOWED_ORIGINS: "http://127.0.0.1:4321",
  MARKETING_ACTION_BASE_URL: "http://127.0.0.1:4321",
  MARKETING_DATABASE_URL:
    "postgresql://primary_marketing_runtime:fixture@localhost/marketing",
  PAYLOAD_KEY: "a".repeat(64),
};
test("identity, runtime and delivery configuration fail closed", () => {
  assert.throws(() =>
    communicationsConfig({ ...env, SERVICE_SITE: "booking" }, "primary"),
  );
  assert.throws(() =>
    communicationsConfig({ ...env, BOOKING_DATABASE_URL: "bad" }, "primary"),
  );
  assert.throws(() =>
    communicationsConfig(
      {
        ...env,
        MARKETING_DATABASE_URL:
          "postgresql://booking_marketing_runtime:x@localhost/marketing",
      },
      "primary",
    ),
  );
  assert.throws(() => mailConfig({ ...env, SMTP_PASSWORD: "fixture" }));
  assert.throws(() =>
    mailConfig({
      ...env,
      DD_MODE: "production",
      MAIL_DELIVERY: "controlled",
      PAYMENT_ENVIRONMENT: "sandbox",
    }),
  );
  assert.throws(() =>
    communicationsConfig(
      { ...env, DD_MODE: "production", PAYMENT_ENVIRONMENT: "sandbox" },
      "primary",
    ),
  );
  assert.equal(
    mailConfig({
      ...env,
      DD_MODE: "production",
      PAYMENT_ENVIRONMENT: "sandbox",
    }).delivery,
    "capture",
  );
});
test("byte bounded bodies reject oversized streams without reading entire input", async () => {
  let reads = 0;
  const body = new ReadableStream({
    pull(c) {
      reads++;
      c.enqueue(new Uint8Array(1024));
    },
  });
  const req = new Request("http://local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    () => boundedJson(req, 512),
    (e: unknown) => e instanceof HttpError && e.status === 413,
  );
  assert.ok(reads < 5);
});
test("exact CORS and caller identities rejected before dependencies", async () => {
  const pool = { query: async () => ({ rows: [{ allowed: true }] }) } as any;
  const s = service(
    communicationsConfig(env, "primary"),
    (async () => {}) as any,
    pool,
  );
  const wrong = await s.handle(
    new Request("http://service/api/contact", {
      method: "POST",
      headers: { Origin: "https://wrong.example" },
    }),
  );
  assert.equal(wrong.status, 403);
  const post = (body: unknown) =>
    new Request("http://service/api/marketing", {
      method: "POST",
      headers: {
        Origin: env.ALLOWED_ORIGINS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await s.handle(
        post({
          list: "booking",
          action: "subscribe",
          email: "fixture@example.com",
          language: "en",
        }),
      )
    ).status,
    403,
  );
  const res = await s.handle(
    new Request("http://service/api/contact", {
      method: "OPTIONS",
      headers: { Origin: env.ALLOWED_ORIGINS },
    }),
  );
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("vary"), "Origin");
  assert.equal(res.headers.get("access-control-allow-credentials"), null);
});
test("both contact inquiries and acknowledgements preserve copy, envelope and inline asset; acknowledgement failure does not fail inquiry", async () => {
  for (const site of ["primary", "booking"] as const) {
    const captured: any[] = [];
    const raw: string[] = [];
    const send = createMailer(
      { mode: "development", delivery: "capture", allowlist: [] },
      site,
      async (mail, data) => {
        captured.push(mail);
        raw.push(data.toString());
      },
    );
    const input =
      site === "primary"
        ? {
            name: "<Visitor> Example",
            email: "fixture@example.com",
            subject: "dance",
            message: "Fixture inquiry",
          }
        : {
            name: "<Visitor> Example",
            email: "fixture@example.com",
            topic: "booking",
            message: "A fixture studio inquiry.",
            privacyAccepted: true,
          };
    await contact(site, input, send, async () => true);
    assert.equal(captured.length, 2);
    assert.equal(captured[0].replyTo.address, "fixture@example.com");
    assert.equal(
      captured[0].envelope.from,
      site === "primary" ? "contact@didde-mie.com" : "booking@didde-mie.com",
    );
    assert.match(raw[1].replace(/=\r?\n/g, ""), /Hi &lt;Visitor&gt;,/);
    if (site === "booking")
      assert.match(raw[1], /Content-ID: <ttd-studio-mark>/);
    let count = 0;
    await contact(
      site,
      input,
      async (kind) => {
        count++;
        if (kind === "acknowledgement") throw new Error("fixture rejection");
      },
      async () => true,
    );
    assert.equal(count, 2);
    count = 0;
    await contact(site, input, async () => { count++; }, async () => {
      throw new Error("fixture reservation database failure");
    });
    assert.equal(count, 1, "accepted inquiry survives acknowledgement reservation failure");
    let reservations = 0;
    await assert.rejects(() => contact(site, input, async () => {
      throw new Error("inquiry rejected");
    }, async () => { reservations++; return true; }));
    assert.equal(reservations, 0);
  }
});
test("sender policy and SMTP acceptance uncertainty are explicit", async () => {
  assert.equal(sender("booking", "paid").from, "noreply+booking@didde-mie.com");
  assert.equal(
    sender("primary", "marketing").envelopeFrom,
    "newsletter@didde-mie.com",
  );
  assert.throws(() => sender("primary", "paid"));
  assert.equal(classifySmtp({ responseCode: 550 }), "permanent");
  assert.equal(classifySmtp({ responseCode: 450 }), "retry");
  assert.equal(
    classifySmtp({ code: "ETIMEDOUT", command: "DATA" }),
    "ambiguous",
  );
  assert.equal(
    classifySmtp({ code: "ECONNREFUSED", command: "CONN" }),
    "retry",
  );
  const send = createMailer(
    {
      mode: "production",
      delivery: "controlled",
      allowlist: ["allowed@example.com"],
      host: "smtp.example.com",
      user: "fixture",
      password: "fixture",
    },
    "booking",
  );
  await assert.rejects(() =>
    send("paid", { to: "other@example.com", subject: "Fixture" }),
  );
});
test("repeated transitions are revision based and refund completion is never implied by cancellation", () => {
  const paid = {
    reference: "ABCDE",
    firstHourIso: "2026-10-01T12:00:00Z",
    endIso: "2026-10-01T13:00:00Z",
    paidOre: 35000,
    status: "paid",
    refund: "none",
  } as const;
  const changed = {
    ...paid,
    firstHourIso: "2026-10-02T12:00:00Z",
    endIso: "2026-10-02T13:00:00Z",
  };
  const cancelled = {
    ...changed,
    status: "cancelled",
    refund: "pending",
  } as const;
  assert.deepEqual(transitionKinds(null, paid), ["paid"]);
  assert.deepEqual(transitionKinds(paid, paid), []);
  assert.deepEqual(transitionKinds(paid, changed), ["change"]);
  assert.deepEqual(transitionKinds(changed, paid), ["change"]);
  assert.deepEqual(transitionKinds(changed, cancelled), [
    "cancellation",
    "refund",
  ]);
  assert.deepEqual(
    transitionKinds(cancelled, { ...cancelled, refund: "done" }),
    ["refund"],
  );
  for (const lang of ["en", "da"] as const) {
    const text = lifecycleMessage(
      "cancellation",
      cancelled,
      "fixture@example.com",
      lang,
    ).text;
    assert.match(
      text,
      lang === "en" ? /Refund: Pending/ : /Refusion: Afventer/,
    );
    assert.doesNotMatch(text, /Completed|Gennemført/);
    assert.equal(currentLifecycleMessage("change", changed, paid, "fixture@example.com", lang, 2, 3), null);
    // A -> B -> A must not send both historical A notices from current A.
    assert.equal(currentLifecycleMessage("change", paid, paid, "fixture@example.com", lang, 1, 3), null);
    assert.ok(currentLifecycleMessage("change", paid, paid, "fixture@example.com", lang, 3, 3));
    const refunded = { ...cancelled, refund: "done" } as const;
    assert.equal(currentLifecycleMessage("refund", cancelled, refunded, "fixture@example.com", lang, 4, 5), null);
    const completed = currentLifecycleMessage("refund", refunded, refunded, "fixture@example.com", lang, 5, 5)!;
    assert.match(completed.text, /Completed|Gennemført/);
    const cancellation = currentLifecycleMessage("cancellation", cancelled, refunded, "fixture@example.com", lang, 4, 5)!;
    assert.match(cancellation.text, /Pending|Afventer/);
    assert.doesNotMatch(cancellation.text, /Completed|Gennemført/);
  }
});

test("production web config, secure session policy and preview marketing fail closed", async () => {
  const { validateBooking, validateWorker, managementCookie } = await import(
    "../../apps/booking/server/config"
  );
  assert.throws(() => validateBooking({ DD_MODE: "production" }));
  assert.throws(() =>
    validateWorker({
      DD_MODE: "production",
      BOOKING_DATABASE_URL:
        "postgresql://booking_worker_runtime:fixture@localhost/booking_management",
    }),
  );
  assert.throws(() =>
    validateBooking({ DD_MODE: "development", SMTP_PASSWORD: "fixture" }),
  );
  assert.throws(() =>
    validateBooking({ PREVIEW: "true", BOOKING_SELF_SERVICE_ENABLED: "true" }),
  );
  assert.deepEqual(managementCookie({ DD_MODE: "production" }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
  const { requestBookingSubscription } = await import(
    "../../apps/booking/server/marketing-client"
  );
  const previous = process.env.PREVIEW;
  const fetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Unexpected preview side effect");
  };
  try {
    process.env.PREVIEW = "true";
    await requestBookingSubscription(
      "fixture@example.com",
      "en",
      "booking-details",
      true,
      "fixture",
    );
    delete process.env.PREVIEW;
    await requestBookingSubscription(
      "fixture@example.com",
      "en",
      "event-signup",
      false,
      "fixture",
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = fetch;
    if (previous === undefined) delete process.env.PREVIEW;
    else process.env.PREVIEW = previous;
  }
});
