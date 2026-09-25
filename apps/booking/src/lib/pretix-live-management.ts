import "server-only";

import { Pool } from "pg";
import { DateTime } from "luxon";
import { canManageBooking } from "./cancellation";
import { getAvailability } from "./availability";
import { quoteInterval, STUDIO_ZONE } from "./booking";
import { managedInterval, managedOrderSchema, refundStatus, toOre, type ManagedOrder } from "./managed-order";
import { rentalDateSchema } from "./pretix-order-model";
import type { ManagedBooking } from "@/components/ManageBookingPanel";

export class ManageConflict extends Error {}
let lockPool: Pool | undefined;

function config(write = false) {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const item = process.env.PRETIX_ITEM_ID?.trim();
  const readToken = process.env.PRETIX_MANAGE_API_TOKEN?.trim();
  const writeToken = process.env.PRETIX_MANAGE_WRITE_API_TOKEN?.trim();
  if (!organizer || !event || !item || !/^\d+$/.test(item) || !readToken || (write && !writeToken)) throw new Error("Pretix management is not configured");
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid pretix URL");
  return { organizer, event, itemId: Number(item), readToken, writeToken, base,
    prefix: `/api/v1/organizers/${encodeURIComponent(organizer)}/events/${encodeURIComponent(event)}/` };
}

export function selfServiceEnabled() {
  return process.env.BOOKING_SELF_SERVICE_ENABLED === "true" && Boolean(process.env.PRETIX_MANAGE_WRITE_API_TOKEN?.trim());
}

async function api(url: URL, token: string, body?: unknown) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Token ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    if (response.status === 400 || response.status === 404 || response.status === 409) throw new ManageConflict("Pretix rejected the operation");
    throw new Error(`Pretix management API failed (${response.status})`);
  }
  return response.json() as Promise<unknown>;
}

async function orderState(code: string, email?: string) {
  const cfg = config();
  const orderUrl = new URL(`${cfg.prefix}orders/${encodeURIComponent(code)}/`, cfg.base);
  orderUrl.searchParams.set("include_canceled_positions", "true");
  const order = managedOrderSchema.parse(await api(orderUrl, cfg.readToken));
  if (order.code !== code || order.event !== cfg.event || (email && order.email.trim().toLowerCase() !== email)) throw new ManageConflict("Order access changed");
  const ids = [...new Set(order.positions.map((position) => position.subevent))];
  if (ids.some((id) => id === null)) throw new ManageConflict("Unsupported order positions");
  const dates = await Promise.all(ids.map(async (id) => rentalDateSchema.parse(await api(new URL(`${cfg.prefix}subevents/${id}/`, cfg.base), cfg.readToken))));
  const interval = managedInterval(order, dates, cfg.itemId);
  return { cfg, order, interval };
}

function view(order: ManagedOrder, interval: Awaited<ReturnType<typeof orderState>>["interval"]): ManagedBooking {
  return { reference: order.code, firstHourIso: interval.start, endIso: interval.end,
    paidOre: toOre(order.total), status: order.status === "p" ? "paid" : "cancelled", refund: refundStatus(order) };
}

export async function getManagedBooking(code: string, email: string) {
  const state = await orderState(code, email);
  return view(state.order, state.interval);
}

export async function getPaidOrderContact(code: string) {
  const { order } = await orderState(code);
  if (order.status !== "p" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) throw new ManageConflict("Not a paid rental order");
  return { email: order.email.trim().toLowerCase(), language: order.locale?.toLowerCase().startsWith("da") ? "da" as const : "en" as const };
}

async function withOrderLock<T>(code: string, operation: () => Promise<T>): Promise<T> {
  const connectionString = process.env.SUBSCRIPTIONS_DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Management database unavailable");
  lockPool ??= new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000, allowExitOnIdle: true });
  const client = await lockPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`ttd-management:${code}`]);
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

function ensureEligible(order: ManagedOrder, start: string) {
  if (order.status !== "p" || !canManageBooking(start, new Date().toISOString()) || order.refunds.length) throw new ManageConflict("Order cannot be changed now");
}

export async function changeManagedBooking(code: string, email: string, firstHourIso: string, endIso: string) {
  if (!selfServiceEnabled()) throw new ManageConflict("Self-service unavailable");
  return withOrderLock(code, async () => {
    const { cfg, order, interval } = await orderState(code, email);
    ensureEligible(order, interval.start);
    const hours = interval.entries.length;
    if (Date.parse(endIso) - Date.parse(firstHourIso) !== hours * 3_600_000 || firstHourIso === interval.start) throw new ManageConflict("Invalid interval");
    const day = DateTime.fromISO(firstHourIso, { setZone: true }).setZone(STUDIO_ZONE).toISODate();
    if (!day) throw new ManageConflict("Invalid date");
    const availability = await getAvailability(day);
    if (availability.source !== "pretix") throw new ManageConflict("Live availability unavailable");
    const startSlot = availability.slots.find((slot) => Date.parse(slot.start) === Date.parse(firstHourIso));
    const quote = startSlot ? quoteInterval(availability, startSlot.id, hours) : null;
    if (!quote || Date.parse(quote.end) !== Date.parse(endIso) || quote.totalOre !== toOre(order.total)) throw new ManageConflict("Interval or price changed");
    // The booking remains intact if pretix cannot atomically change every position.
    const latest = await orderState(code, email);
    ensureEligible(latest.order, latest.interval.start);
    if (latest.interval.start !== interval.start || latest.interval.entries.some((entry, index) => entry.positionId !== interval.entries[index]?.positionId || entry.subeventId !== interval.entries[index]?.subeventId)) throw new ManageConflict("Order changed during selection");
    const patch_positions = interval.entries.map((entry, index) => ({ position: entry.positionId, body: { subevent: Number(quote.slotIds[index]) } }));
    await api(new URL(`${cfg.prefix}orders/${encodeURIComponent(code)}/change/`, cfg.base), cfg.writeToken!, { patch_positions, send_email: true });
    const updated = await orderState(code, email);
    return view(updated.order, updated.interval);
  });
}

export async function cancelManagedBooking(code: string, email: string) {
  if (!selfServiceEnabled()) throw new ManageConflict("Self-service unavailable");
  return withOrderLock(code, async () => {
    const { cfg, order, interval } = await orderState(code, email);
    ensureEligible(order, interval.start);
    const payments = order.payments.filter((payment) => payment.state === "confirmed");
    if (payments.length !== 1 || payments[0].provider !== "stripe" || toOre(payments[0].amount) !== toOre(order.total)) {
      throw new ManageConflict("Online full refund is unavailable for this payment");
    }
    // pretix creates the refund and cancels the order together when its payment provider supports it.
    await api(new URL(`${cfg.prefix}orders/${encodeURIComponent(code)}/payments/${payments[0].local_id}/refund/`, cfg.base), cfg.writeToken!, {
      amount: payments[0].amount, comment: "Customer cancellation via TTD Studio", mark_canceled: true,
    });
    const updated = await orderState(code, email);
    return view(updated.order, updated.interval);
  });
}
