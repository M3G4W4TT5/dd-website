import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import nodemailer from "nodemailer";

export type MarketingList = "personal" | "booking";
export type MarketingLanguage = "da" | "en";

export const consentVersion: Record<MarketingList, string> = {
  personal: "dd-newsletter-2026-09-25-v1",
  booking: "ttd-offers-events-discounts-2026-09-25-v1",
};

const mailboxes = { personal: "newsletter@didde-mie.com", booking: "booking@didde-mie.com" } as const;
const tokenHours = 48;
let pool: Pool | undefined;

function db() {
  const connectionString = process.env.SUBSCRIPTIONS_DATABASE_URL;
  if (!connectionString) throw new Error("Subscriptions database is not configured");
  return pool ??= new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicBase() {
  const value = process.env.SUBSCRIPTIONS_PUBLIC_BASE || "http://127.0.0.1:3000";
  const url = new URL(value);
  if (!(["https:", "http:"].includes(url.protocol))) throw new Error("Invalid subscriptions public URL");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Subscriptions public URL must use HTTPS");
  }
  return url.origin;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function mailer(list: MarketingList) {
  const password = list === "personal" ? process.env.NEWSLETTER_SMTP_PASSWORD : process.env.BOOKING_SMTP_PASSWORD;
  if (!password) throw new Error("Subscription email is not configured");
  return nodemailer.createTransport({
    host: "smtp.purelymail.com", port: 465, secure: true,
    auth: { user: mailboxes[list], pass: password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
}

function actionUrl(action: "confirm" | "unsubscribe", list: MarketingList, token: string, language: MarketingLanguage) {
  const url = new URL(`/marketing/${action}`, publicBase());
  url.searchParams.set("list", list);
  url.searchParams.set("token", token);
  url.searchParams.set("lang", language);
  return url.toString();
}

async function newToken(list: MarketingList, email: string, purpose: "confirm" | "unsubscribe") {
  const token = randomBytes(32).toString("base64url");
  await db().query("DELETE FROM marketing_action_tokens WHERE list = $1 AND email = $2", [list, email]);
  await db().query(
    "INSERT INTO marketing_action_tokens (token_hash, list, email, purpose, expires_at) VALUES ($1, $2, $3, $4, now() + interval '48 hours')",
    [hash(token), list, email, purpose],
  );
  return token;
}

export async function requestSubscription(list: MarketingList, rawEmail: string, language: MarketingLanguage, source: string) {
  const email = normalizeEmail(rawEmail);
  const existing = await db().query<{ status: string; recent: boolean }>(
    "SELECT status, requested_at > now() - interval '15 minutes' AS recent FROM marketing_subscriptions WHERE list = $1 AND email = $2", [list, email],
  );
  if (existing.rows[0]?.status === "active") return;
  if (existing.rows[0]?.status === "pending" && existing.rows[0].recent) return;
  await db().query(
    `INSERT INTO marketing_subscriptions (list, email, status, consent_version, source, language)
     VALUES ($1, $2, 'pending', $3, $4, $5)
     ON CONFLICT (list, email) DO UPDATE SET status = 'pending', consent_version = EXCLUDED.consent_version,
       source = EXCLUDED.source, language = EXCLUDED.language, requested_at = now(),
       confirmed_at = NULL, unsubscribed_at = NULL`,
    [list, email, consentVersion[list], source, language],
  );
  const token = await newToken(list, email, "confirm");
  const url = actionUrl("confirm", list, token, language);
  const personal = list === "personal";
  const subject = personal ? "Confirm your DD newsletter signup" : language === "da" ? "Bekræft tilmelding til TTD Studio-mails" : "Confirm TTD Studio email signup";
  const description = personal
    ? "updates on my work and dance videos"
    : language === "da" ? "tilbud, nye events og rabatter fra TTD Studio" : "TTD Studio offers, new events and discounts";
  const text = language === "da" && !personal
    ? `Du har bedt om at modtage ${description} fra TOTAL ENTERTAINMENT. Bekræft din tilmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Linket udløber efter ${tokenHours} timer. Du kan altid afmelde dig. Svar til denne adresse, hvis du har spørgsmål.`
    : `You asked to receive ${description} from ${personal ? "DD Production" : "TOTAL ENTERTAINMENT"}. Confirm your signup here:\n${url}\n\nIf you did not request this, ignore this email. The link expires in ${tokenHours} hours. You can unsubscribe at any time. Reply to this address with questions.`;
  try {
    await mailer(list).sendMail({ from: mailboxes[list], to: email, replyTo: mailboxes[list], subject, text });
  } catch (error) {
    await db().query("DELETE FROM marketing_action_tokens WHERE token_hash = $1", [hash(token)]);
    await db().query("UPDATE marketing_subscriptions SET requested_at = now() - interval '16 minutes' WHERE list = $1 AND email = $2 AND status = 'pending'", [list, email]);
    throw error;
  }
}

export async function requestUnsubscribe(list: MarketingList, rawEmail: string, language: MarketingLanguage) {
  const email = normalizeEmail(rawEmail);
  const existing = await db().query<{ status: string; recent: boolean }>(
    `SELECT s.status, EXISTS (
       SELECT 1 FROM marketing_action_tokens t WHERE t.list = s.list AND t.email = s.email
       AND t.purpose = 'unsubscribe' AND t.expires_at > now() + interval '47 hours'
     ) AS recent FROM marketing_subscriptions s WHERE s.list = $1 AND s.email = $2`, [list, email],
  );
  if (existing.rows[0]?.status !== "active") return;
  if (existing.rows[0].recent) return;
  const token = await newToken(list, email, "unsubscribe");
  const url = actionUrl("unsubscribe", list, token, language);
  try { await mailer(list).sendMail({
    from: mailboxes[list], to: email, replyTo: mailboxes[list],
    subject: language === "da" ? "Bekræft afmelding" : "Confirm unsubscribe",
    text: language === "da"
      ? `Bekræft din afmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Du kan også svare på denne mail og bede om afmelding.`
      : `Confirm your unsubscribe here:\n${url}\n\nIf you did not request this, ignore this email. You can also reply to this message and ask to unsubscribe.`,
  }); } catch (error) {
    await db().query("DELETE FROM marketing_action_tokens WHERE token_hash = $1", [hash(token)]);
    throw error;
  }
}

export async function consumeAction(list: MarketingList, token: string, purpose: "confirm" | "unsubscribe") {
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ email: string }>(
      "SELECT email FROM marketing_action_tokens WHERE token_hash = $1 AND list = $2 AND purpose = $3 AND expires_at > now() FOR UPDATE",
      [hash(token), list, purpose],
    );
    if (!found.rows[0]) { await client.query("ROLLBACK"); return false; }
    const email = found.rows[0].email;
    if (purpose === "confirm") {
      const changed = await client.query(
        "UPDATE marketing_subscriptions SET status = 'active', confirmed_at = now(), unsubscribed_at = NULL WHERE list = $1 AND email = $2 AND status = 'pending'",
        [list, email],
      );
      if (changed.rowCount !== 1) { await client.query("ROLLBACK"); return false; }
    } else {
      const changed = await client.query(
        "UPDATE marketing_subscriptions SET status = 'unsubscribed', unsubscribed_at = now() WHERE list = $1 AND email = $2 AND status = 'active'",
        [list, email],
      );
      if (changed.rowCount !== 1) { await client.query("ROLLBACK"); return false; }
    }
    await client.query("DELETE FROM marketing_action_tokens WHERE list = $1 AND email = $2", [list, email]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
