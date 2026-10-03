import type { Pool } from "pg";
import { admission, setting } from "./admission";
/** Bounded, schema-scoped retention. Active consent, withdrawal, suppression and
 * unresolved ambiguous deliveries remain. Never run on populated data during verification. */
export function cleanupMarketing(pool:Pool, membershipOnly=false) {
  return admission(pool,"marketing-retention",async c=>{
    const max=setting("MARKETING_CLEANUP_BATCH",100,500);
    await c.query("DELETE FROM marketing_action_tokens WHERE token_hash IN (SELECT token_hash FROM marketing_action_tokens WHERE expires_at<now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)",[max]);
    const terminal=membershipOnly ? {rows:[]} : await c.query<{id:string}>("SELECT id FROM deliveries WHERE state IN ('sent','permanent') AND created_at<now()-interval '30 days' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED",[max]);
    const ids=terminal.rows.map(r=>r.id);
    if(ids.length) {
      await c.query("DELETE FROM delivery_attempts WHERE delivery_id=ANY($1::bigint[])",[ids]);
      await c.query("DELETE FROM deliveries WHERE id=ANY($1::bigint[])",[ids]);
    }
    await c.query("DELETE FROM marketing_subscriptions WHERE email IN (SELECT s.email FROM marketing_subscriptions s WHERE status='pending' AND requested_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM marketing_consent_history h WHERE h.email=s.email AND h.status IN ('active','unsubscribed','suppressed')) AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.identity LIKE '%:confirm:' || encode(sha256(convert_to(s.email,'UTF8')),'hex') || ':%' AND d.state IN ('queued','leased','sending','ambiguous')) ORDER BY requested_at LIMIT $1 FOR UPDATE SKIP LOCKED)",[max]);
    if(!membershipOnly) {
    await c.query("DELETE FROM internal_requests WHERE key IN (SELECT key FROM internal_requests WHERE created_at<now()-interval '7 days' ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)",[max]);
    for (const table of ["admission_budgets","abuse_limits"])
      await c.query(`DELETE FROM ${table} WHERE key IN (SELECT key FROM ${table} WHERE expires_at<now() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)`,[max]);
    await c.query("DELETE FROM admission_leases WHERE id IN (SELECT id FROM admission_leases WHERE expires_at<now() LIMIT $1 FOR UPDATE SKIP LOCKED)",[max]);
    }
    return {terminal:ids.length};
  });
}
