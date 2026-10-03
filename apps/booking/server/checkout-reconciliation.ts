import type { Pool } from "pg";
import { admission, lease } from "../../../server/database/admission";
import { pretixFetch, pretixHeaders } from "./pretix-http";

type Intent = { order_code: string; intent_hash: string; state: string };
export async function readAllocation(code: string, signal: AbortSignal): Promise<unknown | null> {
  const url = new URL(`/api/v1/organizers/${process.env.PRETIX_ORGANIZER_SLUG}/events/${process.env.PRETIX_EVENT_SLUG}/orders/${encodeURIComponent(code)}/`, process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  const response = await pretixFetch(url, {
    headers: pretixHeaders(url, process.env.PRETIX_MANAGE_API_TOKEN || ""),
    signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Allocation reconciliation unavailable");
  return response.json();
}

/** Read-only provider reconciliation, shared across workers, never cancel/release by local time.
 * The checked marker rotates unresolved rows without resetting their creation safety grace. */
export async function reconcileAllocations(pool: Pool, read = readAllocation) {
  const release = await lease(pool, "checkout-reconciliation", 1, 90);
  const signal = AbortSignal.timeout(40000);
  let released = 0;
  try {
    const candidates = await admission(pool, "checkout-reconciliation-candidates", async c =>
      (await c.query<Intent>(`WITH candidates AS (
        SELECT order_code FROM rental_intents WHERE
          (state='pending' AND (remote_expires<=now() OR (remote_expires IS NULL AND updated_at<now()-interval '3 minutes')))
          OR (state IN ('reserved','uncertain') AND updated_at<now()-interval '3 minutes')
        ORDER BY reconciled_at,order_code LIMIT 10
      ) UPDATE rental_intents SET reconciled_at=now() WHERE order_code IN (SELECT order_code FROM candidates)
        RETURNING order_code,intent_hash,state`)).rows);
    for (const candidate of candidates) {
      if (signal.aborted) break;
      const c = await pool.connect();
      let locked = false;
      try {
        await c.query("SET statement_timeout='2s'");
        locked = (await c.query<{locked:boolean}>("SELECT pg_try_advisory_lock(hashtext(current_schema()||':rental-intent'),hashtext($1)) AS locked", [candidate.order_code])).rows[0].locked;
        if (!locked) continue;
        const current = (await c.query<Intent>("SELECT order_code,intent_hash,state FROM rental_intents WHERE order_code=$1", [candidate.order_code])).rows[0];
        if (!current || current.state === "terminal") continue;
        const remote = await read(current.order_code, signal);
        // reserved is written before the allocation POST; uncertain is written before sending it.
        // A 404 after an uncertain POST can hide a delayed commit and must retain its allocation.
        const terminal = remote === null ? current.state === "reserved" :
          typeof remote === "object" && remote !== null &&
          (remote as {code?:unknown}).code === current.order_code &&
          (remote as {api_meta?:{ttd_checkout_intent?:unknown}}).api_meta?.ttd_checkout_intent === current.intent_hash &&
          ["p", "c", "e"].includes(String((remote as {status?:unknown}).status));
        if (terminal) {
          await c.query("UPDATE rental_intents SET state='terminal',updated_at=now() WHERE order_code=$1", [current.order_code]);
          released++;
        }
      } catch { /* Retain allocations when authority, parsing or locks are unavailable. */ }
      finally {
        try {
          if (locked) await c.query("SELECT pg_advisory_unlock(hashtext(current_schema()||':rental-intent'),hashtext($1))", [candidate.order_code]);
          await c.query("RESET statement_timeout");
          c.release();
        } catch { c.release(true); }
      }
    }
    return released;
  } finally { await release(); }
}
