import { request as httpRequest } from "node:http";
import Stripe from "stripe";

const MAX_BODY = 256 * 1024;
const TARGET_PATH = "/_stripe/webhook/";

async function boundedBody(request: Request): Promise<Buffer> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY))
    throw new Error("body-size");
  if (!request.body) throw new Error("body-empty");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new Error("body-size");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function verifiedStripeWebhook(
  incoming: Request,
  env: NodeJS.ProcessEnv = process.env,
  upstream = "http://pretix:80",
): Promise<Response> {
  if (env.PAYMENT_ENVIRONMENT !== "sandbox" || env.PAYMENT_RELEASE_ENABLED === "true")
    return new Response(null, { status: 503 });
  const secret = env.STRIPE_WEBHOOK_SIGNING_SECRET;
  const shop = env.PRETIX_SHOP_BASE;
  if (!secret?.startsWith("whsec_") || !shop || new URL(shop).origin !== "https://checkout.didde-mie.com")
    return new Response(null, { status: 503 });
  const signature = incoming.headers.get("stripe-signature");
  if (!signature) return new Response(null, { status: 400 });
  let body: Buffer;
  try {
    body = await boundedBody(incoming);
  } catch {
    return new Response(null, { status: 413 });
  }
  try {
    // The SDK checks the signed timestamp and raw bytes. No API call or Stripe key is needed.
    const stripe = new Stripe("sk_test_signature_verification_only");
    stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response(null, { status: 400 });
  }
  const target = new URL(upstream);
  if (target.protocol !== "http:" || !["pretix", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/")
    return new Response(null, { status: 503 });
  return new Promise<Response>((resolve) => {
    const outgoing = httpRequest(
      new URL(TARGET_PATH, target),
      {
        method: "POST",
        headers: {
          Host: "checkout.didde-mie.com",
          "X-Forwarded-Proto": "https",
          "Content-Type": incoming.headers.get("content-type") || "application/json",
          "Stripe-Signature": signature,
          "Content-Length": String(body.length),
        },
        timeout: 10000,
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(new Response(null, { status: response.statusCode === 200 ? 200 : 502 })));
        response.on("error", () => resolve(new Response(null, { status: 502 })));
      },
    );
    outgoing.on("timeout", () => outgoing.destroy());
    outgoing.on("error", () => resolve(new Response(null, { status: 502 })));
    outgoing.end(body);
  });
}
