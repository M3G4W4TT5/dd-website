import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { consumeAction, type MarketingList } from "../src/lib/marketing";

if (!process.env.SUBSCRIPTIONS_DATABASE_URL) throw new Error("SUBSCRIPTIONS_DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.SUBSCRIPTIONS_DATABASE_URL, max: 1 });
const email = "marketing-flow-test@example.invalid";
const lists: MarketingList[] = ["personal", "booking"];

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function main() {
try {
  for (const list of lists) {
    await pool.query("DELETE FROM marketing_subscriptions WHERE list = $1 AND email = $2", [list, email]);
    await pool.query(
      "INSERT INTO marketing_subscriptions (list, email, status, consent_version, source, language) VALUES ($1, $2, 'pending', 'test', 'integration-test', 'en')",
      [list, email],
    );
    const confirmToken = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO marketing_action_tokens (token_hash, list, email, purpose, expires_at) VALUES ($1, $2, $3, 'confirm', now() + interval '1 hour')",
      [tokenHash(confirmToken), list, email],
    );
    assert.equal(await consumeAction(list, confirmToken, "confirm"), true);
    assert.equal(await consumeAction(list, confirmToken, "confirm"), false);
    const active = await pool.query<{ status: string }>("SELECT status FROM marketing_subscriptions WHERE list = $1 AND email = $2", [list, email]);
    assert.equal(active.rows[0]?.status, "active");

    const unsubscribeToken = randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO marketing_action_tokens (token_hash, list, email, purpose, expires_at) VALUES ($1, $2, $3, 'unsubscribe', now() + interval '1 hour')",
      [tokenHash(unsubscribeToken), list, email],
    );
    assert.equal(await consumeAction(list, unsubscribeToken, "unsubscribe"), true);
    const withdrawn = await pool.query<{ status: string }>("SELECT status FROM marketing_subscriptions WHERE list = $1 AND email = $2", [list, email]);
    assert.equal(withdrawn.rows[0]?.status, "unsubscribed");
  }
  console.log("Both lists: confirmation, replay rejection, and unsubscribe verified.");
} finally {
  await pool.query("DELETE FROM marketing_subscriptions WHERE email = $1 AND source = 'integration-test'", [email]);
  await pool.end();
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
