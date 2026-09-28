import { verifiedStripeWebhook } from "../../../../../server/stripe-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return verifiedStripeWebhook(request);
}
