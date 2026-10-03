import { submissionId } from "../../../../../server/submission";
import { boundedJson, HttpError } from "@dd/runtime";
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/events";
import { eventRegistrationSchema, nativeCartHandoff, registrationTicket } from "@/lib/event-registration";
import { requestBookingSubscription } from "../../../../../server/marketing-client";
import { catalogRequest } from "../../../../../server/catalog-work";
import { AdmissionDenied } from "../../../../../../../server/database/admission";

export const runtime = "nodejs";
const json = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const expectedOrigin = new URL(process.env.CONTACT_BOOKING_ORIGIN || "http://127.0.0.1:3000").origin;
  if (request.headers.get("origin") !== expectedOrigin) return json({ error: "Origin not allowed" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Expected JSON" }, 415);
  let body: unknown;
  try { body = await boundedJson(request, 4096); }
  catch (error) { return NextResponse.json({error: error instanceof HttpError ? error.message : "Invalid JSON"}, {status: error instanceof HttpError ? error.status : 400, headers: {"Cache-Control":"no-store"}}); }
  const parsed = eventRegistrationSchema.safeParse(body);
  if (!parsed.success) return parsed.error.issues.some(issue => issue.path.join(".") === "phone")
    ? json({ code: "invalid_phone" }, 422) : json({ error: "Invalid event details" }, 400);
  const input = parsed.data;
  try {
    await catalogRequest(request);
    const catalog = await getCatalog(true);
    if (catalog.state !== "ready") return json({ error: "Availability unavailable" }, 503);
    const occurrence = catalog.occurrences.find(item => item.slug === input.slug && item.dateId === input.dateId);
    if (!occurrence || !registrationTicket(occurrence, input)) return json({ error: "Tickets or price changed" }, 409);
    if (!catalog.checkoutEnabled || !catalog.shopBase || !occurrence.checkoutEligible) {
      return json({ error: "Checkout is temporarily unavailable" }, 503);
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const namespace = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const handoff = nativeCartHandoff(catalog.organizer, occurrence, catalog.shopBase, input, namespace);
    let marketingRequested: boolean | null = null;
    if (input.marketingOptIn) {
      try {
        await requestBookingSubscription(input.email, input.language, "event-signup", input.marketingOptIn, submissionId(request));
        marketingRequested = true;
      } catch {
        marketingRequested = false;
      }
    }
    return json({ ...handoff, marketingRequested });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof AdmissionDenied) return NextResponse.json({ error: "Too many requests" }, {
      status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(error.retryAfter) },
    });
    return json({ error: "Checkout is temporarily unavailable" }, 503);
  }
}
