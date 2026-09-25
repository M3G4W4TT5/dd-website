import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sendPaidOrderManagementLink } from "@/lib/manage-recovery";

export const runtime = "nodejs";
const schema = z.object({ organizer: z.string(), event: z.string(), code: z.string().regex(/^[A-Za-z0-9]{5,20}$/), action: z.string() });

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
  const raw = await request.text();
  if (raw.length > 2048) return new Response(null, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return new Response(null, { status: 400 }); }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return new Response(null, { status: 400 });
  const { organizer, event, code, action } = parsed.data;
  if (organizer !== process.env.PRETIX_ORGANIZER_SLUG || event !== process.env.PRETIX_EVENT_SLUG || action !== "pretix.event.order.paid") {
    return NextResponse.json({ accepted: true });
  }
  try {
    await sendPaidOrderManagementLink(code);
    return NextResponse.json({ accepted: true });
  } catch {
    console.error("Paid booking notification failed");
    return new Response(null, { status: 503 });
  }
}
