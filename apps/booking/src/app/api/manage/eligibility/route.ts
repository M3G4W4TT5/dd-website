import { NextResponse } from "next/server";
import { z } from "zod";
import { BookingNotFound, getPretixManagementEligibility, ManagementUnavailable } from "@/lib/pretix-management";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };
const inputSchema = z.object({ code: z.string().max(32), secret: z.string().max(256) });

export async function POST(request: Request) {
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400, headers: noStore });
  }
  try {
    return NextResponse.json(await getPretixManagementEligibility(input.code, input.secret), { headers: noStore });
  } catch (error) {
    if (error instanceof BookingNotFound) return NextResponse.json({ error: "Booking not found" }, { status: 404, headers: noStore });
    if (error instanceof ManagementUnavailable) return NextResponse.json({ error: "Booking management unavailable" }, { status: 503, headers: noStore });
    return NextResponse.json({ error: "Booking management unavailable" }, { status: 503, headers: noStore });
  }
}
