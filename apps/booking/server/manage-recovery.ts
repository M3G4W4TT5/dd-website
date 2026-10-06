import { boundedPretix } from "./pretix-deadline";
import { z } from "zod";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { enqueue, digest } from "@dd/database";
import { admission, budget, emergency, privateKey, setting, AdmissionDenied, clientIdentity } from "../../../server/database/admission";
import type { Mailer } from "@dd/mail";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { pretixFetch, pretixHeaders, pretixNextPage } from "./pretix-http";
import {
  recoveryLinks,
  recoveryOrdersSchema,
  type RecoveryOrder,
} from "../src/lib/manage-recovery-orders";
import {
  getManagedBooking,
  getPaidOrderContact,
} from "./pretix-live-management";
import type { ManagedBooking } from "@dd/contracts";
import { getManagedBookingSummaries } from "./managed-booking-summaries";

type Language = "da" | "en";
let pool: Pool | undefined;

function config() {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const item = process.env.PRETIX_ITEM_ID?.trim();
  const token = process.env.PRETIX_MANAGE_API_TOKEN?.trim();
  const shop = process.env.PRETIX_SHOP_BASE?.trim();
  const database = process.env.BOOKING_DATABASE_URL?.trim();
  const hashKey = process.env.MANAGE_RECOVERY_HASH_KEY?.trim();
  if (
    !organizer ||
    !event ||
    !item ||
    !/^\d+$/.test(item) ||
    !token ||
    !shop ||
    !database ||
    !hashKey ||
    hashKey.length < 32
  ) {
    throw new Error("Booking link recovery is not configured");
  }
  const api = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  const shopBase = new URL(shop);
  if (
    !["http:", "https:"].includes(api.protocol) ||
    !["http:", "https:"].includes(shopBase.protocol)
  )
    throw new Error("Invalid pretix URL");
  if (process.env.NODE_ENV === "production" && shopBase.protocol !== "https:")
    throw new Error("Pretix shop must use HTTPS");
  return {
    organizer,
    event,
    itemId: Number(item),
    token,
    api,
    shopBase,
    database,
    hashKey,
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function database(cfg: ReturnType<typeof config>) {
  return (pool ??= new Pool({
    connectionString: cfg.database,
    max: 4,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: true,
  }));
}

function publicBase() {
  const url = new URL(
    process.env.BOOKING_PUBLIC_BASE_URL || "http://127.0.0.1:3000",
  );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Recovery page must use HTTPS");
  return url.origin;
}

async function findOrdersUnbounded(cfg: ReturnType<typeof config>, email: string) {
  const prefix = `/api/v1/organizers/${encodeURIComponent(cfg.organizer)}/events/${encodeURIComponent(cfg.event)}/orders/`;
  let page: URL | null = new URL(prefix, cfg.api);
  page.searchParams.set("email", email);
  const orders: RecoveryOrder[] = [];
  for (let i = 0; page && i < 10; i++) {
    const response: Response = await pretixFetch(page, {
      headers: pretixHeaders(page, cfg.token),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Pretix order search failed");
    const data = recoveryOrdersSchema.parse(await response.json());
    orders.push(...data.results);
    if (orders.length > 200) throw new Error("Too many matching orders");
    page = pretixNextPage(data.next, page, cfg.api);
  }
  if (page) throw new Error("Too many pretix pages");
  const paid = recoveryLinks(
    orders,
    email,
    cfg.event,
    cfg.itemId,
    cfg.shopBase,
  );
  const cancelled = await Promise.all(
    orders
      .filter(
        (order) =>
          order.event === cfg.event &&
          order.status === "c" &&
          order.email.trim().toLowerCase() === email,
      )
      .map(async (order) => {
        try {
          await getManagedBooking(order.code, email); // Detail read includes canceled positions and validates the rental product.
          const url = new URL(order.url);
          if (
            url.origin !== cfg.shopBase.origin ||
            !url.pathname.startsWith(
              cfg.shopBase.pathname.replace(/\/$/, "") + "/",
            )
          )
            return null;
          return { code: order.code, url: url.toString() };
        } catch {
          return null;
        }
      }),
  );
  return [
    ...paid,
    ...cancelled.filter(
      (entry): entry is { code: string; url: string } => entry !== null,
    ),
  ];
}

function findOrders(cfg: ReturnType<typeof config>, email: string) {
  return boundedPretix(() => findOrdersUnbounded(cfg, email));
}

export async function requestManageLinks(rawEmail: string, language: Language, submissionId: string, client: ReturnType<typeof clientIdentity>) {
  const email = z.email().max(254).parse(rawEmail.trim().toLowerCase()), cfg = config();
  if (!["da", "en"].includes(language) || !submissionId || submissionId.length > 128) throw new Error("Invalid recovery intent");
  const key = process.env.PAYLOAD_KEY;
  if (!key || !/^[0-9a-f]{64}$/.test(key)) throw new Error("Recovery queue unavailable");
  // Revalidate even trusted helper callers; identities never come from email or UUID.
  if (!client || clientIdentity(client.address).prefix !== client.prefix) throw new Error("Verified recovery client required");
  const clientKey = privateKey(cfg.hashKey, "recovery-client", client.address);
  const identity = `recovery:${privateKey(cfg.hashKey, "recovery-email", email)}:${digest(submissionId)}`;
  try {
    await admission(database(cfg), "recovery", async (c) => {
      if ((await c.query("SELECT 1 FROM deliveries WHERE identity=$1", [identity])).rowCount) return;
      await budget(c, clientKey, setting("RECOVERY_CLIENT_HOURLY", 6), 3600);
      await budget(c, privateKey(cfg.hashKey, "recovery-prefix", client.prefix), setting("RECOVERY_PREFIX_HOURLY", 60), 3600);
      await budget(c, privateKey(cfg.hashKey, "recovery-email", email), 3, 3600, "contact");
      const outstanding = await c.query<{ total: string; client: string }>(
        "SELECT count(*) AS total,count(*) FILTER(WHERE admission_client=$1) AS client FROM deliveries WHERE kind='recovery' AND state IN ('queued','leased','sending')", [clientKey]);
      if (Number(outstanding.rows[0].client) >= setting("RECOVERY_CLIENT_OUTSTANDING", 2)) throw new AdmissionDenied("client");
      if (Number(outstanding.rows[0].total) >= setting("RECOVERY_QUEUE_MAX", 100)) throw new AdmissionDenied("capacity");
      await emergency(c, "recovery", setting("RECOVERY_EMERGENCY_BURST", 200), setting("RECOVERY_REFILL_SECONDS", 10));
      await enqueue(c, identity, "recovery", { email, language }, key);
      await c.query("UPDATE deliveries SET admission_client=$2 WHERE identity=$1", [identity, clientKey]);
    });
  } catch (e) {
    // Address throttle is deliberately indistinguishable from an unknown email.
    if (e instanceof AdmissionDenied && e.reason === "contact") return;
    throw e;
  }
}

async function accessMessage(
  cfg: ReturnType<typeof config>,
  email: string,
  token: string,
  language: Language,
  confirmation: boolean,
  booking?: ManagedBooking,
) {
  const url = new URL("/manage/access", publicBase());
  url.searchParams.set("lang", language);
  url.hash = `token=${token}`;
  return bookingAccessEmail(email, url.toString(), language, confirmation, booking);
}

/** Shared renderer for delivery and review drafts; action tokens remain intact. */
export function bookingAccessEmail(email: string, url: string, language: Language, confirmation: boolean, booking?: ManagedBooking) {
  const da = language === "da";
  const studioTime = (iso: string) =>
    DateTime.fromISO(iso, { setZone: true })
      .setZone("Europe/Copenhagen")
      .setLocale(language)
      .toFormat(da ? "d. LLLL yyyy 'kl.' HH:mm" : "d LLLL yyyy, HH:mm");
  const text = [
    confirmation
      ? da
        ? "Din TTD Studio-booking er bekræftet. Åbn og administrer din booking med linket herunder."
        : "Your TTD Studio booking is confirmed. Open and manage your booking with the link below."
      : da
        ? "Du bad om et nyt link til din TTD Studio-booking."
        : "You requested a new link to your TTD Studio booking.",
    ...(confirmation && booking
      ? [
          "",
          `${da ? "Bookingreference" : "Booking reference"}: ${booking.reference}`,
          `${da ? "Tid i studiet" : "Studio time"}: ${studioTime(booking.firstHourIso)} – ${studioTime(booking.endIso)}`,
          `${da ? "Betalt" : "Paid"}: ${new Intl.NumberFormat(da ? "da-DK" : "en-DK", { style: "currency", currency: "DKK" }).format(booking.paidOre / 100)}`,
          da
            ? "Sted: TTD Studio hos København Danser, Nygaardsvej 5a, 2. sal, 2100 København Ø."
            : "Location: TTD Studio at København Danser, Nygaardsvej 5a, 2nd floor, 2100 Copenhagen Ø, Denmark.",
        ]
      : []),
    "",
    url.toString(),
    "",
    confirmation
      ? da
        ? "Linket kan bruges én gang og udløber efter 15 minutter."
        : "This link works once and expires after 15 minutes."
      : da
        ? "Linket kan bruges én gang og udløber efter 15 minutter. Hvis du ikke bad om dette, kan du ignorere mailen."
        : "The link can be used once and expires after 15 minutes. If you did not request this, you can ignore this email.",
    ...(confirmation
      ? [
          "",
          da
            ? "Når der er mere end 24 timer til den første bookede time, kan du ændre eller afbestille. Når linket udløber, kan du få et nyt på administrationssiden."
            : "You can change or cancel when more than 24 hours remain before your first booked hour. If this link expires, request another from the manage page.",
          `${publicBase()}/terms?lang=${language}`,
          "booking@didde-mie.com",
        ]
      : []),
  ].join("\n");
  return {
    to: email,
    subject: confirmation
      ? da
        ? "Din TTD Studio-booking er bekræftet"
        : "Your TTD Studio booking is confirmed"
      : da
        ? "Dit link til TTD Studio-booking"
        : "Your TTD Studio booking link",
    text,
  };
}

/** Worker only: authoritative reads; no email is sent for unknown/event/pending orders. */
export async function deliverAccess(
  kind: "recovery" | "paid",
  payload: { email?: string; language?: Language; code?: string },
  send: Mailer,
  messageId: string,
) {
  const cfg = config();
  let email: string, language: Language, booking: ManagedBooking | undefined;
  if (kind === "paid") {
    const contact = await getPaidOrderContact(payload.code!);
    email = contact.email;
    language = contact.language;
    booking = await getManagedBooking(payload.code!, email);
  } else {
    email = payload.email!;
    language = payload.language!;
    if (!(await findOrders(cfg, email)).length) return;
  }
  const token = randomBytes(32).toString("base64url");
  await database(cfg).query(
    "INSERT INTO manage_link_tokens(token_hash,email,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [tokenHash(token), email],
  );
  const mail = await accessMessage(
    cfg,
    email,
    token,
    language,
    kind === "paid",
    booking,
  );
  await send(kind, mail, messageId);
}

export async function consumeManageLink(token: string) {
  const cfg = config();
  const hash = tokenHash(token);
  const found = await database(cfg).query<{ email: string }>(
    "SELECT email FROM manage_link_tokens WHERE token_hash = $1 AND expires_at > now()",
    [hash],
  );
  const email = found.rows[0]?.email;
  if (!email) return null;
  const links = await findOrders(cfg, email);
  if (!links.length) return null;
  // Read current dates before consuming the one-time token, allowing read failures to be retried.
  const bookings = await getManagedBookingSummaries(links.map(({ code }) => code), email);
  const session = randomBytes(32).toString("base64url");
  const client = await database(cfg).connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      "DELETE FROM manage_link_tokens WHERE token_hash = $1 AND email = $2 AND expires_at > now() RETURNING token_hash",
      [hash, email],
    );
    if (consumed.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "INSERT INTO manage_sessions (session_hash, email, order_codes, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')",
      [tokenHash(session), email, links.map(({ code }) => code)],
    );
    await client.query("COMMIT");
    return { session, codes: links.map(({ code }) => code), bookings };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
