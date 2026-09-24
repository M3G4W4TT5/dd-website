import "server-only";
import { z } from "zod";
import { DateTime } from "luxon";
import { dateSchema, eventSchema, itemSchema, normalizeEvent, quotaSchema, occupiesRoom, overlaps, type Occurrence, type RawEvent, type RawDate } from "./events-model";

const LIMIT = 2000;
function config() {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const token = process.env.PRETIX_API_TOKEN?.trim();
  if (!organizer || !token) return null;
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid pretix API URL");
  return { organizer, token, base };
}
async function list<T>(path: string, schema: z.ZodType<T>, cfg: NonNullable<ReturnType<typeof config>>): Promise<T[]> {
  let url: URL | null = new URL(path, cfg.base);
  const output: T[] = [];
  while (url) {
    const response = await fetch(url, { headers: { Authorization: `Token ${cfg.token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`pretix API ${response.status}`);
    const page = z.object({ results: z.array(schema), next: z.string().nullable() }).parse(await response.json());
    output.push(...page.results);
    if (output.length > LIMIT) throw new Error("pretix catalog result limit exceeded");
    const next: URL | null = page.next ? new URL(page.next, cfg.base) : null;
    if (next && next.origin !== cfg.base.origin) throw new Error("Unexpected pretix pagination origin");
    url = next;
  }
  return output;
}
const prefix = (organizer: string) => `/api/v1/organizers/${encodeURIComponent(organizer)}/events/`;
export type Catalog = { state: "setup" | "ready" | "error"; occurrences: Occurrence[]; checkoutEnabled: boolean; organizer: string; shopBase: string | null };
export async function getCatalog(): Promise<Catalog> {
  const cfg = config();
  const empty: Catalog = { state: cfg ? "error" : "setup", occurrences: [], checkoutEnabled: false, organizer: cfg?.organizer || "", shopBase: null };
  if (!cfg) return empty;
  try {
    const rawEvents = await list(prefix(cfg.organizer), eventSchema, cfg);
    const rentalSlug = process.env.PRETIX_EVENT_SLUG?.trim();
    const showDraftTestEvents = process.env.NODE_ENV === "development" && process.env.PRETIX_DEV_DRAFT_EVENTS === "true";
    const eventDates = await Promise.all(rawEvents.filter(e => e.slug !== rentalSlug).map(async event => {
      const path = `${prefix(cfg.organizer)}${encodeURIComponent(event.slug)}/`;
      const dates: (RawDate | null)[] = event.has_subevents ? await list(`${path}subevents/`, dateSchema, cfg) : [null];
      return { event, dates, path };
    }));
    const grouped = await Promise.all(eventDates.filter(({ event }) => (event.live || (showDraftTestEvents && event.testmode)) && event.is_public).map(async ({ event, dates, path }) => {
      const [items, quotas] = await Promise.all([
        list(`${path}items/`, itemSchema, cfg),
        list(`${path}quotas/?with_availability=true`, quotaSchema, cfg),
      ]);
      return dates.map(date => normalizeEvent(event, date, items, quotas, DateTime.utc(), showDraftTestEvents)).filter((item): item is Occurrence => item !== null);
    }));
    const eventBlocks = eventDates.flatMap(({ event, dates }) => dates.flatMap(date => {
      const start = date?.date_from ?? event.date_from;
      const end = date?.date_to ?? event.date_to;
      if (!end) throw new Error("Event date without end time");
      return occupiesRoom(event, date, start, end)
        ? [{ key: `${event.slug}:${date?.id ?? "single"}`, start, end }] : [];
    }));
    const rentalEvent = rawEvents.find(e => e.slug === rentalSlug);
    const rentalItemId = Number(process.env.PRETIX_ITEM_ID);
    // Unavailable rental inventory may represent a paid order or an administrative block.
    // Either way, an overlapping event must not gain a purchase link.
    const rentalConflicts: { start: string; end: string }[] = [];
    if (rentalEvent?.has_subevents && Number.isInteger(rentalItemId) && rentalItemId > 0) {
      const path = `${prefix(cfg.organizer)}${encodeURIComponent(rentalEvent.slug)}/`;
      const [rentalDates, rentalQuotas] = await Promise.all([
        list(`${path}subevents/`, dateSchema, cfg),
        list(`${path}quotas/?with_availability=true`, quotaSchema, cfg),
      ]);
      for (const date of rentalDates) {
        if (!date.date_to) throw new Error("Rental slot without end time");
        const applicable = rentalQuotas.filter(q => (q.subevent === date.id || q.subevent === null) && q.items.includes(rentalItemId));
        if (applicable.some(q => q.closed || q.available !== true || (q.available_number !== null && (q.available_number ?? 0) < 1))) {
          rentalConflicts.push({ start: date.date_from, end: date.date_to });
        }
      }
    }
    const developmentImages: Record<string, string> = {
      "dance-with-dd-dev": "/events/dance-with-dd.webp",
      "street-dance-workshop-dd-dev": "/events/street-dance-workshop-dd.webp",
    };
    const allOccurrences = grouped.flat().map(item => showDraftTestEvents && !item.image && developmentImages[item.slug]
      ? { ...item, image: developmentImages[item.slug] } : item);
    const occurrences = allOccurrences.map(item => rentalConflicts.some(slot => overlaps(item.start, item.end, slot.start, slot.end)) ||
      eventBlocks.some(other => other.key !== item.key && overlaps(item.start, item.end, other.start, other.end))
      ? { ...item, status: "room-conflict" as const } : item);
    const shopBase = process.env.PRETIX_SHOP_BASE?.trim() || null;
    // This flag is an operator attestation after room inventory and payment have been verified in pretix.
    const checkoutEnabled = process.env.PRETIX_EVENTS_CHECKOUT_ENABLED === "true" && Boolean(shopBase && new URL(shopBase).protocol === "https:" && rentalEvent?.has_subevents && Number.isInteger(rentalItemId) && rentalItemId > 0);
    return { state: "ready", occurrences: occurrences.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), checkoutEnabled, organizer: cfg.organizer, shopBase };
  } catch {
    return empty;
  }
}
export async function getRoomOccupancy(day: string): Promise<{ start: string; end: string }[]> {
  const cfg = config();
  if (!cfg) return [];
  const events = await list(prefix(cfg.organizer), eventSchema, cfg);
  const rentalSlug = process.env.PRETIX_EVENT_SLUG?.trim();
  const dayStart = DateTime.fromISO(day, { zone: "Europe/Copenhagen" }).startOf("day").toUTC().toISO()!;
  const dayEnd = DateTime.fromISO(day, { zone: "Europe/Copenhagen" }).plus({ days: 1 }).startOf("day").toUTC().toISO()!;
  const occupied: { start: string; end: string }[] = [];
  for (const event of events.filter(e => e.slug !== rentalSlug)) {
    const dates: (RawDate | null)[] = event.has_subevents
      ? await list(`${prefix(cfg.organizer)}${encodeURIComponent(event.slug)}/subevents/`, dateSchema, cfg)
      : [null];
    for (const date of dates) {
      const start = date?.date_from ?? event.date_from;
      const end = date?.date_to ?? event.date_to;
      if (!end && Date.parse(start) < Date.parse(dayEnd)) throw new Error("Event end time required for room inventory");
      if (end && occupiesRoom(event, date, dayStart, dayEnd)) occupied.push({ start, end });
    }
  }
  return occupied;
}
