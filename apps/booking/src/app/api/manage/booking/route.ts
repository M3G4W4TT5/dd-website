import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizedManageEmail } from "@/lib/manage-session";
import { cancelManagedBooking, changeManagedBooking, ManageConflict } from "@/lib/pretix-live-management";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), code: z.string().regex(/^[A-Za-z0-9]{5,20}$/) }),
  z.object({ action: z.literal("change"), code: z.string().regex(/^[A-Za-z0-9]{5,20}$/), firstHourIso: z.string().datetime({ offset: true }), endIso: z.string().datetime({ offset: true }) }),
]);
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415, headers });
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  try {
    const email = await authorizedManageEmail(parsed.data.code);
    if (!email) return NextResponse.json({ error: "Access expired" }, { status: 401, headers });
    const booking = parsed.data.action === "cancel"
      ? await cancelManagedBooking(parsed.data.code, email)
      : await changeManagedBooking(parsed.data.code, email, parsed.data.firstHourIso, parsed.data.endIso);
    return NextResponse.json({ booking }, { headers });
  } catch (error) {
    if (error instanceof ManageConflict) return NextResponse.json({ error: "Booking changed or operation unavailable" }, { status: 409, headers });
    console.error("Booking management operation failed");
    return NextResponse.json({ error: "Management unavailable" }, { status: 503, headers });
  }
}
