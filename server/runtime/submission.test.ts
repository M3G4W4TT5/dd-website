import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { requestBookingSubscription } from "../../apps/booking/server/marketing-client";
import { submissionId } from "../../apps/booking/server/submission";

test("private marketing retries share a key; later opt-ins from the same address/source get a different key in both modes", async () => {
  const previous = { ...process.env };
  const originalFetch = globalThis.fetch;
  try {
    delete process.env.PREVIEW;
    process.env.BOOKING_COMMUNICATIONS_URL = "http://127.0.0.1:3012";
    process.env.BOOKING_MARKETING_BEARER = "fixture".repeat(8);
    for (const mode of ["development", "production"]) {
      process.env.DD_MODE = mode;
      for (const source of ["booking-details", "event-signup"] as const) {
        const keys: string[] = [];
        globalThis.fetch = async (_url, init) => {
          keys.push(JSON.parse(String(init?.body)).idempotencyKey);
          return Response.json({ ok: true });
        };
        const first = randomUUID(), later = randomUUID();
        for (const id of [first, first, later])
          await requestBookingSubscription("fixture@example.com", "da", source, true, id);
        assert.equal(keys[0], keys[1]);
        assert.notEqual(keys[0], keys[2]);
      }
    }
    const id = randomUUID();
    assert.equal(submissionId(new Request("http://fixture", { headers: { "Idempotency-Key": id } })), id);
    assert.throws(() => submissionId(new Request("http://fixture", { headers: { "Idempotency-Key": "invalid" } })));
    assert.notEqual(submissionId(new Request("http://fixture")), submissionId(new Request("http://fixture")));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of ["PREVIEW", "BOOKING_COMMUNICATIONS_URL", "BOOKING_MARKETING_BEARER", "DD_MODE"]) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
