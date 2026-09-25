import { NextResponse } from "next/server";
import { z } from "zod";
import { requestManageLinks } from "@/lib/manage-recovery";

export const runtime = "nodejs";
const schema = z.object({ email: z.email().max(254), language: z.enum(["da", "en"]), website: z.string().max(200).optional() });
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415, headers });
  const raw = await request.text();
  if (raw.length > 1024) return NextResponse.json({ error: "Request too large" }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  if (!parsed.data.website) {
    try { await requestManageLinks(parsed.data.email, parsed.data.language); }
    catch { console.error("Booking link request failed"); return NextResponse.json({ error: "Request unavailable" }, { status: 503, headers }); }
  }
  return NextResponse.json({ ok: true }, { headers });
}
