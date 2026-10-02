import type { Pool } from "pg";
import { admission, AdmissionDenied, budget, emergency, setting } from "./admission";
export type WebhookTrigger = { notification_id: string | number; organizer: string; event: string; code: string; action: string };
/** Caller authenticates/validates scope first. A trigger never authorizes order state. */
export async function admitWebhook(pool: Pool, p: WebhookTrigger) {
  return admission(pool, "webhook-intake", async c => {
    const id=String(p.notification_id);
    if ((await c.query("SELECT 1 FROM webhook_inbox WHERE notification_id=$1",[id])).rowCount) return;
    const counts=await c.query<{ pending: number; total: number }>("SELECT count(*) FILTER(WHERE state IN ('queued','failed'))::int pending,count(*)::int total FROM webhook_inbox");
    if(counts.rows[0].pending>=setting("WEBHOOK_INBOX_PENDING",500) || counts.rows[0].total>=setting("WEBHOOK_INBOX_TOTAL",5000)) throw new AdmissionDenied("capacity",30);
    await budget(c,"webhook:hour",setting("WEBHOOK_HOURLY",600),3600,"capacity");
    await emergency(c,"webhook:burst",setting("WEBHOOK_BURST",100),1);
    await c.query("INSERT INTO webhook_inbox(notification_id,organizer,event,code,action) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[id,p.organizer,p.event,p.code,p.action]);
  });
}
/** Keep retry/dedup evidence 30 days; never delete unresolved queued/failed rows. */
export async function cleanupWebhookInbox(pool: Pool) {
  await pool.query("DELETE FROM webhook_inbox WHERE notification_id IN (SELECT notification_id FROM webhook_inbox WHERE state IN ('processed','ignored') AND created_at<now()-interval '30 days' ORDER BY created_at LIMIT 100)");
}
