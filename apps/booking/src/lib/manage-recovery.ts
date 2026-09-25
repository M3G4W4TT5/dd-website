import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { Pool } from "pg";
import { DateTime } from "luxon";
import { recoveryLinks, recoveryOrdersSchema, type RecoveryOrder } from "./manage-recovery-orders";
import { getManagedBooking, getPaidOrderContact } from "./pretix-live-management";
import type { ManagedBooking } from "@/components/ManageBookingPanel";

type Language = "da" | "en";
let pool: Pool | undefined;

function config() {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const item = process.env.PRETIX_ITEM_ID?.trim();
  const token = process.env.PRETIX_MANAGE_API_TOKEN?.trim();
  const shop = process.env.PRETIX_SHOP_BASE?.trim();
  const database = process.env.SUBSCRIPTIONS_DATABASE_URL?.trim();
  const password = process.env.BOOKING_SMTP_PASSWORD?.trim();
  const hashKey = process.env.MANAGE_RECOVERY_HASH_KEY?.trim();
  if (!organizer || !event || !item || !/^\d+$/.test(item) || !token || !shop || !database || !password || !hashKey || hashKey.length < 32) {
    throw new Error("Booking link recovery is not configured");
  }
  const api = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  const shopBase = new URL(shop);
  if (!["http:", "https:"].includes(api.protocol) || !["http:", "https:"].includes(shopBase.protocol)) throw new Error("Invalid pretix URL");
  if (process.env.NODE_ENV === "production" && shopBase.protocol !== "https:") throw new Error("Pretix shop must use HTTPS");
  return { organizer, event, itemId: Number(item), token, api, shopBase, database, password, hashKey };
}

