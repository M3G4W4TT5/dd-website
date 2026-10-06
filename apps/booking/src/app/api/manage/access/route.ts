import { boundedJson, HttpError } from "@dd/runtime";
import { managementCookie } from "../../../../../server/config";
import { NextResponse } from "next/server";
import { z } from "zod";
import { consumeManageLink } from "@/lib/manage-recovery";

export const runtime = "nodejs";
const schema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

export async function POST(request: Request) {
  const expectedOrigin = new URL(
    process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000",
  ).origin;
  if (request.headers.get("origin") !== expectedOrigin)
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers },
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json(
      { error: "Expected JSON" },
      { status: 415, headers },
    );
  let body: unknown;
  try {
    body = await boundedJson(request, 1024);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof HttpError ? error.message : "Invalid JSON" },
      {
        status: error instanceof HttpError ? error.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers },
    );
  try {
    const access = await consumeManageLink(parsed.data.token);
    if (!access)
      return NextResponse.json(
        { error: "Link unavailable" },
        { status: 404, headers },
      );
    const response = NextResponse.json({ codes: access.codes, bookings: access.bookings }, { headers });
    response.cookies.set(
      "ttd-manage-session",
      access.session,
      managementCookie(process.env),
    );
    return response;
  } catch {
    console.error("Booking link access failed");
    return NextResponse.json(
      { error: "Request unavailable" },
      { status: 503, headers },
    );
  }
}
