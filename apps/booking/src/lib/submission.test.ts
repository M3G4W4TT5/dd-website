import assert from "node:assert/strict";
import test from "node:test";
import { submissionIdentity, submitWithIdentity } from "./submission";

test("one form submission keeps its key across network/dependency retries; accepted and edited forms get new keys", async () => {
  const identity = submissionIdentity();
  const keys: string[] = [];
  const previous = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    attempt++;
    if (attempt === 1) throw new TypeError("lost response");
    if (attempt === 2) return Response.json({}, { status: 503 });
    return Response.json({ marketingRequested: attempt === 3 ? false : true });
  };
  try {
    const send = () => submitWithIdentity(identity, "/fixture", { method: "POST", body: "same form" });
    await assert.rejects(send);
    await send();
    await send();
    await send();
    assert.equal(new Set(keys).size, 1);
    await send();
    assert.notEqual(keys[4], keys[0]);
    const key = identity.key("first form");
    assert.notEqual(identity.key("edited form"), key);
  } finally { globalThis.fetch = previous; }
});

test("payment handoff keeps the submission identity if browser navigation fails", async () => {
  const identity = submissionIdentity();
  const keys: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("Idempotency-Key")!);
    return Response.json({ reservationCreated: true, paymentUrl: "https://checkout.example.test/order/example/" });
  };
  try {
    const send = (body: string) => submitWithIdentity(identity, "/api/rental/checkout", { method: "POST", body }, false);
    await send("same selection");
    await send("same selection");
    assert.equal(keys[0], keys[1]);
    await send("changed selection");
    assert.notEqual(keys[1], keys[2]);
  } finally { globalThis.fetch = previous; }
});
