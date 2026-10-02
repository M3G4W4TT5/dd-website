import { AdmissionDenied } from "../../../../../../../server/database/admission";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeWebhook } from "../../../../../server/notifications";
import { boundedJson,HttpError } from "@dd/runtime";

export const runtime = "nodejs";
const schema = z.object({ organizer: z.string(), event: z.string(), code: z.string().regex(/^[A-Za-z0-9]{5,20}$/), action: z.string(), notification_id: z.union([z.string().min(1).max(128),z.number().int().nonnegative()]) });

function equal(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export async function POST(request: Request) {
  const user = process.env.PRETIX_MANAGE_WEBHOOK_USER?.trim();
  const password = process.env.PRETIX_MANAGE_WEBHOOK_PASSWORD?.trim();
  if (!user || !password || password.length < 32) return new Response(null, { status: 503 });
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Basic ") ? Buffer.from(authorization.slice(6), "base64").toString("utf8") : "";
  if (!equal(supplied, `${user}:${password}`)) return new Response(null, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Booking webhook"' } });
  let payload:unknown;
  try{payload=await boundedJson(request,2048);}catch(e){return new Response(null,{status:e instanceof HttpError?e.status:400});}
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { organizer, event } = parsed.data;
  if (organizer !== process.env.PRETIX_ORGANIZER_SLUG || event !== process.env.PRETIX_EVENT_SLUG) {
    return NextResponse.json({ accepted: true });
  }
  try {
    await intakeWebhook(parsed.data);
    return NextResponse.json({ accepted: true });
  } catch (error) {
    if(error instanceof AdmissionDenied) return new Response(null,{status:429,headers:{"Retry-After":String(error.retryAfter)}});
    console.error("Booking webhook persistence failed");
    return new Response(null, { status: 503 });
  }
}
