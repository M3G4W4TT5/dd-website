import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { Language, Site } from "@dd/contracts";
import { normalizeEmail } from "@dd/contracts";
import { transaction, digest, enqueue } from "@dd/database";
export { normalizeEmail };
export const consentVersion = {
  primary: "dd-newsletter-2026-09-25-v1",
  booking: "ttd-offers-events-discounts-2026-09-25-v1",
};
export function marketing(
  pool: Pool,
  site: Site,
  actionBase: string,
  key: string,
) {
  async function request(
    rawEmail: string,
    language: Language,
    purpose: "confirm" | "unsubscribe",
    source: string,
    idempotencyKey?: string,
  ) {
    const email = normalizeEmail(rawEmail);
    return transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
      if (idempotencyKey) {
        const r = await c.query(
          "INSERT INTO internal_requests(key) VALUES($1) ON CONFLICT DO NOTHING RETURNING key",
          [digest(idempotencyKey)],
        );
        if (!r.rowCount) return;
      }
      const result = await c.query<{ status: string; recent: boolean }>(
        "SELECT status,requested_at>now()-interval '15 minutes' AS recent FROM marketing_subscriptions WHERE email=$1 FOR UPDATE",
        [email],
      );
      const row = result.rows[0];
      if (row?.status === "suppressed") return;
      if (purpose === "confirm") {
        if (
          row?.status === "active" ||
          (row?.status === "pending" && row.recent)
        )
          return;
        await c.query(
          `INSERT INTO marketing_subscriptions(email,status,consent_version,source,language) VALUES($1,'pending',$2,$3,$4) ON CONFLICT(email) DO UPDATE SET status='pending',consent_version=EXCLUDED.consent_version,source=EXCLUDED.source,language=EXCLUDED.language,requested_at=now(),confirmed_at=NULL,unsubscribed_at=NULL`,
          [email, consentVersion[site], source, language],
        );
      } else if (row?.status !== "active") return;
      const recent = await c.query<{ next_at: Date }>(
        "SELECT greatest(created_at,next_at)+interval '15 minutes' AS next_at FROM deliveries WHERE identity LIKE $1 AND greatest(created_at,next_at)>now()-interval '15 minutes' ORDER BY greatest(created_at,next_at) DESC LIMIT 1",
        [site + ":" + purpose + ":" + digest(email) + ":%"],
      );
      if (recent.rowCount && purpose === "unsubscribe") return;
      const identity =
        site +
        ":" +
        purpose +
        ":" +
        digest(email) +
        ":" +
        randomBytes(16).toString("hex");
      await enqueue(
        c,
        identity,
        "marketing",
        { email, language, purpose },
        key,
      );
      // A fresh opt-in after withdrawal must not get stuck pending without a
      // confirmation. Preserve the per-address mail throttle by deferring it.
      if (recent.rows[0])
        await c.query("UPDATE deliveries SET next_at=$2 WHERE identity=$1", [
          identity,
          recent.rows[0].next_at,
        ]);
    });
  }
  async function render(payload: {
    email: string;
    language: Language;
    purpose: "confirm" | "unsubscribe";
  }) {
    const { email, language, purpose } = payload;
    const token = randomBytes(32).toString("base64url");
    const active = await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
      const r = await c.query(
        "SELECT status FROM marketing_subscriptions WHERE email=$1 FOR UPDATE",
        [email],
      );
      if (r.rows[0]?.status !== (purpose === "confirm" ? "pending" : "active"))
        return false;
      await c.query(
        "DELETE FROM marketing_action_tokens WHERE email=$1 AND purpose=$2",
        [email, purpose],
      );
      await c.query(
        "INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,$3,now()+interval '48 hours')",
        [digest(token), email, purpose],
      );
      return true;
    });
    if (!active) return null;
    const url = new URL(`/marketing/${purpose}`, actionBase);
    url.hash = `token=${token}`;
    url.searchParams.set("lang", language);
    const personal = site === "primary";
    const tokenHours = 48;
    if (purpose === "unsubscribe")
      return {
        to: email,
        subject:
          language === "da" ? "Bekræft afmelding" : "Confirm unsubscribe",
        text:
          language === "da"
            ? `Bekræft din afmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Du kan også svare på denne mail og bede om afmelding.`
            : `Confirm your unsubscribe here:\n${url}\n\nIf you did not request this, ignore this email. You can also reply to this message and ask to unsubscribe.`,
      };
    const subject = personal
      ? "Confirm your DD newsletter signup"
      : language === "da"
        ? "Bekræft tilmelding til TTD Studio-mails"
        : "Confirm TTD Studio email signup";
    const description = personal
      ? "updates on my work and dance videos"
      : language === "da"
        ? "tilbud, nye events og rabatter fra TTD Studio"
        : "TTD Studio offers, new events and discounts";
    const text =
      language === "da" && !personal
        ? `Du har bedt om at modtage ${description} fra TOTAL ENTERTAINMENT. Bekræft din tilmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Linket udløber efter ${tokenHours} timer. Du kan altid afmelde dig. Svar til denne adresse, hvis du har spørgsmål.`
        : `You asked to receive ${description} from ${personal ? "DD Production" : "TOTAL ENTERTAINMENT"}. Confirm your signup here:\n${url}\n\nIf you did not request this, ignore this email. The link expires in ${tokenHours} hours. You can unsubscribe at any time. Reply to this address with questions.`;
    return { to: email, subject, text };
  }
  async function consume(token: string, purpose: "confirm" | "unsubscribe") {
    return transaction(pool, async (c) => {
      // Discover the address without locking the token, then take the common
      // per-address lock before row locks. Operator withdrawal uses this order.
      const candidate = await c.query<{ email: string }>(
        "SELECT email FROM marketing_action_tokens WHERE token_hash=$1 AND purpose=$2 AND expires_at>now()",
        [digest(token), purpose],
      );
      if (!candidate.rows[0]) return false;
      const email = candidate.rows[0].email;
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
      const found = await c.query(
        "SELECT 1 FROM marketing_action_tokens WHERE token_hash=$1 AND email=$2 AND purpose=$3 AND expires_at>now() FOR UPDATE",
        [digest(token), email, purpose],
      );
      if (!found.rowCount) return false;
      const result = await c.query(
        "UPDATE marketing_subscriptions SET status=$2,confirmed_at=CASE WHEN $2='active' THEN now() ELSE confirmed_at END,unsubscribed_at=CASE WHEN $2='unsubscribed' THEN now() ELSE NULL END WHERE email=$1 AND status=$3",
        [
          email,
          purpose === "confirm" ? "active" : "unsubscribed",
          purpose === "confirm" ? "pending" : "active",
        ],
      );
      if (result.rowCount !== 1) return false;
      await c.query("DELETE FROM marketing_action_tokens WHERE email=$1", [
        email,
      ]);
      return true;
    });
  }
  return { request, render, consume };
}
