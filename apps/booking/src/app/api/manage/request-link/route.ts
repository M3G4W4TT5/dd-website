import { submissionId } from "../../../../../server/submission";
import { boundedJson, HttpError } from "@dd/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";
import { bookingClient } from "../../../../../server/client-identity";
import { AdmissionDenied } from "../../../../../../../server/database/admission";
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
    try { await requestManageLinks(parsed.data.email, parsed.data.language, submissionId(request), bookingClient(request)); }
    catch (error) {
      if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
      if (error instanceof AdmissionDenied) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { ...headers, "Retry-After": String(error.retryAfter) } });
      console.error("Booking link request failed"); return NextResponse.json({ error: "Request unavailable" }, { status: 503, headers }); }
  }
  return NextResponse.json({ ok: true }, { headers });
}
