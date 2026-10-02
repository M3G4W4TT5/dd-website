import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import {
  database,
  transaction,
  enqueue,
  encrypt,
  digest,
  decrypt,
} from "../index";
import { pollDelivery } from "../delivery";
import { marketing } from "@dd/marketing";
import { createMailer, DeliveryError } from "@dd/mail";
const read = (name: string) =>
  parseEnv(readFileSync(`infra/local/${name}.env`, "utf8")) as Record<
    string,
    string
  >;
const migrations = read("migration");
const pools: ReturnType<typeof database>[] = [];
const queueSchema = "fixture_" + randomUUID().replaceAll("-", "");
let queueMigration: ReturnType<typeof database> | undefined;
function pool(url: string, schema?: "primary_marketing" | "booking_marketing") {
  const p = database(url, schema);
  pools.push(p);
  return p;
}
async function denied(fn: () => Promise<unknown>) {
  let blocked = false;
  try {
    await fn();
  } catch (e) {
    const code = (e as { code?: string }).code;
    assert.ok(
      ["42501", "28000", "3D000"].includes(code ?? ""),
      "Permission rejection required",
    );
    blocked = true;
  }
  assert.equal(blocked, true, "Unauthorized action succeeded");
}
const fixture = "fixture-" + randomUUID();
const email = fixture + "@example.com";
try {
  const primary = read("primary-communications"),
    booking = read("booking-communications");
  const p = pool(primary.MARKETING_DATABASE_URL, "primary_marketing"),
    b = pool(booking.MARKETING_DATABASE_URL, "booking_marketing");
  const web = pool(read("booking-web").BOOKING_DATABASE_URL),
    worker = pool(read("booking-worker").BOOKING_DATABASE_URL);
  for (const [current, other] of [
    [p, "booking_marketing"],
    [b, "primary_marketing"],
  ] as const) {
    await current.query("SELECT count(*) FROM marketing_subscriptions");
    await current.query("SELECT count(*) FROM marketing_consent_history");
    await denied(() => current.query("DELETE FROM marketing_consent_history"));
    await denied(() => current.query("UPDATE marketing_consent_history SET source=source"));
    await denied(() => current.query("TRUNCATE marketing_consent_history"));
    await denied(() =>
      current.query(`SELECT * FROM ${other}.marketing_subscriptions`),
    );
    await denied(() => current.query("CREATE TABLE forbidden(id int)"));
    await denied(() => current.query("CREATE ROLE forbidden"));
    await denied(() => current.query("SET ROLE booking_management_migrator"));
  }
  for (const [env, name] of [
    [primary, "marketing"],
    [booking, "marketing"],
    [read("booking-web"), "booking_management"],
    [read("booking-worker"), "booking_management"],
  ] as const) {
    const value = env.MARKETING_DATABASE_URL || env.BOOKING_DATABASE_URL;
    for (const db of ["marketing", "booking_management", "pretix"])
      if (db !== name) {
        const u = new URL(value);
        u.pathname = "/" + db;
        const x = pool(u.toString());
        await denied(() => x.query("SELECT 1"));
      }
  }
  await web.query("SELECT count(*) FROM manage_sessions");
  await denied(() => worker.query("SELECT * FROM manage_sessions"));
  await denied(() => web.query("CREATE TABLE forbidden(id int)"));
  const flags = await p.query(
    "SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.deepEqual(Object.values(flags.rows[0]), [false, false, false, false]);
  // Default privileges apply to future migrated tables/sequences, not merely old tables.
  for (const [site, current] of [
    ["primary", p],
    ["booking", b],
  ] as const) {
    const migration = pool(
      migrations[site.toUpperCase() + "_MARKETING_MIGRATOR_DATABASE_URL"],
      site === "primary" ? "primary_marketing" : "booking_marketing",
    );
    await migration.query(
      "CREATE TABLE grant_probe(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)",
    );
    try {
      await current.query("INSERT INTO grant_probe DEFAULT VALUES");
      await current.query("DELETE FROM grant_probe");
    } finally {
      await migration.query("DROP TABLE grant_probe");
    }
  }
  // Management migrations opt in individual runtime tables; backup defaults still apply.
  const managementMigration = pool(
    migrations.BOOKING_MANAGEMENT_MIGRATOR_DATABASE_URL,
  );
  await managementMigration.query(
    "CREATE TABLE grant_probe(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)",
  );
  try {
    await denied(() => web.query("SELECT * FROM grant_probe"));
    await managementMigration.query(
      "GRANT SELECT,INSERT,DELETE ON grant_probe TO booking_web_runtime; GRANT USAGE,SELECT ON SEQUENCE grant_probe_id_seq TO booking_web_runtime",
    );
    await web.query("INSERT INTO grant_probe DEFAULT VALUES");
    await web.query("DELETE FROM grant_probe");
    await denied(() => worker.query("SELECT * FROM grant_probe"));
  } finally {
    await managementMigration.query("DROP TABLE grant_probe");
  }
  const pretixMigration = pool(migrations.PRETIX_MIGRATOR_DATABASE_URL);
  const roles = read("roles");
  const pretixRuntime = pool(roles.PRETIX_RUNTIME_DATABASE_URL);
  await pretixMigration.query(
    "CREATE TABLE grant_probe(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY)",
  );
  try {
    await pretixRuntime.query("INSERT INTO grant_probe DEFAULT VALUES");
    await pretixRuntime.query("SELECT * FROM grant_probe");
    await pretixRuntime.query("DELETE FROM grant_probe");
    await denied(() => pretixRuntime.query("CREATE TABLE forbidden(id int)"));
  } finally {
    await pretixMigration.query("DROP TABLE grant_probe");
  }
  console.log(
    "PASS runtime grants, cross-schema/database denial, DDL/escalation denial, worker session isolation and future-object grants",
  );
  const capture: string[] = [];
  const sendFor = (site: "primary" | "booking") =>
    createMailer(
      { mode: "development", delivery: "capture", allowlist: [] },
      site,
      async (_mail, raw) => {
        capture.push(raw.toString());
      },
    );
  for (const [site, current, env] of [
    ["primary", p, primary],
    ["booking", b, booking],
  ] as const) {
    const list = marketing(
      current,
      site,
      env.MARKETING_ACTION_BASE_URL,
      env.PAYLOAD_KEY,
    );
    const operator = pool(roles[site.toUpperCase()+"_MARKETING_OPERATOR_DATABASE_URL"],site === "primary" ? "primary_marketing" : "booking_marketing");
    for(const status of ["unsubscribed","suppressed"]) {
      const probe=fixture+"-"+status+"@example.invalid";
      await current.query("INSERT INTO marketing_subscriptions(email,status,consent_version,source,language,confirmed_at) VALUES($1,'active','fixture','fixture','en',now())",[probe]);
      await current.query("INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,'unsubscribe',now()+interval '1 hour')",[digest(probe),probe]);
      await transaction(operator,async c=>{await c.query("UPDATE marketing_subscriptions SET status=$2,unsubscribed_at=now() WHERE email=$1",[probe,status]);await c.query("DELETE FROM marketing_action_tokens WHERE email=$1",[probe]);});
      assert.equal((await current.query("SELECT status FROM marketing_subscriptions WHERE email=$1",[probe])).rows[0].status,status);
      assert.equal((await current.query("SELECT 1 FROM marketing_action_tokens WHERE email=$1",[probe])).rowCount,0);
      assert.equal((await current.query("SELECT 1 FROM marketing_consent_history WHERE email=$1 AND status=$2",[probe,status])).rowCount,1);
    }
    await list.request(email, "en", "confirm", "fixture", fixture);
    await list.request(email, "en", "confirm", "fixture", fixture);
    assert.equal(
      (
        await current.query(
          "SELECT status FROM marketing_subscriptions WHERE email=$1",
          [email],
        )
      ).rows[0].status,
      "pending",
    );
    let message: any;
    const prepared = await current.query(
      "UPDATE deliveries SET state='permanent' WHERE identity LIKE $1 RETURNING *",
      [site + ":%:" + digest(email) + ":%"],
    );
    message = await list.render(
      decrypt(prepared.rows.at(-1).payload, env.PAYLOAD_KEY),
    );
    await sendFor(site)("marketing", message, "fixture");
    assert.ok(message);
    const match = message.text.match(/#token=([A-Za-z0-9_-]{43})/);
    assert.ok(match);
    const token = match[1];
    assert.equal(await list.consume(token, "unsubscribe"), false);
    const other = marketing(
      site === "primary" ? b : p,
      site === "primary" ? "booking" : "primary",
      env.MARKETING_ACTION_BASE_URL,
      env.PAYLOAD_KEY,
    );
    assert.equal(await other.consume(token, "confirm"), false);
    assert.equal(await list.consume(token, "confirm"), true);
    assert.equal(await list.consume(token, "confirm"), false);
    await list.request(email, "da", "unsubscribe", "fixture");
    const requested = await current.query(
      "UPDATE deliveries SET state='permanent' WHERE identity LIKE $1 AND kind IN ('marketing','marketing-withdrawal') RETURNING *",
      [site + ":%:" + digest(email) + ":%"],
    );
    message = await list.render(
      decrypt(requested.rows.at(-1).payload, env.PAYLOAD_KEY),
    );
    const unsub = message.text.match(/#token=([A-Za-z0-9_-]{43})/)[1];
    assert.equal(await list.consume(unsub, "unsubscribe"), true);
    await current.query(
      "UPDATE marketing_subscriptions SET requested_at=now()-interval '1 hour' WHERE email=$1",
      [email],
    );
    // A later opt-in uses a new submission key, including after unsubscribe.
    const confirmationCount = (
      await current.query(
        "SELECT count(*)::int n FROM deliveries WHERE identity LIKE $1",
        [site + ":confirm:" + digest(email) + ":%"],
      )
    ).rows[0].n;
    const replacementKey = fixture + ":replacement";
    await list.request(email, "en", "confirm", "fixture-2", replacementKey);
    await list.request(email, "en", "confirm", "fixture-2", replacementKey);
    assert.equal(
      (
        await current.query(
          "SELECT status FROM marketing_subscriptions WHERE email=$1",
          [email],
        )
      ).rows[0].status,
      "pending",
    );
    const replacements = await current.query(
      "SELECT count(*)::int n,bool_or(next_at>now()) AS deferred FROM deliveries WHERE identity LIKE $1",
      [site + ":confirm:" + digest(email) + ":%"],
    );
    assert.equal(replacements.rows[0].n, confirmationCount + 1);
    assert.equal(replacements.rows[0].deferred, true);
    const beforeExpiry = (
      await current.query(
        "SELECT count(*)::int n FROM deliveries WHERE identity LIKE $1",
        [site + ":%:" + digest(email) + ":%"],
      )
    ).rows[0].n;
    await current.query(
      "UPDATE marketing_subscriptions SET requested_at=now()-interval '49 hours' WHERE email=$1",
      [email],
    );
    await current.query(
      "UPDATE deliveries SET created_at=now()-interval '49 hours',next_at=now()-interval '49 hours' WHERE identity LIKE $1",
      [site + ":%:" + digest(email) + ":%"],
    );
    // The original key remains a retry, even after expiry; a fresh key can enqueue.
    await list.request(email, "en", "confirm", "fixture-2", replacementKey);
    await list.request(
      email,
      "en",
      "confirm",
      "fixture-2",
      fixture + ":expired-replacement",
    );
    assert.equal(
      (
        await current.query(
          "SELECT count(*)::int n FROM deliveries WHERE identity LIKE $1",
          [site + ":%:" + digest(email) + ":%"],
        )
      ).rows[0].n,
      beforeExpiry + 1,
    );
    // Expiry and manual withdrawal invalidate activation even with a correctly bound token.
    const expiry = randomUUID().replaceAll("-", "") + "z".repeat(11);
    await current.query(
      "INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,'confirm',now()-interval '1 second')",
      [digest(expiry), email],
    );
    assert.equal(await list.consume(expiry, "confirm"), false);
    const op = pool(
      read("operator")[site.toUpperCase() + "_DATABASE_URL"],
      site === "primary" ? "primary_marketing" : "booking_marketing",
    );
    const withdrawalToken = "w".repeat(43);
    await current.query(
      "INSERT INTO marketing_action_tokens(token_hash,email,purpose,expires_at) VALUES($1,$2,'confirm',now()+interval '1 hour')",
      [digest(withdrawalToken), email],
    );
    const operatorClient = await op.connect();
    try {
      await operatorClient.query("BEGIN");
      await operatorClient.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        email,
      ]);
      await operatorClient.query(
        "UPDATE marketing_subscriptions SET status='unsubscribed',unsubscribed_at=now() WHERE email=$1",
        [email],
      );
      const consuming = list.consume(withdrawalToken, "confirm");
      await new Promise((r) => setTimeout(r, 50));
      await operatorClient.query(
        "DELETE FROM marketing_action_tokens WHERE email=$1",
        [email],
      );
      await operatorClient.query("COMMIT");
      assert.equal(await consuming, false);
    } catch (e) {
      await operatorClient.query("ROLLBACK");
      throw e;
    } finally {
      operatorClient.release();
    }
    assert.equal(await list.consume(expiry, "confirm"), false);
    await current.query("DELETE FROM marketing_subscriptions WHERE email=$1", [
      email,
    ]);
    await current.query(
      "DELETE FROM delivery_attempts WHERE delivery_id IN (SELECT id FROM deliveries WHERE identity LIKE $1)",
      [site + ":%:" + digest(email) + ":%"],
    );
    await current.query("DELETE FROM deliveries WHERE identity LIKE $1", [
      site + ":%:" + digest(email) + ":%",
    ]);
    await current.query(
      "DELETE FROM internal_requests WHERE key=ANY($1::text[])",
      [
        [
          fixture,
          fixture + ":replacement",
          fixture + ":expired-replacement",
        ].map(digest),
      ],
    );
  }
  console.log(
    "PASS both lists: pending/activation, captured mail, consent state, idempotency, wrong-list/purpose/repeat/expired rejection, unsubscribe and manual withdrawal",
  );
  queueMigration = pool(migrations.BOOKING_MANAGEMENT_MIGRATOR_DATABASE_URL);
  await queueMigration.query(
    `CREATE SCHEMA ${queueSchema}; SET search_path=${queueSchema},pg_catalog`,
  );
  await queueMigration.query(
    readFileSync("server/database/migrations/001-management.sql", "utf8"),
  );
  await queueMigration.query(
    `GRANT USAGE ON SCHEMA ${queueSchema} TO booking_worker_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${queueSchema} TO booking_worker_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${queueSchema} TO booking_worker_runtime`,
  );
  const queueUrl = new URL(read("booking-worker").BOOKING_DATABASE_URL);
  queueUrl.searchParams.set(
    "options",
    `-c search_path=${queueSchema},pg_catalog`,
  );
  const queueWorker = pool(queueUrl.toString());
  const key = read("booking-worker").PAYLOAD_KEY;
  const queued = async (suffix: string) =>
    enqueue(
      queueWorker,
      fixture + ":" + suffix,
      "fixture",
      { example: true },
      key,
    );
  await queued("restart");
  await queued("restart");
  assert.equal(
    (
      await queueWorker.query(
        "SELECT count(*)::int AS count FROM deliveries WHERE identity=$1",
        [fixture + ":restart"],
      )
    ).rows[0].count,
    1,
  );
  await queueWorker.query(
    "UPDATE deliveries SET state='leased',lease_until=now()-interval '1 second' WHERE identity=$1",
    [fixture + ":restart"],
  );
  let sends = 0;
  await pollDelivery(queueWorker, key, async () => {
    sends++;
  });
  assert.equal(sends, 1);
  await queued("sending-crash");
  await queueWorker.query(
    "UPDATE deliveries SET state='sending',lease_until=now()-interval '1 second' WHERE identity=$1",
    [fixture + ":sending-crash"],
  );
  await pollDelivery(queueWorker, key, async () => {
    sends++;
  });
  assert.equal(sends, 1);
  assert.equal(
    (
      await queueWorker.query(
        "SELECT state FROM deliveries WHERE identity=$1",
        [fixture + ":sending-crash"],
      )
    ).rows[0].state,
    "ambiguous",
  );
  for (const state of ["retry", "permanent", "ambiguous"] as const) {
    await queued(state);
    await pollDelivery(queueWorker, key, async () => {
      throw new DeliveryError(state);
    });
    assert.equal(
      (
        await queueWorker.query(
          "SELECT state FROM deliveries WHERE identity=$1",
          [fixture + ":" + state],
        )
      ).rows[0].state,
      state === "retry" ? "queued" : state,
    );
  }
  // Simulate actual acceptance followed by DB recording failure: state stays sending, expiry is ambiguous.
  await queued("db-after-accept");
  await queueWorker.query(
    "UPDATE deliveries SET next_at=now()+interval '1 day' WHERE identity=$1",
    [fixture + ":retry"],
  );
  const failedDb = {
    query: async (sql: string, args?: unknown[]) => {
      if (sql.startsWith("INSERT INTO delivery_attempts"))
        throw new Error("fixture database failure after acceptance");
      return queueWorker.query(sql, args);
    },
  } as any;
  await assert.rejects(() =>
    pollDelivery(failedDb, key, async () => {
      sends++;
    }),
  );
  await queueWorker.query(
    "UPDATE deliveries SET lease_until=now()-interval '1 second' WHERE identity=$1",
    [fixture + ":db-after-accept"],
  );
  let repeated = 0;
  await pollDelivery(queueWorker, key, async () => {
    repeated++;
  });
  assert.equal(repeated, 0);
  await queueWorker.query(
    "DELETE FROM delivery_attempts WHERE delivery_id IN (SELECT id FROM deliveries WHERE identity LIKE $1)",
    [fixture + ":%"],
  );
  await queueWorker.query("DELETE FROM deliveries WHERE identity LIKE $1", [
    fixture + ":%",
  ]);
  console.log(
    "PASS durable queue deduplication, restart/expired lease, permanent rejection, retry delay, SMTP ambiguity and DB failure after acceptance without auto-resend",
  );
} finally {
  if (queueMigration)
    await queueMigration.query(`DROP SCHEMA ${queueSchema} CASCADE`);
  await Promise.all(pools.map((p) => p.end()));
}
