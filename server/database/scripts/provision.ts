/** Explicit administrator job. No application imports this module. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { database } from "../index";
const directory = resolve(process.env.PROVISION_DIRECTORY ?? "");
if (!process.env.PROVISION_DIRECTORY)
  throw new Error("Private provision directory required");
await mkdir(directory, { recursive: true, mode: 0o700 });
const registry = directory + "/provisioning-private.json";
let saved: { passwords: Record<string, string> };
try {
  saved = JSON.parse(await readFile(registry, "utf8"));
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  saved = { passwords: {} };
}
const roles = [
  "primary_marketing_migrator",
  "booking_marketing_migrator",
  "booking_management_migrator",
  "pretix_migrator",
  "primary_marketing_runtime",
  "booking_marketing_runtime",
  "booking_web_runtime",
  "booking_worker_runtime",
  "pretix_runtime",
  "primary_marketing_operator",
  "booking_marketing_operator",
  "booking_management_operator",
  "dd_backup",
];
for (const role of roles)
  saved.passwords[role] ??= randomBytes(32).toString("hex");
await writeFile(registry, JSON.stringify(saved), { mode: 0o600 });
const base = new URL(process.env.PROVISION_DATABASE_URL ?? "");
const pools: ReturnType<typeof database>[] = [];
const connect = (db: string) => {
  const u = new URL(base);
  u.pathname = "/" + db;
  const p = database(u.toString());
  pools.push(p);
  return p;
};
const admin = connect("postgres");
try {
  const flags = await admin.query(
    "SELECT rolsuper FROM pg_roles WHERE rolname=current_user",
  );
  if (!flags.rows[0]?.rolsuper)
    throw new Error("Explicit provisioning administrator required");
  for (const role of roles) {
    const exists = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname=$1",
      [role],
    );
    const password = saved.passwords[role];
    if (!/^[a-f0-9]{64}$/.test(password))
      throw new Error("Invalid private password registry");
    await admin.query(
      `${exists.rowCount ? "ALTER" : "CREATE"} ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
  }
  for (const name of ["marketing", "booking_management", "pretix"]) {
    if (
      !(await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [name]))
        .rowCount
    )
      await admin.query(
        `CREATE DATABASE ${name} OWNER ${name === "pretix" ? "pretix_migrator" : name === "booking_management" ? "booking_management_migrator" : base.username}`,
      );
    await admin.query(
      `REVOKE CONNECT,TEMPORARY ON DATABASE ${name} FROM PUBLIC`,
    );
  }
  for (const site of ["primary", "booking"]) {
    const p = connect("marketing"),
      schema = site + "_marketing",
      owner = schema + "_migrator",
      runtime = schema + "_runtime",
      operator = schema + "_operator";
    await p.query(
      `GRANT CONNECT ON DATABASE marketing TO ${owner},${runtime},${operator},dd_backup; REVOKE CREATE ON SCHEMA public FROM PUBLIC; CREATE SCHEMA IF NOT EXISTS ${schema} AUTHORIZATION ${owner}; SET ROLE ${owner}; SET search_path=${schema},pg_catalog; CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`,
    );
    if (
      !(await p.query("SELECT 1 FROM schema_migrations WHERE version='001'"))
        .rowCount
    ) {
      await p.query(
        await readFile(
          new URL("../migrations/001-marketing.sql", import.meta.url),
          "utf8",
        ),
      );
      await p.query("INSERT INTO schema_migrations(version) VALUES('001')");
    }
    await p.query(
      `GRANT USAGE ON SCHEMA ${schema} TO ${runtime},${operator},dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${runtime}; REVOKE ALL ON schema_migrations FROM ${runtime}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${runtime}; GRANT SELECT,UPDATE,DELETE ON marketing_subscriptions,marketing_action_tokens TO ${operator}; GRANT SELECT ON deliveries,delivery_attempts TO ${operator}; GRANT UPDATE(state,lease,next_at,payload) ON deliveries TO ${operator}; GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO dd_backup; ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO ${runtime}; ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE,SELECT ON SEQUENCES TO ${runtime}; ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT ON TABLES TO dd_backup; RESET ROLE; ALTER ROLE ${runtime} IN DATABASE marketing SET search_path=${schema},pg_catalog; ALTER ROLE ${operator} IN DATABASE marketing SET search_path=${schema},pg_catalog`,
    );
  }
  const management = connect("booking_management");
  await management.query(
    "GRANT CONNECT ON DATABASE booking_management TO booking_management_migrator,booking_web_runtime,booking_worker_runtime,booking_management_operator,dd_backup; REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER SCHEMA public OWNER TO booking_management_migrator; SET ROLE booking_management_migrator; CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())",
  );
  if (
    !(
      await management.query(
        "SELECT 1 FROM schema_migrations WHERE version='001'",
      )
    ).rowCount
  ) {
    await management.query(
      await readFile(
        new URL("../migrations/001-management.sql", import.meta.url),
        "utf8",
      ),
    );
    await management.query(
      "INSERT INTO schema_migrations(version) VALUES('001')",
    );
  }
  await management.query(
    "GRANT USAGE ON SCHEMA public TO booking_web_runtime,booking_worker_runtime,booking_management_operator,dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON manage_link_requests,manage_link_tokens,manage_sessions,operations,webhook_inbox,order_snapshots,deliveries,abuse_limits TO booking_web_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON manage_link_tokens,operations,webhook_inbox,order_snapshots,deliveries,delivery_attempts,abuse_limits TO booking_worker_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO booking_web_runtime,booking_worker_runtime; GRANT SELECT ON deliveries,delivery_attempts,operations,webhook_inbox TO booking_management_operator; GRANT UPDATE(state,lease,next_at,payload) ON deliveries TO booking_management_operator; GRANT UPDATE(state) ON operations TO booking_management_operator; GRANT SELECT ON ALL TABLES IN SCHEMA public TO dd_backup; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dd_backup; RESET ROLE",
  );
  const pretix = connect("pretix");
  await pretix.query(
    "GRANT CONNECT ON DATABASE pretix TO pretix_migrator,pretix_runtime,dd_backup; REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER DATABASE pretix OWNER TO pretix_migrator; ALTER SCHEMA public OWNER TO pretix_migrator; GRANT USAGE ON SCHEMA public TO pretix_runtime,dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO pretix_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO pretix_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO dd_backup; SET ROLE pretix_migrator; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO pretix_runtime; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO pretix_runtime; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dd_backup",
  );
  // Existing Pretix ownership is transferred by the local transition. New installs migrate as pretix_migrator.
  const urls = roles
    .map((role) => {
      const u = new URL(base);
      u.username = role;
      u.password = saved.passwords[role];
      u.pathname =
        "/" +
        (role.startsWith("pretix")
          ? "pretix"
          : role.startsWith("booking_management") ||
              role.startsWith("booking_web") ||
              role.startsWith("booking_worker")
            ? "booking_management"
            : role === "dd_backup"
              ? "postgres"
              : "marketing");
      return `${role.toUpperCase()}_DATABASE_URL=${u}\n`;
    })
    .join("");
  await writeFile(directory + "/roles.env", urls, { mode: 0o600 });
  console.log(
    "Scoped provision and grants current; private per-role URLs written. No services started or legacy state removed.",
  );
} finally {
  await Promise.all(pools.map((p) => p.end()));
}
