import { boundedJson, HttpError } from "@dd/runtime";
import { NextResponse } from "next/server";
import { rentalCheckoutSchema, RentalConflict, RentalPhoneRejected, RentalPriceChanged, startRentalCheckout } from "../../../../../server/rental-checkout";
import { requestBookingSubscription } from "../../../../../server/marketing-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: object, status = 200) => NextResponse.json(value, {
  status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
});

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return json({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON" }, 415);
  const identity = request.headers.get("idempotency-key") || "";
  let body: unknown;
  try { body = await boundedJson(request, 8_192); }
  catch (error) { return json({ error: error instanceof HttpError ? error.message : "Invalid JSON" }, error instanceof HttpError ? error.status : 400); }
  const parsed = rentalCheckoutSchema.safeParse(body);
  if (!parsed.success) return parsed.error.issues.some(issue => issue.path.join(".") === "details.phone")
    ? json({ code: "invalid_phone" }, 422) : json({ code: "invalid_details" }, 400);
  try {
    const result = await startRentalCheckout(parsed.data, identity);
    let marketingRequested: boolean | null = null;
    if (parsed.data.marketingOptIn) {
      try {
        await requestBookingSubscription(parsed.data.details.email,
          parsed.data.marketingLanguage || "en", "booking-details", true, identity);
        marketingRequested = true;
      } catch { marketingRequested = false; }
    }
    return json({ ...result, marketingRequested, reservationCreated: true, paymentStarted: false });
  } catch (error) {
    if (error instanceof RentalPhoneRejected) return json({ code: "invalid_phone" }, 422);
    if (error instanceof RentalPriceChanged) return json({ code: "price_changed" }, 409);
    if (error instanceof RentalConflict) return json({ code: "inventory_changed" }, 409);
    console.error("Rental checkout handoff failed");
    return json({ error: "Checkout is temporarily unavailable" }, 503);
  }
}
