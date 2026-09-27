import { createHash } from "node:crypto";
export async function requestBookingSubscription(
  email: string,
  language: "en" | "da",
  source: "booking-details" | "event-signup",
  optIn: boolean,
  submissionId: string,
) {
  if (!optIn) return;
  // Preview suppresses every marketing side effect, including preflight.
  if (process.env.PREVIEW === "true") return;
  const base = process.env.BOOKING_COMMUNICATIONS_URL;
  const bearer = process.env.BOOKING_MARKETING_BEARER;
  if (!base || !bearer || bearer.length < 32)
    throw new Error("Booking marketing unavailable");
  const url = new URL("/internal/booking-subscription", base);
  if (
    process.env.DD_MODE === "production" &&
    url.protocol !== "https:" &&
    !["booking-communications", "127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new Error("Internal calls across hosts require HTTPS");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    },
    body: JSON.stringify({
      email,
      language,
      source,
      optIn: true,
      idempotencyKey: createHash("sha256")
        .update(source + ":" + submissionId)
        .digest("hex"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Booking marketing unavailable");
}
