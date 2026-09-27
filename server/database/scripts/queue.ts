import { database } from "../index";
const schema = process.env.QUEUE_SCHEMA;
const expected =
  schema === "primary_marketing" || schema === "booking_marketing"
    ? schema + "_operator"
    : !schema
      ? "booking_management_operator"
      : null;
if (
  !expected ||
  new URL(process.env.QUEUE_DATABASE_URL ?? "").username !== expected
)
  throw new Error("Scoped queue operator required");
const pool = database(
  process.env.QUEUE_DATABASE_URL ?? "",
  process.env.QUEUE_SCHEMA as
    | "primary_marketing"
    | "booking_marketing"
    | undefined,
);
const [command, id] = process.argv.slice(2);
try {
  if (command === "status") {
    const state = await pool.query(
      "SELECT state,count(*)::int AS count,min(created_at) AS oldest FROM deliveries GROUP BY state ORDER BY state",
    );
    console.log(JSON.stringify(state.rows));
    const attempts = await pool.query(
      "SELECT outcome,count(*)::int AS count FROM delivery_attempts GROUP BY outcome",
    );
    console.log(JSON.stringify(attempts.rows));
  } else if (command === "operations" && !schema) {
    const result = await pool.query(
      "SELECT id,kind,state,created_at FROM operations WHERE state IN ('prepared','submitted','ambiguous') ORDER BY created_at",
    );
    console.log(JSON.stringify(result.rows));
  } else if (command === "operation-rejected" && !schema) {
    if (!id || !/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Operation UUID required");
    const result = await pool.query(
      "UPDATE operations SET state='rejected' WHERE id=$1 AND state IN ('prepared','submitted','ambiguous')",
      [id],
    );
    console.log("Resolved records: " + result.rowCount);
  } else if (command === "resolve-sent" || command === "resolve-unsent") {
    if (!id || !/^\d+$/.test(id))
      throw new Error("Numeric delivery id required");
    const state = command === "resolve-sent" ? "sent" : "queued";
    const result = await pool.query(
      "UPDATE deliveries SET state=$2,lease=NULL,next_at=now(),payload=CASE WHEN $2='sent' THEN NULL ELSE payload END WHERE id=$1 AND state='ambiguous' AND (payload IS NOT NULL OR $2='sent')",
      [id, state],
    );
    console.log("Resolved records: " + result.rowCount);
  } else
    throw new Error(
      "Commands: status, resolve-sent id, resolve-unsent id (only after checking provider acceptance)",
    );
} finally {
  await pool.end();
}
