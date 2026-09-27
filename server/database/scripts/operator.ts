import { database, transaction, digest } from "../index";
import { writeFile, realpath } from "node:fs/promises";
import { resolve, dirname } from "node:path";
const [site, command, value] = process.argv.slice(2);
if (site !== "primary" && site !== "booking")
  throw new Error("Explicit primary or booking identity required");
const pool = database(
  process.env.OPERATOR_DATABASE_URL ?? "",
  site === "primary" ? "primary_marketing" : "booking_marketing",
);
if (
  new URL(process.env.OPERATOR_DATABASE_URL!).username !==
  site + "_marketing_operator"
)
  throw new Error("Scoped operator role required");
try {
  if (command === "export") {
    const root = await realpath(new URL("../../../", import.meta.url));
    const target = value
      ? resolve(
          await realpath(dirname(resolve(value))),
          resolve(value).split("/").at(-1)!,
        )
      : root;
    if (!value || target === root || target.startsWith(root + "/"))
      throw new Error("Export must be outside the repository");
    const rows = await pool.query<{
      email: string;
      language: string;
      confirmed_at: Date;
    }>(
      "SELECT email,language,confirmed_at FROM marketing_subscriptions WHERE status='active' ORDER BY email",
    );
    const csv =
      "email,language,confirmed_at\n" +
      rows.rows
        .map(
          (r) =>
            `"${r.email.replaceAll('"', '""')}",${r.language},${r.confirmed_at.toISOString()}`,
        )
        .join("\n") +
      "\n";
    await writeFile(value, csv, { flag: "wx", mode: 0o600 });
    console.log("Private active-list export created");
  } else if (command === "withdraw" || command === "suppress") {
    // Read one address from stdin, not shell history or logs.
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 256)
        throw new Error("Address input too large");
    }
    const email = Buffer.concat(chunks).toString().trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error("Invalid address");
    await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
      await c.query(
        "UPDATE marketing_subscriptions SET status=$2,unsubscribed_at=now() WHERE email=$1",
        [email, command === "suppress" ? "suppressed" : "unsubscribed"],
      );
      await c.query("DELETE FROM marketing_action_tokens WHERE email=$1", [
        email,
      ]);
    });
    console.log("Scoped membership action completed");
  } else if (command === "cleanup") {
    await pool.query(
      "DELETE FROM marketing_action_tokens WHERE expires_at<now(); DELETE FROM marketing_subscriptions WHERE status='pending' AND requested_at<now()-interval '30 days'",
    );
    console.log("Scoped expired/pending cleanup completed");
  } else
    throw new Error(
      "Commands: export external-path, withdraw, suppress, cleanup",
    );
} finally {
  await pool.end();
}
