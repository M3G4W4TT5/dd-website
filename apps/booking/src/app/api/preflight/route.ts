import { submissionId } from "../../../../server/submission";
import { boundedJson, HttpError } from "@dd/runtime";
import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/availability";
import { quoteInterval } from "@/lib/booking";
import { preflightSchema } from "@/lib/customer";
import { requestBookingSubscription } from "../../../../server/marketing-client";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await boundedJson(request, 8_192); }
  catch (error) { return NextResponse.json({error: error instanceof HttpError ? error.message : "Invalid JSON"}, {status: error instanceof HttpError ? error.status : 400, headers: {"Cache-Control":"no-store"}}); }
  const input = preflightSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json({ error: "Invalid booking details" }, { status: 400 });
  }

  try {
    const availability = await getAvailability(input.data.date);
    const quote = quoteInterval(availability, input.data.startId, input.data.hours);
    if (!quote) {
      return NextResponse.json(
        { error: "Selected hours are no longer available" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    let marketingRequested: boolean | null = null;
    if (input.data.marketingOptIn) {
      try {
        const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
        if (request.headers.get("origin") !== expectedOrigin) throw new Error("Origin not allowed for marketing signup");
        await requestBookingSubscription(input.data.details.email, input.data.marketingLanguage || "en", "booking-details", input.data.marketingOptIn, submissionId(request));
        marketingRequested = true;
      } catch {
        console.error("Booking marketing signup failed");
        marketingRequested = false;
      }
    }
    return NextResponse.json(
      { quote, detailsAccepted: true, reservationCreated: false, paymentStarted: false, marketingRequested, checkedAt: availability.checkedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const isDateError = error instanceof RangeError;
    return NextResponse.json(
      { error: isDateError ? "Invalid date" : "Availability is temporarily unavailable" },
      { status: isDateError ? 400 : 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
