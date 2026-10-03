import { mode } from "../../../server/runtime/config";
import { origin } from "../../../server/runtime/config";
export function validateBooking(env: NodeJS.ProcessEnv) {
  for (const key of Object.keys(env))
    if (
      (key.includes("SMTP_") ||
        key === "SUBSCRIPTIONS_DATABASE_URL" ||
        key === "MARKETING_DATABASE_URL") &&
      env[key]
    )
      throw new Error("Disallowed booking web credential");
  const production = mode(env) === "production";
  if (
    env.BOOKING_DATABASE_URL &&
    new URL(env.BOOKING_DATABASE_URL).username !== "booking_web_runtime"
  )
    throw new Error("Booking web role required");
  if (production) {
    for (const key of [
      "BOOKING_DATABASE_URL",
      "BOOKING_PUBLIC_BASE_URL",
      "CONTACT_BOOKING_ORIGIN",
      "BOOKING_COMMUNICATIONS_URL",
      "BOOKING_MARKETING_BEARER",
      "PAYLOAD_KEY",
      "MANAGE_RECOVERY_HASH_KEY",
      "BOOKING_INGRESS_KEY",
      "PRETIX_API_TOKEN",
      "PRETIX_MANAGE_API_TOKEN",
      "PRETIX_MANAGE_WEBHOOK_USER",
      "PRETIX_MANAGE_WEBHOOK_PASSWORD",
    ])
      if (!env[key]) throw new Error(`Missing ${key}`);
    const publicOrigin = origin(env.BOOKING_PUBLIC_BASE_URL!, true);
    if (origin(env.CONTACT_BOOKING_ORIGIN!, true) !== publicOrigin)
      throw new Error("Booking origin mismatch");
    if (
      (env.BOOKING_MARKETING_BEARER?.length ?? 0) < 32 ||
      (env.MANAGE_RECOVERY_HASH_KEY?.length ?? 0) < 32
    )
      throw new Error("Booking private keys too short");
    const communications = new URL(env.BOOKING_COMMUNICATIONS_URL!);
    if (
      communications.protocol !== "https:" &&
      !(
        communications.protocol === "http:" &&
        ["booking-communications", "127.0.0.1", "localhost"].includes(
          communications.hostname,
        )
      )
    )
      throw new Error("Communications across hosts require HTTPS");
    if (!["sandbox", "live"].includes(env.PAYMENT_ENVIRONMENT ?? ""))
      throw new Error("Payment environment required");
    if (
      env.PAYMENT_ENVIRONMENT === "live" &&
      env.PAYMENT_RELEASE_ENABLED !== "true"
    )
      throw new Error("Live payment gate closed");
  }
  if (
    env.PREVIEW === "true" &&
    (env.BOOKING_SELF_SERVICE_ENABLED === "true" ||
      env.PRETIX_EVENTS_CHECKOUT_ENABLED === "true")
  )
    throw new Error("Preview release gates must be closed");
  if (env.BOOKING_INGRESS_KEY && !/^[a-f0-9]{64}$/.test(env.BOOKING_INGRESS_KEY)) throw new Error("Invalid ingress key");
  if (env.PAYLOAD_KEY && !/^[0-9a-f]{64}$/.test(env.PAYLOAD_KEY))
    throw new Error("Invalid payload key");
}

export function managementCookie(env: NodeJS.ProcessEnv) {
  return {
    httpOnly: true,
    secure: mode(env) === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 3600,
  };
}

export function validateWorker(env: NodeJS.ProcessEnv) {
  if (
    new URL(env.BOOKING_DATABASE_URL ?? "").username !==
    "booking_worker_runtime"
  )
    throw new Error("Worker role required");
  for (const key of [
    "PRETIX_MANAGE_WRITE_API_TOKEN",
    "MARKETING_DATABASE_URL",
    "BOOKING_MARKETING_BEARER",
    "CONTACT_SMTP_PASSWORD",
    "NEWSLETTER_SMTP_PASSWORD",
  ])
    if (env[key]) throw new Error("Disallowed worker credential");
  if (mode(env) === "production") {
    for (const key of [
      "PRETIX_MANAGE_API_TOKEN",
      "PRETIX_ORGANIZER_SLUG",
      "PRETIX_EVENT_SLUG",
      "PRETIX_ITEM_ID",
      "PRETIX_SHOP_BASE",
      "MANAGE_RECOVERY_HASH_KEY",
      "PAYLOAD_KEY",
      "BOOKING_PUBLIC_BASE_URL",
    ])
      if (!env[key]) throw new Error(`Missing ${key}`);
    origin(env.BOOKING_PUBLIC_BASE_URL!, true);
    if (new URL(env.PRETIX_SHOP_BASE!).protocol !== "https:")
      throw new Error("Worker shop requires HTTPS");
    if (
      !/^\d+$/.test(env.PRETIX_ITEM_ID!) ||
      (env.MANAGE_RECOVERY_HASH_KEY?.length ?? 0) < 32 ||
      !/^([0-9a-f]{64})$/.test(env.PAYLOAD_KEY!)
    )
      throw new Error("Invalid worker configuration");
  }
}
