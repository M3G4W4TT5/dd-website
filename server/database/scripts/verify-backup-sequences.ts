import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { database } from "../index";
const migrations = parseEnv(readFileSync("infra/local/migration.env", "utf8"));
const backup = parseEnv(
  readFileSync("infra/local/backup.env", "utf8"),
).BACKUP_DATABASE_URL;
if (!backup) throw new Error("Scoped backup configuration required");
for (const [db, schema, owner] of [
  ["marketing", "primary_marketing", "PRIMARY_MARKETING_MIGRATOR"],
  ["marketing", "booking_marketing", "BOOKING_MARKETING_MIGRATOR"],
  ["booking_management", "public", "BOOKING_MANAGEMENT_MIGRATOR"],
  ["pretix", "public", "PRETIX_MIGRATOR"],
]) {
  const url = new URL(backup);
  url.pathname = "/" + db;
  const migrationUrl = migrations[owner + "_DATABASE_URL"];
  if (!migrationUrl) throw new Error("Scoped migration configuration required");
  const reader = database(url.toString()),
    writer = database(migrationUrl);
  const name = "sequence_probe_" + randomUUID().replaceAll("-", "");
  try {
    const existing = await reader.query(
      `SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='S' AND n.nspname=$1 AND NOT has_sequence_privilege(current_user,c.oid,'SELECT')`,
      [schema],
    );
    assert.equal(
      existing.rows[0].n,
      0,
      `${db}/${schema}: existing sequence SELECT`,
    );
    await writer.query(
      `CREATE SEQUENCE ${schema}.${name} START 37 INCREMENT 5`,
    );
    const state = await reader.query(
      `SELECT last_value::int,is_called FROM ${schema}.${name}`,
    );
    assert.deepEqual(state.rows[0], { last_value: 37, is_called: false });
    await writer.query(`SELECT nextval('${schema}.${name}')`);
    assert.deepEqual(
      (
        await reader.query(
          `SELECT last_value::int,is_called FROM ${schema}.${name}`,
        )
      ).rows[0],
      { last_value: 37, is_called: true },
    );
    await assert.rejects(
      () => reader.query(`SELECT nextval('${schema}.${name}')`),
      (e: any) => e.code === "42501",
    );
    await assert.rejects(
      () => reader.query(`SELECT setval('${schema}.${name}',99)`),
      (e: any) => e.code === "42501",
    );
    console.log(
      `PASS ${db}/${schema}: existing/future backup sequence SELECT; state read; advance/update denied`,
    );
  } finally {
    await writer.query(`DROP SEQUENCE IF EXISTS ${schema}.${name}`);
    await Promise.all([reader.end(), writer.end()]);
  }
}
