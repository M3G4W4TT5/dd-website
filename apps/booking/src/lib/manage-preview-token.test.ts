import assert from "node:assert/strict";
import test from "node:test";
import { signPreviewBooking, verifyPreviewBooking } from "./manage-preview-token";

const payload = { firstHourIso: "2026-10-04T10:00:00+02:00", endIso: "2026-10-04T12:00:00+02:00", expiresAt: 1_800_000_000_000 };

test("preview booking token binds the booked time to the server", () => {
  const token = signPreviewBooking(payload, "server-only-test-key");
  assert.deepEqual(verifyPreviewBooking(token, "server-only-test-key", payload.expiresAt - 1), payload);
  const [body, mac] = token.split(".");
  const modified = Buffer.from(JSON.stringify({ ...payload, firstHourIso: "2026-10-05T10:00:00+02:00" })).toString("base64url");
  assert.equal(verifyPreviewBooking(`${modified}.${mac}`, "server-only-test-key", payload.expiresAt - 1), null);
  assert.equal(verifyPreviewBooking(`${body}.${mac}`, "different-key", payload.expiresAt - 1), null);
  assert.equal(verifyPreviewBooking(token, "server-only-test-key", payload.expiresAt), null);
});
