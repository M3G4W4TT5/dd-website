import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAvailability } from "@/lib/availability";
import { quoteInterval, STUDIO_ZONE } from "@/lib/booking";
import { canManageBooking } from "@/lib/cancellation";
import { signPreviewBooking, verifyPreviewBooking } from "@/lib/manage-preview-token";

export const dynamic = "force-dynamic";

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), token: z.string().max(2048) }),
  z.object({
    action: z.literal("change"), token: z.string().max(2048),
    interval: z.object({ firstHourIso: z.iso.datetime({ offset: true }), endIso: z.iso.datetime({ offset: true }) }),
  }),
]);

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const key = process.env.MANAGE_PREVIEW_SIGNING_KEY;
  if (!key || key.length < 32) return NextResponse.json({ error: "Preview unavailable" }, { status: 503, headers: noStore });

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  }

  const booking = verifyPreviewBooking(input.token, key, Date.now());
  if (!booking) return NextResponse.json({ error: "Invalid preview booking" }, { status: 403, headers: noStore });
  if (!canManageBooking(booking.firstHourIso, new Date().toISOString())) {
    return NextResponse.json({ error: "Booking deadline passed" }, { status: 403, headers: noStore });
  }

  if (input.action === "cancel") {
    return NextResponse.json({ status: "cancelled", refund: "pending" }, { headers: noStore });
  }

  try {
    const originalHours = (Date.parse(booking.endIso) - Date.parse(booking.firstHourIso)) / 3_600_000;
    const requestedHours = (Date.parse(input.interval.endIso) - Date.parse(input.interval.firstHourIso)) / 3_600_000;
    if (!Number.isInteger(originalHours) || originalHours !== requestedHours) throw new Error("Duration changed");
    const day = DateTime.fromISO(input.interval.firstHourIso, { setZone: true }).setZone(STUDIO_ZONE).toISODate();
    if (!day) throw new Error("Invalid date");
    const availability = await getAvailability(day);
    const slot = availability.slots.find((entry) => entry.start === input.interval.firstHourIso);
    const quote = slot ? quoteInterval(availability, slot.id, originalHours) : null;
    if (!quote || quote.end !== input.interval.endIso) throw new Error("Availability changed");
    if (!canManageBooking(booking.firstHourIso, new Date().toISOString())) {
      return NextResponse.json({ error: "Booking deadline passed" }, { status: 403, headers: noStore });
    }
    const next = { ...booking, ...input.interval };
    return NextResponse.json({
      firstHourIso: next.firstHourIso,
      endIso: next.endIso,
      token: signPreviewBooking(next, key),
    }, { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Availability changed" }, { status: 409, headers: noStore });
  }
}
