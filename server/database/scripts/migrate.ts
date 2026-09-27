import { database, transaction } from "../index";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
const [domain] = process.argv.slice(2);
if (!["primary", "booking", "management"].includes(domain))
  throw new Error("Migration domain required");
const url = process.env.MIGRATION_DATABASE_URL ?? "";
const expected =
  domain === "management"
    ? "booking_management_migrator"
    : domain + "_marketing_migrator";
if (new URL(url).username !== expected)
  throw new Error("Matching migration identity required");
const schema =
  domain === "management"
    ? undefined
    : domain === "primary"
      ? "primary_marketing"
      : "booking_marketing";
const pool = database(url, schema);
try {
  const type = domain === "management" ? "management" : "marketing";
  const files = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith("-" + type + ".sql"))
    .sort();
  for (const file of files) {
    const version = file.split("-")[0];
    await transaction(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        "dd-migrations:" + domain,
      ]);
      await c.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
      );
      const found = await c.query(
        "SELECT 1 FROM schema_migrations WHERE version=$1",
        [version],
      );
      if (found.rowCount) return;
      await c.query(
        await readFile(
          new URL("../migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
      await c.query("INSERT INTO schema_migrations(version) VALUES($1)", [
        version,
      ]);
    });
  }
  console.log("Domain migrations current");
} finally {
  await pool.end();
}
