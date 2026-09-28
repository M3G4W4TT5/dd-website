import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import Stripe from "stripe";
import { verifiedStripeWebhook } from "../../server/stripe-webhook";

test("signed callback forwards identical bytes with the public Pretix host; forged and oversized bodies stop first", async () => {
  const received: Array<{ body: string; host: string; proto: string }> = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({
      body: Buffer.concat(chunks).toString(),
      host: req.headers.host || "",
      proto: String(req.headers["x-forwarded-proto"] || ""),
    });
    res.writeHead(200);
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    const upstream = `http://127.0.0.1:${address.port}`;
    const secret = "whsec_test_fixture";
    const body = JSON.stringify({ id: "evt_test", data: { object: { object: "payment_intent", id: "pi_test" } } });
    const stripe = new Stripe("sk_test_signature_verification_only");
    const signature = stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    const env = { ...process.env, PAYMENT_ENVIRONMENT: "sandbox", PAYMENT_RELEASE_ENABLED: "false",
      PRETIX_SHOP_BASE: "https://checkout.didde-mie.com", STRIPE_WEBHOOK_SIGNING_SECRET: secret };
    const send = (payload: string, header: string) => verifiedStripeWebhook(new Request("https://checkout.didde-mie.com/_stripe/webhook/", {
      method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload,
    }), env, upstream);
    assert.equal((await send(body, signature)).status, 200);
    assert.equal((await send(body, signature)).status, 200);
    assert.deepEqual(received, Array(2).fill({ body, host: "checkout.didde-mie.com", proto: "https" }));
    assert.equal((await send(body + " ", signature)).status, 400);
    assert.equal(received.length, 2);
    assert.equal((await send("x".repeat(256 * 1024 + 1), signature)).status, 413);
    assert.equal(received.length, 2);
  } finally {
    server.close();
  }
});
