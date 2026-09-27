import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { database, encrypt } from "../index";
const roles = parseEnv(readFileSync("infra/local/roles.env", "utf8"));
const marker = "fixture-" + randomUUID();
const active = marker + "@example.com",
  pending = "pending-" + active;
const folder = mkdtempSync(tmpdir() + "/dd-private-export-");
function run(
  file: string,
  args: string[],
  env: Record<string, string>,
  input?: string,
) {
  const r = spawnSync(
    process.execPath,
    ["--import", "tsx", "server/database/scripts/" + file, ...args],
    { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", input },
  );
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
try {
  for (const site of ["primary", "booking"] as const) {
    const schema = site + "_marketing";
    const p = database(
      roles[schema.toUpperCase() + "_RUNTIME_DATABASE_URL"]!,
      schema as "primary_marketing" | "booking_marketing",
    );
    const operator = roles[schema.toUpperCase() + "_OPERATOR_DATABASE_URL"]!;
    try {
      await p.query(
        "INSERT INTO marketing_subscriptions(email,language,status,source,consent_version,confirmed_at) VALUES($1,'en','active','fixture','fixture',now()),($2,'en','pending','fixture','fixture',NULL)",
        [active, pending],
      );
      const file = folder + "/" + site + ".csv";
      run("operator.ts", [site, "export", file], {
        OPERATOR_DATABASE_URL: operator,
      });
      const csv = readFileSync(file, "utf8");
      assert.ok(csv.includes(active));
      assert.ok(!csv.includes(pending));
      assert.equal(statSync(file).mode & 0o777, 0o600);
      run(
        "operator.ts",
        [site, "withdraw"],
        { OPERATOR_DATABASE_URL: operator },
        active + "\n",
      );
      assert.equal(
        (
          await p.query(
            "SELECT status FROM marketing_subscriptions WHERE email=$1",
            [active],
          )
        ).rows[0].status,
        "unsubscribed",
      );
      run(
        "operator.ts",
        [site, "suppress"],
        { OPERATOR_DATABASE_URL: operator },
        active + "\n",
      );
      assert.equal(
        (
          await p.query(
            "SELECT status FROM marketing_subscriptions WHERE email=$1",
            [active],
          )
        ).rows[0].status,
        "suppressed",
      );
      run("operator.ts", [site, "cleanup"], {
        OPERATOR_DATABASE_URL: operator,
      });
      const q = await p.query(
        "INSERT INTO deliveries(identity,kind,payload,state) VALUES($1,'fixture',$2,'ambiguous') RETURNING id",
        [marker, encrypt({ fixture: true }, "a".repeat(64))],
      );
      run("queue.ts", ["status"], {
        QUEUE_DATABASE_URL: operator,
        QUEUE_SCHEMA: schema,
      });
      run("queue.ts", ["resolve-sent", String(q.rows[0].id)], {
        QUEUE_DATABASE_URL: operator,
        QUEUE_SCHEMA: schema,
      });
      assert.equal(
        (
          await p.query("SELECT state FROM deliveries WHERE id=$1", [
            q.rows[0].id,
          ])
        ).rows[0].state,
        "sent",
      );
    } finally {
      await p.query("DELETE FROM deliveries WHERE identity=$1", [marker]);
      await p.query(
        "DELETE FROM marketing_subscriptions WHERE email IN ($1,$2)",
        [active, pending],
      );
      await p.end();
    }
  }
  const p = database(roles.BOOKING_WEB_RUNTIME_DATABASE_URL!);
  const op = roles.BOOKING_MANAGEMENT_OPERATOR_DATABASE_URL!;
  const operator = database(op);
  try {
    await assert.rejects(
      () => operator.query("SELECT * FROM manage_sessions"),
      (e) => (e as { code: string }).code === "42501",
    );
    const id = randomUUID();
    await p.query(
      "INSERT INTO operations(id,order_code,kind,before_state,target,state) VALUES($1,'FIXTURE','change','{}','{}','ambiguous')",
      [id],
    );
    run("queue.ts", ["operations"], { QUEUE_DATABASE_URL: op });
    run("queue.ts", ["operation-rejected", id], { QUEUE_DATABASE_URL: op });
    assert.equal(
      (await p.query("SELECT state FROM operations WHERE id=$1", [id])).rows[0]
        .state,
      "rejected",
    );
    await p.query("DELETE FROM operations WHERE id=$1", [id]);
  } finally {
    await p.end();
    await operator.end();
  }
  console.log(
    "PASS actual scoped operator CLIs: active-only private export, withdrawal, suppression, cleanup, queue visibility/resolution and operation rejection; operator session access denied",
  );
} finally {
  rmSync(folder, { recursive: true });
}
