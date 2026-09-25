import { writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { Pool } from "pg";

const [action, list, argument] = process.argv.slice(2);
if (list !== "personal" && list !== "booking") throw new Error("Choose personal or booking");
if (!process.env.SUBSCRIPTIONS_DATABASE_URL) throw new Error("SUBSCRIPTIONS_DATABASE_URL is required");
const pool = new Pool({ connectionString: process.env.SUBSCRIPTIONS_DATABASE_URL, max: 1 });

async function main() {
try {
  if (action === "export") {
    if (!argument?.startsWith("/")) throw new Error("Pass an absolute output path outside the repository");
    const repository = resolve(process.cwd());
    if (argument === repository || argument.startsWith(repository + sep)) throw new Error("Subscriber exports must stay outside the repository");
    const rows = await pool.query<{ email: string }>(
      "SELECT email FROM marketing_subscriptions WHERE list = $1 AND status = 'active' ORDER BY email", [list],
    );
    await writeFile(argument, `email\n${rows.rows.map((row) => `"${row.email.replaceAll('"', '""')}"`).join("\n")}\n`, { mode: 0o600, flag: "wx" });
    console.log(`Exported ${rows.rowCount} active addresses to the specified file.`);
  } else if (action === "unsubscribe") {
    if (!argument || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(argument)) throw new Error("Pass one valid email address");
    const email = argument.trim().toLowerCase();
    await pool.query("UPDATE marketing_subscriptions SET status = 'unsubscribed', unsubscribed_at = now() WHERE list = $1 AND email = $2 AND status <> 'unsubscribed'", [list, email]);
    await pool.query("DELETE FROM marketing_action_tokens WHERE list = $1 AND email = $2", [list, email]);
    console.log("Unsubscribe request applied.");
  } else if (action === "cleanup") {
    await pool.query("DELETE FROM marketing_action_tokens WHERE expires_at <= now()");
    await pool.query("DELETE FROM marketing_subscriptions WHERE status = 'pending' AND requested_at < now() - interval '30 days'");
    console.log("Expired requests removed.");
  } else {
    throw new Error("Use export <list> <absolute-file>, unsubscribe <list> <email>, or cleanup <list>");
  }
} finally { await pool.end(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
