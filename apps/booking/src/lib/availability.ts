import "server-only";

import { DateTime } from "luxon";
import { z } from "zod";
import { Availability, Slot, STUDIO_ZONE } from "./booking";
import { getRoomOccupancy } from "./events";
import { overlaps } from "./events-model";

const MAX_LOOKAHEAD_DAYS = 45;
const DEMO_PRICE_ORE = 35_000; // Client-provided hourly rate for the local preview.

const subeventSchema = z.object({
  id: z.number(),
  active: z.boolean(),
  is_public: z.boolean(),
  date_from: z.string(),
  date_to: z.string().nullable(),
  item_price_overrides: z
    .array(z.object({ item: z.number(), disabled: z.boolean(), price: z.string().nullable() }))
    .optional(),
});

const quotaSchema = z.object({
  subevent: z.number().nullable(),
  size: z.number().nullable(),
  items: z.array(z.number()),
  closed: z.boolean(),
  available: z.boolean().optional(),
  available_number: z.number().nullable().optional(),
});

const itemSchema = z.object({
  id: z.number(),
  active: z.boolean(),
  default_price: z.string(),
});

type PretixConfig = {
  base: URL;
  organizer: string;
  event: string;
  itemId: number;
  token: string;
};

function parseDay(date: string): DateTime {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError("Invalid date");
  const day = DateTime.fromISO(date, { zone: STUDIO_ZONE });
  const today = DateTime.now().setZone(STUDIO_ZONE).startOf("day");
  if (
    !day.isValid ||
    day.toISODate() !== date ||
    day < today ||
    day > today.plus({ days: MAX_LOOKAHEAD_DAYS })
  ) {
    throw new RangeError("Date outside booking window");
  }
  return day;
}

export function todayInStudio(): string {
  return DateTime.now().setZone(STUDIO_ZONE).toISODate()!;
}

function readConfig(): PretixConfig | null {
  const organizer = process.env.PRETIX_ORGANIZER_SLUG?.trim();
  const event = process.env.PRETIX_EVENT_SLUG?.trim();
  const item = process.env.PRETIX_ITEM_ID?.trim();
  const token = process.env.PRETIX_API_TOKEN?.trim();
  if (![organizer, event, item, token].some(Boolean)) return null;
  if (![organizer, event, item, token].every(Boolean)) {
    throw new Error("Incomplete pretix configuration; set all PRETIX_* fields");
  }
  if (!/^\d+$/.test(item!)) throw new Error("PRETIX_ITEM_ID must be numeric");
  const base = new URL(process.env.PRETIX_API_BASE || "http://127.0.0.1:8345");
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("Invalid pretix URL");
  return { base, organizer: organizer!, event: event!, itemId: Number(item), token: token! };
}