async function reserveRequest(database: string, hashKey: string, email: string) {
  const emailHash = createHmac("sha256", hashKey).update(email).digest("hex");
  pool ??= new Pool({ connectionString: database, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  await pool.query("DELETE FROM manage_link_requests WHERE window_start < now() - interval '1 day'");
  await pool.query("DELETE FROM manage_link_tokens WHERE expires_at < now()");
  const result = await pool.query<{ allowed: boolean }>(
    `INSERT INTO manage_link_requests (email_hash, window_start, request_count)
     VALUES ($1, now(), 1)
     ON CONFLICT (email_hash) DO UPDATE SET
       window_start = CASE WHEN manage_link_requests.window_start < now() - interval '1 hour' THEN now() ELSE manage_link_requests.window_start END,
       request_count = CASE WHEN manage_link_requests.window_start < now() - interval '1 hour' THEN 1 ELSE manage_link_requests.request_count + 1 END
     RETURNING request_count <= 3 AS allowed`,
    [emailHash],
  );
  return result.rows[0]?.allowed === true;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function database(cfg: ReturnType<typeof config>) {
  return pool ??= new Pool({ connectionString: cfg.database, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
}

function publicBase() {
  const url = new URL(process.env.SUBSCRIPTIONS_PUBLIC_BASE || "http://127.0.0.1:3000");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Recovery page must use HTTPS");
  return url.origin;
}

async function findOrders(cfg: ReturnType<typeof config>, email: string) {
  const prefix = `/api/v1/organizers/${encodeURIComponent(cfg.organizer)}/events/${encodeURIComponent(cfg.event)}/orders/`;
  let page: URL | null = new URL(prefix, cfg.api);
  page.searchParams.set("email", email);
  const orders: RecoveryOrder[] = [];
  for (let i = 0; page && i < 10; i++) {
    const response: Response = await fetch(page, {
      headers: { Authorization: `Token ${cfg.token}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Pretix order search failed");
    const data = recoveryOrdersSchema.parse(await response.json());
    orders.push(...data.results);
    if (orders.length > 200) throw new Error("Too many matching orders");
    page = data.next ? new URL(data.next, cfg.api) : null;
    if (page && (page.origin !== cfg.api.origin || page.pathname !== prefix)) throw new Error("Unexpected pretix page URL");
  }
  if (page) throw new Error("Too many pretix pages");
  const paid = recoveryLinks(orders, email, cfg.event, cfg.itemId, cfg.shopBase);
  const cancelled = await Promise.all(orders.filter((order) => order.event === cfg.event && order.status === "c" && order.email.trim().toLowerCase() === email).map(async (order) => {
    try {
      await getManagedBooking(order.code, email); // Detail read includes canceled positions and validates the rental product.
      const url = new URL(order.url);
      if (url.origin !== cfg.shopBase.origin || !url.pathname.startsWith(cfg.shopBase.pathname.replace(/\/$/, "") + "/")) return null;
      return { code: order.code, url: url.toString() };
    } catch { return null; }
  }));
  return [...paid, ...cancelled.filter((entry): entry is { code: string; url: string } => entry !== null)];
}

export async function requestManageLinks(rawEmail: string, language: Language) {
  const email = rawEmail.trim().toLowerCase();
  const cfg = config();
  if (!await reserveRequest(cfg.database, cfg.hashKey, email)) return;
  if (!(await findOrders(cfg, email)).length) return;
  const token = randomBytes(32).toString("base64url");
  await database(cfg).query(
    "INSERT INTO manage_link_tokens (token_hash, email, expires_at) VALUES ($1, $2, now() + interval '15 minutes')",
    [tokenHash(token), email],
  );
  try { await sendAccessEmail(cfg, email, token, language, false); }
  catch (error) {
    await database(cfg).query("DELETE FROM manage_link_tokens WHERE token_hash = $1", [tokenHash(token)]);
    throw error;
  }
}

async function sendAccessEmail(cfg: ReturnType<typeof config>, email: string, token: string, language: Language, confirmation: boolean, booking?: ManagedBooking) {
  const url = new URL("/manage/access", publicBase());
  url.searchParams.set("lang", language);
  url.hash = `token=${token}`;
  const da = language === "da";
  const studioTime = (iso: string) => DateTime.fromISO(iso, { setZone: true }).setZone("Europe/Copenhagen").setLocale(language)
    .toFormat(da ? "d. LLLL yyyy 'kl.' HH:mm" : "d LLLL yyyy, HH:mm");
  const text = [
    confirmation
      ? (da ? "Din TTD Studio-booking er bekræftet. Åbn og administrer din booking med linket herunder." : "Your TTD Studio booking is confirmed. Open and manage your booking with the link below.")
      : (da ? "Du bad om et nyt link til din TTD Studio-booking." : "You requested a new link to your TTD Studio booking."),
    ...(confirmation && booking ? [
      "",
      `${da ? "Bookingreference" : "Booking reference"}: ${booking.reference}`,
      `${da ? "Tid i studiet" : "Studio time"}: ${studioTime(booking.firstHourIso)} – ${studioTime(booking.endIso)}`,
      `${da ? "Betalt" : "Paid"}: ${new Intl.NumberFormat(da ? "da-DK" : "en-DK", { style: "currency", currency: "DKK" }).format(booking.paidOre / 100)}`,
      da ? "Sted: TTD Studio hos København Danser, Nygaardsvej 5a, 2. sal, 2100 København Ø." : "Location: TTD Studio at København Danser, Nygaardsvej 5a, 2nd floor, 2100 Copenhagen Ø, Denmark.",
    ] : []),
    "",
    url.toString(),
    "",
    confirmation
      ? (da ? "Linket kan bruges én gang og udløber efter 15 minutter." : "This link works once and expires after 15 minutes.")
      : (da ? "Linket kan bruges én gang og udløber efter 15 minutter. Hvis du ikke bad om dette, kan du ignorere mailen." : "The link can be used once and expires after 15 minutes. If you did not request this, you can ignore this email."),
    ...(confirmation ? ["", da ? "Når der er mere end 24 timer til den første bookede time, kan du ændre eller afbestille. Når linket udløber, kan du få et nyt på administrationssiden." : "You can change or cancel when more than 24 hours remain before your first booked hour. If this link expires, request another from the manage page.", `${publicBase()}/terms?lang=${language}`, "booking@didde-mie.com"] : []),
  ].join("\n");
  await nodemailer.createTransport({
      host: "smtp.purelymail.com", port: 465, secure: true,
      auth: { user: "booking@didde-mie.com", pass: cfg.password },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  }).sendMail({
      from: "booking@didde-mie.com", to: email, replyTo: "booking@didde-mie.com",
      subject: confirmation
        ? (da ? "Din TTD Studio-booking er bekræftet" : "Your TTD Studio booking is confirmed")
        : (da ? "Dit link til TTD Studio-booking" : "Your TTD Studio booking link"), text,
    });
}

/** A paid-order webhook is only a trigger; the email and rental are read from pretix. */
export async function sendPaidOrderManagementLink(code: string) {
  const cfg = config();
  const { email, language } = await getPaidOrderContact(code);
  const booking = await getManagedBooking(code, email);
  const claimed = await database(cfg).query(
    `INSERT INTO manage_paid_emails (order_code, claimed_until) VALUES ($1, now() + interval '2 minutes')
     ON CONFLICT (order_code) DO UPDATE SET claimed_until = now() + interval '2 minutes'
     WHERE manage_paid_emails.sent_at IS NULL AND (manage_paid_emails.claimed_until IS NULL OR manage_paid_emails.claimed_until < now())
     RETURNING order_code`, [code],
  );
  if (claimed.rowCount !== 1) return;
  const token = randomBytes(32).toString("base64url");
  try {
    await database(cfg).query("INSERT INTO manage_link_tokens (token_hash, email, expires_at) VALUES ($1, $2, now() + interval '15 minutes')", [tokenHash(token), email]);
    await sendAccessEmail(cfg, email, token, language, true, booking);
    await database(cfg).query("UPDATE manage_paid_emails SET sent_at = now(), claimed_until = NULL WHERE order_code = $1", [code]);
  } catch (error) {
    await database(cfg).query("DELETE FROM manage_link_tokens WHERE token_hash = $1", [tokenHash(token)]);
    await database(cfg).query("UPDATE manage_paid_emails SET claimed_until = NULL WHERE order_code = $1 AND sent_at IS NULL", [code]);
    throw error;
  }
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
  const session = randomBytes(32).toString("base64url");
  const client = await database(cfg).connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      "DELETE FROM manage_link_tokens WHERE token_hash = $1 AND email = $2 AND expires_at > now() RETURNING token_hash",
      [hash, email],
    );
    if (consumed.rowCount !== 1) { await client.query("ROLLBACK"); return null; }
    await client.query(
      "INSERT INTO manage_sessions (session_hash, email, order_codes, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')",
      [tokenHash(session), email, links.map(({ code }) => code)],
    );
    await client.query("COMMIT");
    return { session, codes: links.map(({ code }) => code) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
