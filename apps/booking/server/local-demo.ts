/** Only the unconfigured development catalog can avoid PostgreSQL admission.
 * Authentication still runs first; any provider identity or write gate disables this path. */
export function localCatalogDemo(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV === "development" && env.DD_MODE === "development" &&
    !["PRETIX_ORGANIZER_SLUG", "PRETIX_EVENT_SLUG", "PRETIX_ITEM_ID", "PRETIX_API_TOKEN",
      "PRETIX_MANAGE_API_TOKEN", "PRETIX_MANAGE_WRITE_API_TOKEN"].some(k => env[k]?.trim()) &&
    !["PRETIX_EVENTS_CHECKOUT_ENABLED", "BOOKING_SELF_SERVICE_ENABLED", "PAYMENT_RELEASE_ENABLED"].some(k => env[k] === "true");
}
