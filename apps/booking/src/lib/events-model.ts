import { DateTime } from "luxon";
import { z } from "zod";

export const ZONE = "Europe/Copenhagen";
const translated = z.union([z.string(), z.record(z.string(), z.string())]).nullable().optional();
export const eventSchema = z.object({
  slug: z.string(), name: translated, live: z.boolean(), testmode: z.boolean().optional(),
  is_public: z.boolean(), has_subevents: z.boolean(), public_url: z.string().nullable().optional(), date_from: z.string(),
  date_to: z.string().nullable(), location: translated, presale_start: z.string().nullable().optional(),
  presale_end: z.string().nullable().optional(), meta_data: z.record(z.string(), z.unknown()).optional(),
});
export const dateSchema = z.object({
  id: z.number().int(), name: translated, active: z.boolean(), is_public: z.boolean(),
  date_from: z.string(), date_to: z.string().nullable(), location: translated,
  frontpage_text: translated, item_price_overrides: z.array(z.object({ item: z.number(), disabled: z.boolean(), price: z.string().nullable() })).optional(), presale_start: z.string().nullable().optional(),
  presale_end: z.string().nullable().optional(), meta_data: z.record(z.string(), z.unknown()).optional(),
});
export const quotaSchema = z.object({
  subevent: z.number().nullable(), items: z.array(z.number()), closed: z.boolean(),
  available: z.boolean().optional(), available_number: z.number().nullable().optional(),
});
export const itemSchema = z.object({
  id: z.number(), name: translated, description: translated, active: z.boolean(), default_price: z.string(),
  available_from: z.string().nullable().optional(), available_until: z.string().nullable().optional(),
});
export type RawEvent = z.infer<typeof eventSchema>;
export type RawDate = z.infer<typeof dateSchema>;
export type RawQuota = z.infer<typeof quotaSchema>;
export type RawItem = z.infer<typeof itemSchema>;
export type Language = "da" | "en";
export type Occurrence = {
  key: string; slug: string; dateId: number | null; title: string; titleEn: string;
  description: string; descriptionEn: string; image: string | null; shopUrl: string | null; location: string;
  locationEn: string; start: string; end: string; status: "available" | "sold-out" | "not-on-sale" | "test" | "room-conflict";
  roomVerified: boolean; tickets: { name: string; nameEn: string; price: string; remaining: number | null }[];
};
export function localized(value: z.infer<typeof translated>, language: Language): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value[language] || value.en || value.da || Object.values(value)[0] || "";
}
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(bStart) < Date.parse(aEnd);
}
export function occupiesRoom(event: RawEvent, date: RawDate | null, start: string, end: string): boolean {
  const cancelled = date?.meta_data?.ttd_cancelled ?? event.meta_data?.ttd_cancelled;
  if (cancelled === true || cancelled === "true") return false;
  const from = date?.date_from ?? event.date_from;
  const to = date?.date_to ?? event.date_to;
  return Boolean(to && overlaps(from, to, start, end));
}
export function checkoutPath(organizer: string, occurrence: Occurrence): string {
  const base = `/${encodeURIComponent(organizer)}/${encodeURIComponent(occurrence.slug)}/`;
  return occurrence.dateId === null ? base : `${base}?subevent=${occurrence.dateId}`;
}
function validHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return url.protocol === "https:" ? url.href : null; } catch { return null; }
}
function validImage(meta: Record<string, unknown> | undefined): string | null {
  return validHttpsUrl(meta?.ttd_image_url);
}
export function normalizeEvent(event: RawEvent, date: RawDate | null, items: RawItem[], quotas: RawQuota[], now: DateTime = DateTime.utc(), includeDraftTestEvent = false): Occurrence | null {
  if (!(event.live || (includeDraftTestEvent && event.testmode)) || !event.is_public || (date && (!date.active || !date.is_public)) ||
    (date?.meta_data?.ttd_cancelled ?? event.meta_data?.ttd_cancelled) === true || (date?.meta_data?.ttd_cancelled ?? event.meta_data?.ttd_cancelled) === "true") return null;
  const start = date?.date_from ?? event.date_from;
  const end = date?.date_to ?? event.date_to;
  if (!end || !DateTime.fromISO(start).isValid || !DateTime.fromISO(end).isValid || Date.parse(end) <= now.toMillis() || Date.parse(end) <= Date.parse(start)) return null;
  const eligible = items.filter(item => item.active && !date?.item_price_overrides?.some(override => override.item === item.id && override.disabled) &&
    (!item.available_from || Date.parse(item.available_from) <= now.toMillis()) &&
    (!item.available_until || Date.parse(item.available_until) > now.toMillis()) &&
    quotas.some(q => (q.subevent === null || q.subevent === date?.id) && q.items.includes(item.id)));
  const hasStock = eligible.some(item => quotas.filter(q => (q.subevent === null || q.subevent === date?.id) && q.items.includes(item.id))
    .every(q => !q.closed && q.available === true && (q.available_number === null || (q.available_number ?? 0) > 0)));
  const saleOpen = (!event.presale_start || Date.parse(event.presale_start) <= now.toMillis()) &&
    (!event.presale_end || Date.parse(event.presale_end) > now.toMillis()) &&
    (!date?.presale_start || Date.parse(date.presale_start) <= now.toMillis()) &&
    (!date?.presale_end || Date.parse(date.presale_end) > now.toMillis());
  const description = date?.frontpage_text;
  const metaDescriptionDa = event.meta_data?.ttd_description_da;
  const metaDescriptionEn = event.meta_data?.ttd_description_en;
  return {
    key: `${event.slug}:${date?.id ?? "single"}`, slug: event.slug, dateId: date?.id ?? null,
    title: localized(date?.name || event.name, "da") || localized(event.name, "da"),
    titleEn: localized(date?.name || event.name, "en") || localized(event.name, "en"),
    description: localized(description, "da") || (typeof metaDescriptionDa === "string" ? metaDescriptionDa : "") || localized(eligible[0]?.description, "da"),
    descriptionEn: localized(description, "en") || (typeof metaDescriptionEn === "string" ? metaDescriptionEn : "") || localized(eligible[0]?.description, "en"),
    image: validImage(date?.meta_data) || validImage(event.meta_data),
    shopUrl: validHttpsUrl(event.public_url),
    roomVerified: (date ? date.meta_data?.ttd_room_verified : event.meta_data?.ttd_room_verified) === true ||
      (date ? date.meta_data?.ttd_room_verified : event.meta_data?.ttd_room_verified) === "true",
    location: localized(date?.location || event.location, "da"),
    locationEn: localized(date?.location || event.location, "en"), start, end,
    status: event.testmode ? "test" : !saleOpen || eligible.length === 0 ? "not-on-sale" : hasStock ? "available" : "sold-out",
    tickets: eligible.map(item => {
      const limits = quotas.filter(q => (q.subevent === null || q.subevent === date?.id) && q.items.includes(item.id))
        .map(q => q.available_number).filter((value): value is number => typeof value === "number");
      return {
        name: localized(item.name, "da"), nameEn: localized(item.name, "en"),
        price: date?.item_price_overrides?.find(override => override.item === item.id)?.price || item.default_price,
        remaining: limits.length ? Math.min(...limits) : null,
      };
    }),
  };
}
