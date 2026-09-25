import { NextResponse } from "next/server";
import { z } from "zod";
import { requestSubscription, requestUnsubscribe } from "@/lib/marketing";

export const runtime = "nodejs";
const inputSchema = z.object({
  list: z.enum(["personal", "booking"]),
  action: z.enum(["subscribe", "unsubscribe"]),
  email: z.email().max(254),
  language: z.enum(["da", "en"]),
  website: z.string().max(200).optional(),
});
const hits = new Map<string, { count: number; expires: number }>();

function allowedOrigin(list: "personal" | "booking") {
  const value = list === "personal"
    ? process.env.CONTACT_PERSONAL_ORIGIN || process.env.NEXT_PUBLIC_PERSONAL_URL || "http://127.0.0.1:4321"
    : process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000";
  return new URL(value).origin;
}

function json(data: object, status: number, origin?: string) {
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  return NextResponse.json(data, { status, headers });
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== allowedOrigin("personal")) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store", Vary: "Origin",
  } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || (origin !== allowedOrigin("personal") && origin !== allowedOrigin("booking"))) {
    return json({ error: "Origin not allowed" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON" }, 415, origin);
  const raw = await request.text();
  if (raw.length > 1024) return json({ error: "Request too large" }, 413, origin);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400, origin); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request" }, 400, origin);
  const input = parsed.data;
  if (origin !== allowedOrigin(input.list)) return json({ error: "Origin not allowed" }, 403, origin);
  if (input.website) return json({ ok: true }, 200, origin);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${input.action}:${ip}`;
  const now = Date.now();
  const current = hits.get(key);
  if (current && current.expires > now && current.count >= 10) return json({ error: "Too many requests" }, 429, origin);
  hits.set(key, current && current.expires > now
    ? { count: current.count + 1, expires: current.expires }
    : { count: 1, expires: now + 60 * 60 * 1000 });
  if (hits.size > 10000) for (const [address, record] of hits) if (record.expires <= now) hits.delete(address);

  try {
    if (input.action === "subscribe") await requestSubscription(input.list, input.email, input.language, `${input.list}-site-form`);
    else await requestUnsubscribe(input.list, input.email, input.language);
    return json({ ok: true }, 200, origin);
  } catch {
    console.error("Marketing request failed");
    return json({ error: "Request unavailable" }, 503, origin);
  }
}
