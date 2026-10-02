import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
/** Opt-in real PostgreSQL regression fixture; never accepts a populated database. */
export async function securityFixture(domain: "management" | "marketing" = "management") {
  const url = new URL(process.env.SECURITY_TEST_DATABASE_URL || "postgresql://invalid");
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/dd_security_fixture")
    throw new Error("Disposable loopback dd_security_fixture database required");
  const root = new Pool({ connectionString: url.toString() });
  const schema = "fixture_" + randomUUID().replaceAll("-", "");
  await root.query(`CREATE SCHEMA ${schema}`);
  const roles = ["booking_web_runtime", "booking_worker_runtime", "dd_backup", "primary_marketing_runtime", "booking_marketing_runtime"];
  for (const role of roles) await root.query(`DO $$ BEGIN CREATE ROLE ${role}; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  url.searchParams.set("options", "-c search_path=" + schema + ",pg_catalog");
  const pool = new Pool({ connectionString: url.toString(), max: 12 });
  const files = (await readdir(new URL("./migrations/", import.meta.url))).filter((f) => f.endsWith("-" + domain + ".sql")).sort();
  for (const file of files) await pool.query(await readFile(new URL("./migrations/" + file, import.meta.url), "utf8"));
  return { pool, url: url.toString(), async close() { await pool.end(); await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.end(); } };
}
