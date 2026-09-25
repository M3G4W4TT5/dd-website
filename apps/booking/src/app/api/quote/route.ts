import { NextResponse } from "next/server";
import { z } from "zod";
import { getAvailability } from "@/lib/availability";
import { MAX_HOURS, quoteInterval } from "@/lib/booking";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  date: z.iso.date(),
  startId: z.string().min(1).max(100),
  hours: z.number().int().min(1).max(MAX_HOURS),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid selection" }, { status: 400 });

  try {
    const availability = await getAvailability(parsed.data.date);
    const quote = quoteInterval(availability, parsed.data.startId, parsed.data.hours);
    if (!quote) {
      return NextResponse.json(
        { error: "Selected hours are no longer available" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { quote, source: availability.source, checkedAt: availability.checkedAt, reservationCreated: false },
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
