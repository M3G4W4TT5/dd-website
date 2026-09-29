import { contact } from "@dd/contact";
import { marketing } from "@dd/marketing";
import { database, limit } from "@dd/database";
import {
  primaryContact,
  bookingContact,
  marketingRequest,
  marketingAction,
  internalSubscription,
} from "@dd/contracts";
import type { Mailer } from "@dd/mail";
import { communicationsConfig } from "./config";
import { boundedJson, equal, HttpError, json } from "./http";
import { verifyPrimaryIp } from "../contracts/primary-proxy";
export { communicationsConfig, mailConfig, mode } from "./config";
export { boundedJson, equal, HttpError, json } from "./http";
export function service(
  cfg: ReturnType<typeof communicationsConfig>,
  send: Mailer,
  pool = database(
    cfg.url,
    cfg.site === "primary" ? "primary_marketing" : "booking_marketing",
  ),
) {
  const list = cfg.site === "primary" ? "personal" : "booking";
  const subscriptions = marketing(pool, cfg.site, cfg.actionBase, cfg.key);
  async function handle(request: Request, peer = "unknown", verifiedProxy = false) {
    const path = new URL(request.url).pathname;
    const suppliedOrigin = request.headers.get("origin");
    const internal = path === "/internal/booking-subscription";
    let allowed: string | undefined;
    try {
      if (path === "/health" && request.method === "GET") {
        await pool.query("SELECT 1");
        return json({ ok: true });
      }
      if (internal) {
        if (
          cfg.site !== "booking" ||
          !cfg.bearer ||
          !equal(
            request.headers.get("authorization") ?? "",
            `Bearer ${cfg.bearer}`,
          )
        )
          throw new HttpError(401, "Unauthorized");
        if (request.method !== "POST")
          throw new HttpError(405, "Method not allowed");
      } else {
        if (!suppliedOrigin || !cfg.origins.includes(suppliedOrigin))
          throw new HttpError(403, "Origin not allowed");
        allowed = suppliedOrigin;
        if (request.method === "OPTIONS")
          return new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": allowed,
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              Vary: "Origin",
              "Cache-Control": "no-store",
            },
          });
        if (request.method !== "POST")
          throw new HttpError(405, "Method not allowed");
      }
      const body = await boundedJson(
        request,
        path === "/api/contact" ? 8192 : 2048,
      );
      let ip = peer;
      if (cfg.primaryProxyKey && !internal) {
        const signedIp = verifiedProxy ? await verifyPrimaryIp(cfg.primaryProxyKey, request) : null;
        if (!signedIp) throw new HttpError(403, "Untrusted primary proxy");
        ip = signedIp;
      } else if (verifiedProxy || cfg.trustedProxies.includes(peer)) {
        const header = request.headers.get("x-real-ip");
        if (header && /^[a-fA-F0-9:.]{3,64}$/.test(header)) ip = header;
      }
      if (
        !(await limit(
          pool,
          "request:" + path + ":" + ip,
          internal ? 120 : 30,
          3600,
        ))
      )
        throw new HttpError(429, "Too many requests");
      if (internal) {
        const p = internalSubscription.safeParse(body);
        if (!p.success) throw new HttpError(400, "Invalid subscription");
        await subscriptions.request(
          p.data.email,
          p.data.language,
          "confirm",
          p.data.source,
          p.data.idempotencyKey,
        );
        return json({ ok: true });
      }
      if (path === "/api/contact") {
        const parsed = (
          cfg.site === "primary" ? primaryContact : bookingContact
        ).safeParse(body);
        if (!parsed.success)
          throw new HttpError(400, "Invalid contact details");
        await contact(
          cfg.site,
          parsed.data,
          send,
          async (email) =>
            (await limit(
              pool,
              "ack-address:" + email.toLowerCase(),
              1,
              3600,
            )) && (await limit(pool, "ack-total", 30, 3600)),
        );
        return json({ ok: true }, 200, allowed);
      }
      if (path === "/api/marketing") {
        const p = marketingRequest.safeParse(body);
        if (!p.success) throw new HttpError(400, "Invalid request");
        if (p.data.list && p.data.list !== list)
          throw new HttpError(403, "Identity not allowed");
        if (!p.data.website)
          await subscriptions.request(
            p.data.email,
            p.data.language,
            p.data.action === "subscribe" ? "confirm" : "unsubscribe",
            list + "-site-form",
          );
        return json({ ok: true }, 200, allowed);
      }
      if (path === "/api/marketing/action") {
        const p = marketingAction.safeParse(body);
        if (!p.success) throw new HttpError(400, "Invalid link");
        if (p.data.list && p.data.list !== list)
          throw new HttpError(403, "Identity not allowed");
        const ok = await subscriptions.consume(p.data.token, p.data.purpose);
        return json({ ok }, ok ? 200 : 410, allowed);
      }
      throw new HttpError(404, "Not found");
    } catch (e) {
      if (e instanceof HttpError)
        return json({ error: e.message }, e.status, allowed);
      console.error("Communications dependency failure");
      return json({ error: "Request unavailable" }, 503, allowed);
    }
  }
  return { handle, pool, subscriptions };
}
