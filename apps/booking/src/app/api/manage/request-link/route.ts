import { boundedJson, HttpError } from "@dd/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";
import { limit } from "@dd/database";
import { bookingDb } from "../../../../../server/notifications";
import { requestManageLinks } from "@/lib/manage-recovery";

export const runtime = "nodejs";
const schema = z.object({ email: z.email().max(254), language: z.enum(["da", "en"]), website: z.string().max(200).optional() });
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415, headers });
  let body: unknown;
  try { body = await boundedJson(request, 1024); }
  catch (error) { return NextResponse.json({error: error instanceof HttpError ? error.message : "Invalid JSON"}, {status: error instanceof HttpError ? error.status : 400, headers: {"Cache-Control":"no-store"}}); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
  if (!parsed.data.website) {
    if (!await limit(bookingDb(), "recovery-total", 100, 3600)) return NextResponse.json({error:"Too many requests"},{status:429,headers:{...headers,"Retry-After":"3600"}});
    try { await requestManageLinks(parsed.data.email, parsed.data.language); }
    catch { console.error("Booking link request failed"); return NextResponse.json({ error: "Request unavailable" }, { status: 503, headers }); }
  }
  return NextResponse.json({ ok: true }, { headers });
}
