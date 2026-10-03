import { cleanupWebhookInbox } from "../../../server/database/webhook-admission";
import { cleanupAdmissionBudgets } from "../../../server/database/admission-retention";
import { reconcileAllocations } from "./checkout-reconciliation";
import { createServer } from "node:http";
import { pretixFetch, pretixHeaders, pretixNextPage } from "./pretix-http";
import { createCapture, createMailer, DeliveryError } from "@dd/mail";
import { mailConfig } from "@dd/runtime";
import { pollDelivery } from "../../../server/database/delivery";
import {
  bookingDb,
  payloadKey,
  observeOrder,
  currentLifecycleMessage,
} from "./notifications";
import { lease } from "../../../server/database/admission";
import { deliverAccess } from "./manage-recovery";
import { orderState, view, ManageConflict } from "./pretix-live-management";
import { validateWorker } from "./config";
validateWorker(process.env);
const pool = bookingDb();
const key = payloadKey();
const policy = mailConfig(process.env);
if (policy.delivery !== "capture" && policy.user !== "booking@didde-mie.com")
  throw new Error("Incorrect transactional SMTP identity");
const capture = createCapture(process.env.CAPTURE_DIRECTORY);
const send = createMailer(policy, "booking", capture);
let stopping = false,
  lastSuccess = Date.now();
const health = createServer((_req, res) => {
  res.writeHead(Date.now() - lastSuccess < 60000 ? 200 : 503);
  res.end("worker");
});
health.listen(
  Number(process.env.WORKER_HEALTH_PORT || 3013),
  process.env.HOST || "127.0.0.1",
);
async function observe(code: string) {
  return observeOrder(code, async () => {
    const state = await orderState(code);
    return view(state.order, state.interval);
  });
}
async function sweep() {
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  const prefix = `/api/v1/organizers/${process.env.PRETIX_ORGANIZER_SLUG}/events/${process.env.PRETIX_EVENT_SLUG}/orders/`;
  let url: URL | null = new URL(prefix, base);
  for (let page = 0; url && page < 20; page++) {
    const response = await pretixFetch(url, {
      headers: pretixHeaders(url, process.env.PRETIX_MANAGE_API_TOKEN || ""),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Reconciliation unavailable");
    const data = (await response.json()) as {
      results: { code: string; status: string }[];
      next: string | null;
    };
    for (const order of data.results)
      if (order.status === "p" || order.status === "c")
        await observe(order.code).catch((e) => {
          if (
            !(e instanceof ManageConflict) &&
            !(
              e instanceof Error &&
              /Unsupported|positions|rental|date/.test(e.message)
            )
          )
            throw e;
        });
    url = pretixNextPage(data.next, url, base);
  }
  if (url) throw new Error("Reconciliation pagination limit");
}
let rounds = 0;
async function loop() {
  while (!stopping) {
    try {
      const inbox = await pool.query<{ notification_id: string; code: string }>(
        "SELECT notification_id,code FROM webhook_inbox WHERE state='queued' AND next_at<=now() ORDER BY created_at LIMIT 10",
      );
      for (const item of inbox.rows) {
        try {
          await observe(item.code);
          await pool.query(
            "UPDATE webhook_inbox SET state='processed' WHERE notification_id=$1",
            [item.notification_id],
          );
        } catch (e) {
          if (e instanceof ManageConflict) {
            await pool.query(
              "UPDATE webhook_inbox SET state='ignored' WHERE notification_id=$1",
              [item.notification_id],
            );
          } else {
            await pool.query(
              "UPDATE webhook_inbox SET attempts=attempts+1,state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'queued' END,next_at=now()+interval '30 seconds' WHERE notification_id=$1",
              [item.notification_id],
            );
          }
        }
      }
      if (rounds++ % 30 === 0) await sweep();
      await pollDelivery(pool, key, async (row, payload, id) => {
        try {
          if (row.kind === "paid" || row.kind === "recovery") {
            try {
              await deliverAccess(row.kind, payload, send, id);
            } catch (e) {
              if (e instanceof ManageConflict)
                throw new DeliveryError("permanent");
              throw e;
            }
            return;
          }
          if (!["change", "cancellation", "refund"].includes(row.kind))
            throw new DeliveryError("permanent");
          const state = await orderState(payload.code);
          const booking = view(state.order, state.interval);
          const language = state.order.locale?.startsWith("da") ? "da" : "en";
          const snapshot = await pool.query<{ revision: string }>("SELECT revision FROM order_snapshots WHERE order_code=$1", [payload.code]);
          const message = currentLifecycleMessage(
            row.kind as "change" | "cancellation" | "refund",
            payload.observed,
            booking,
            state.order.email.toLowerCase(),
            language,
            payload.revision,
            Number(snapshot.rows[0]?.revision),
          );
          if (!message) return;
          await send(
            row.kind as "change" | "cancellation" | "refund",
            message,
            id,
          );
        } catch (error) {
          if (error instanceof DeliveryError) throw error;
          if (error instanceof ManageConflict)
            throw new DeliveryError("permanent");
          // Reads, rendering and token writes precede SMTP. Mailer errors
          // already distinguish rejection from unknown acceptance.
          throw new DeliveryError("retry");
        }
      }, "lifecycle");
      await pool.query(
        "DELETE FROM abuse_limits WHERE expires_at<now(); DELETE FROM manage_link_tokens WHERE expires_at<now()",
      );
      await cleanupWebhookInbox(pool);
      await cleanupAdmissionBudgets(pool);
      lastSuccess = Date.now();
    } catch {
      console.error("Booking worker dependency failure; inspect queue status");
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  await pool.end();
}
async function recoveryLoop() {
  while (!stopping) {
    let release: (() => Promise<void>) | undefined;
    try {
      // Separate loop plus a cross-process lease keeps recovery off lifecycle capacity.
      release = await lease(pool, "recovery-worker", 1, 180);
      await pollDelivery(pool, key, async (_row, payload, id) => {
        try { await deliverAccess("recovery", payload, send, id); }
        catch (e) { throw e instanceof DeliveryError ? e : new DeliveryError("retry"); }
      }, "recovery");
    } catch { /* Sanitized; saturation is expected under pressure. */ }
    finally { if (release) await release().catch(() => {}); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
void recoveryLoop();
async function allocationLoop() {
  while (!stopping) {
    try { await reconcileAllocations(pool); }
    catch { console.error("Allocation reconciliation unavailable; reservations retained"); }
    await new Promise(r => setTimeout(r, 10000));
  }
}
void allocationLoop();
void loop();
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    capture.close();
    health.close();
  });
