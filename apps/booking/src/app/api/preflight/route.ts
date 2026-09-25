import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/availability";
import { quoteInterval } from "@/lib/booking";
import { preflightSchema } from "@/lib/customer";
import { requestSubscription } from "@/lib/marketing";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 8_192) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
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
        await requestSubscription("booking", input.data.details.email, input.data.marketingLanguage || "da", "booking-details");
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
