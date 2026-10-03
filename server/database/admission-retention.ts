import type { Pool } from "pg";
import { admission } from "./admission";
/** Bounded expiry cleanup. DELETE rechecks expiry after acquiring a contended row lock,
 * preserving counters concurrently renewed by admission. No worker write/reset grant needed. */
export async function cleanupAdmissionBudgets(pool: Pool) {
  return admission(pool, "admission-retention", async c =>
    (await c.query(`DELETE FROM admission_budgets WHERE key IN (
      SELECT key FROM admission_budgets WHERE expires_at<=clock_timestamp()
      ORDER BY expires_at LIMIT 100
    ) AND expires_at<=clock_timestamp()`)).rowCount);
}
