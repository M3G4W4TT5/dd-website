import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { decrypt } from "./index";
export type Delivery = {
  id: string;
  identity: string;
  kind: string;
  payload: string;
  attempts: number;
  lease: string;
};
export async function pollDelivery(
  pool: Pool,
  key: string,
  send: (row: Delivery, payload: any, messageId: string) => Promise<void>,
  lane: "all" | "recovery" | "lifecycle" = "all",
) {
  // Expired sends include crashes after SMTP acceptance: explicit ambiguity, never auto-retry.
  await pool.query(
    "UPDATE deliveries SET state='ambiguous',lease=NULL WHERE state='sending' AND lease_until<now()",
  );
  await pool.query(
    "UPDATE deliveries SET state=CASE WHEN attempts>=6 THEN 'permanent' ELSE 'queued' END,lease=NULL WHERE state='leased' AND lease_until<now()",
  );
  await pool.query(
    "UPDATE deliveries SET payload=NULL WHERE created_at<now()-interval '49 hours' AND state IN ('sent','permanent','ambiguous')",
  );
  await pool.query(
    "UPDATE deliveries SET state='permanent',payload=NULL WHERE created_at<now()-interval '48 hours' AND state IN ('queued','leased')",
  );
  const lease = randomUUID();
  const result = await pool.query<Delivery>(
    `UPDATE deliveries SET state='leased',lease=$1,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM deliveries WHERE state='queued' AND next_at<=now() AND ($2='all' OR ($2='recovery' AND kind='recovery') OR ($2='lifecycle' AND kind<>'recovery')) ORDER BY CASE WHEN kind='marketing-withdrawal' THEN 0 ELSE 1 END,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [lease, lane],
  );
  const row = result.rows[0];
  if (!row) return false;
  // Payload preparation occurs before switching to sending, so a crash here can safely retry.
  let payload: unknown;
  try {
    payload = decrypt(row.payload, key);
  } catch {
    await pool.query(
      "UPDATE deliveries SET state='permanent',payload=NULL,lease=NULL WHERE id=$1 AND lease=$2",
      [row.id, lease],
    );
    return true;
  }
  await pool.query(
    "UPDATE deliveries SET state='sending' WHERE id=$1 AND lease=$2",
    [row.id, lease],
  );
  try {
    await send(
      row,
      payload,
      `<dd-${row.id}-${(await import("./index")).digest(row.identity)}@didde-mie.com>`,
    );
  } catch (error) {
    const state = (error as { state?: string }).state;
    const next =
      state === "retry" && row.attempts < 6
        ? "queued"
        : state === "permanent" || (state === "retry" && row.attempts >= 6)
          ? "permanent"
          : "ambiguous";
    await pool.query(
      "INSERT INTO delivery_attempts(delivery_id,attempt,outcome) VALUES($1,$2,$3)",
      [row.id, row.attempts, next],
    );
    await pool.query(
      "UPDATE deliveries SET state=$3,lease=NULL,next_at=now()+$4*interval '1 second' WHERE id=$1 AND lease=$2",
      [row.id, lease, next, Math.min(3600, 30 * 2 ** row.attempts)],
    );
    return true;
  }
  // A DB failure after acceptance leaves sending; expiry becomes ambiguous, not a resend.
  await pool.query(
    "INSERT INTO delivery_attempts(delivery_id,attempt,outcome) VALUES($1,$2,'accepted')",
    [row.id, row.attempts],
  );
  await pool.query(
    "UPDATE deliveries SET state='sent',lease=NULL,payload=NULL WHERE id=$1 AND lease=$2",
    [row.id, lease],
  );
  return true;
}
