import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cancellationDeadline, canManageBooking } from "./cancellation";
import { firstBookedHour, rentalDateSchema, rentalOrderSchema } from "./pretix-order-model";
import { MAX_HOURS } from "./booking";

export class ManagementUnavailable extends Error {}
export class BookingNotFound extends Error {}

function secureEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

function config() {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const item = process.env.PRETIX_ITEM_ID?.trim();
  const token = process.env.PRETIX_MANAGE_API_TOKEN?.trim();
  if (!organizer || !event || !item || !/^\d+$/.test(item) || !token) throw new ManagementUnavailable();
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  if (!["http:", "https:"].includes(base.protocol)) throw new ManagementUnavailable();
  return { base, organizer, event, itemId: Number(item), token };
}

async function pretixJson(url: URL, token: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Token ${token}`, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ManagementUnavailable();
  }
  if (response.status === 404) throw new BookingNotFound();
  if (!response.ok) throw new ManagementUnavailable();
  return response.json();
}

/** Read the live order and its dated positions on every management request. */
export async function getPretixManagementEligibility(code: string, secret: string) {
  if (!/^[A-Za-z0-9]{5,20}$/.test(code) || secret.length < 8 || secret.length > 256) throw new BookingNotFound();
  const cfg = config();
  const prefix = `/api/v1/organizers/${encodeURIComponent(cfg.organizer)}/events/${encodeURIComponent(cfg.event)}/`;
  const orderUrl = new URL(`${prefix}orders/${encodeURIComponent(code)}/`, cfg.base);
  const order = rentalOrderSchema.parse(await pretixJson(orderUrl, cfg.token));
  if (order.code !== code || order.event !== cfg.event || !secureEqual(order.secret, secret)) throw new BookingNotFound();

  const ids = [...new Set(order.positions.map((position) => position.subevent))];
  if (ids.some((id) => id === null) || ids.length === 0 || ids.length > MAX_HOURS) throw new ManagementUnavailable();
  const dates = await Promise.all(ids.map(async (id) => {
    const url = new URL(`${prefix}subevents/${id}/`, cfg.base);
    return rentalDateSchema.parse(await pretixJson(url, cfg.token));
  }));
  const firstHourIso = firstBookedHour(order, dates, cfg.itemId);
  if (!firstHourIso) throw new ManagementUnavailable();
  const serverNowIso = new Date().toISOString();
  return {
    eligible: canManageBooking(firstHourIso, serverNowIso),
    firstHourIso,
    deadlineIso: cancellationDeadline(firstHourIso)!.toISO()!,
    serverNowIso,
  };
}
