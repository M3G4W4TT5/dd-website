import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/events";
import { eventRegistrationSchema, nativeCartHandoff, registrationTicket } from "@/lib/event-registration";
import { requestSubscription } from "@/lib/marketing";

export const runtime = "nodejs";
const hits = new Map<string, { count: number; expires: number }>();
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return json({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON" }, 415);
  const now = Date.now();
  for (const [key, hit] of hits) if (hit.expires <= now) hits.delete(key);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const hit = hits.get(ip) || { count: 0, expires: now + 60_000 };
  if (++hit.count > 10 || hits.size > 5000) return json({ error: "Too many requests" }, 429);
  hits.set(ip, hit);
  const raw = await request.text();
  if (raw.length > 4096) return json({ error: "Request too large" }, 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = eventRegistrationSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid event details" }, 400);
  const input = parsed.data;
  try {
    const catalog = await getCatalog();
    if (catalog.state !== "ready") return json({ error: "Availability unavailable" }, 503);
    const occurrence = catalog.occurrences.find(item => item.slug === input.slug && item.dateId === input.dateId);
    if (!occurrence || !registrationTicket(occurrence, input)) return json({ error: "Tickets or price changed" }, 409);
    if (!catalog.checkoutEnabled || !catalog.shopBase || occurrence.status !== "available" || !occurrence.roomVerified) {
      return json({ error: "Checkout is temporarily unavailable" }, 503);
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const namespace = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const handoff = nativeCartHandoff(catalog.organizer, occurrence, catalog.shopBase, input, namespace);
    let marketingRequested: boolean | null = null;
    if (input.marketingOptIn) {
      try {
        await requestSubscription("booking", input.email, input.language, "event-signup");
        marketingRequested = true;
      } catch {
        marketingRequested = false;
      }
    }
    return json({ ...handoff, marketingRequested });
  } catch {
    return json({ error: "Checkout is temporarily unavailable" }, 503);
  }
}