async function getJson(url: URL, config: PretixConfig): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Authorization: `Token ${config.token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`pretix API responded ${response.status}`);
  return response.json();
}

async function listAll<T>(
  url: URL,
  config: PretixConfig,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const results: T[] = [];
  let next: URL | null = url;
  while (next) {
    const page = z.object({ results: z.array(schema), next: z.string().nullable() }).parse(
      await getJson(next, config),
    );
    results.push(...page.results);
    if (results.length > 2_000) throw new Error("pretix result limit exceeded");
    const nextUrl: URL | null = page.next ? new URL(page.next, config.base) : null;
    if (nextUrl && nextUrl.origin !== config.base.origin) {
      throw new Error("Unexpected pretix pagination origin");
    }
    next = nextUrl;
  }
  return results;
}

function toOre(price: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(price)) throw new Error("Invalid pretix price");
  const [whole, fraction = ""] = price.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function demoAvailability(day: DateTime): Availability {
  const slots: Slot[] = [];
  for (let hour = 8; hour < 22; hour += 1) {
    const start = day.set({ hour });
    const end = start.plus({ hours: 1 });
    const syntheticBlock =
      (day.day % 3 === 0 && hour === 12) || (day.day % 4 === 0 && hour === 16);
    slots.push({
      id: `demo-${start.toUTC().toISO()}`,
      start: start.toUTC().toISO()!,
      end: end.toUTC().toISO()!,
      available: !syntheticBlock && start > DateTime.now(),
      priceOre: DEMO_PRICE_ORE,
    });
  }
  return { date: day.toISODate()!, source: "demo", currency: "DKK", slots, checkedAt: DateTime.utc().toISO()! };
}

async function pretixAvailability(day: DateTime, config: PretixConfig): Promise<Availability> {
  const prefix = `/api/v1/organizers/${encodeURIComponent(config.organizer)}/events/${encodeURIComponent(config.event)}/`;
  const subeventsUrl = new URL(`${prefix}subevents/`, config.base);
  subeventsUrl.searchParams.set("date_from_after", day.toUTC().toISO()!);
  subeventsUrl.searchParams.set("date_from_before", day.plus({ days: 1 }).toUTC().minus({ milliseconds: 1 }).toISO()!);
  const quotasUrl = new URL(`${prefix}quotas/?with_availability=true`, config.base);
  const itemUrl = new URL(`${prefix}items/${config.itemId}/`, config.base);

  const [subevents, quotas, rawItem, occupied] = await Promise.all([
    listAll(subeventsUrl, config, subeventSchema),
    listAll(quotasUrl, config, quotaSchema),
    getJson(itemUrl, config),
    getRoomOccupancy(day.toISODate()!),
  ]);
  const item = itemSchema.parse(rawItem);
  if (!item.active || item.id !== config.itemId) throw new Error("Pretix room product is inactive");
  const defaultPrice = toOre(item.default_price);
  const starts = new Set<string>();

  const slots = subevents
    .filter((subevent) =>
      subevent.active &&
      subevent.is_public &&
      subevent.date_to &&
      DateTime.fromISO(subevent.date_from, { setZone: true }).setZone(STUDIO_ZONE).toISODate() === day.toISODate(),
    )
    .map((subevent): Slot => {
      const start = DateTime.fromISO(subevent.date_from, { setZone: true });
      const end = DateTime.fromISO(subevent.date_to!, { setZone: true });
      if (!start.isValid || !end.isValid || end.toMillis() - start.toMillis() !== 3_600_000) {
        throw new Error("Expected one-hour pretix time slots");
      }
      if (starts.has(start.toUTC().toISO()!)) throw new Error("Duplicate pretix time slot");
      starts.add(start.toUTC().toISO()!);
      const override = subevent.item_price_overrides?.find((entry) => entry.item === config.itemId);
      const priceOre = override?.price ? toOre(override.price) : defaultPrice;
      if (priceOre !== defaultPrice) throw new Error("Studio slots must use one hourly price");
      const slotQuotas = quotas.filter(
        (entry) => entry.subevent === subevent.id && entry.items.includes(config.itemId),
      );
      const sharedQuotas = quotas.filter(
        (entry) => entry.subevent === null && entry.items.includes(config.itemId),
      );
      if (slotQuotas.some((quota) => quota.size !== 1 && quota.size !== 0)) {
        throw new Error("Each studio slot needs capacity one or an administrative block");
      }
      const hasCapacity = [...slotQuotas, ...sharedQuotas].every(
        (quota) => !quota.closed && quota.available === true && (quota.available_number ?? 0) >= 1,
      );
      return {
        id: String(subevent.id),
        start: start.toUTC().toISO()!,
        end: end.toUTC().toISO()!,
        available:
          slotQuotas.length > 0 &&
          hasCapacity &&
          !override?.disabled &&
          !occupied.some(interval => overlaps(start.toISO()!, end.toISO()!, interval.start, interval.end)) &&
          start > DateTime.now(),
        priceOre,
      };
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  return { date: day.toISODate()!, source: "pretix", currency: "DKK", slots, checkedAt: DateTime.utc().toISO()! };
}

export async function getAvailability(date: string): Promise<Availability> {
  const day = parseDay(date);
  const config = readConfig();
  return config ? pretixAvailability(day, config) : demoAvailability(day);
}
