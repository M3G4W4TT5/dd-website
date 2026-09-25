import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeAction } from "@/lib/marketing";

export const runtime = "nodejs";
const schema = z.object({
  list: z.enum(["personal", "booking"]),
  purpose: z.enum(["confirm", "unsubscribe"]),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export async function POST(request: Request) {
  const expected = new URL(process.env.SUBSCRIPTIONS_PUBLIC_BASE || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expected) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Expected JSON" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 512) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  try {
    const ok = await consumeAction(parsed.data.list, parsed.data.token, parsed.data.purpose);
    return NextResponse.json({ ok }, { status: ok ? 200 : 410, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Marketing action failed");
    return NextResponse.json({ error: "Action unavailable" }, { status: 503 });
  }
}
