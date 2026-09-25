import { DateTime } from "luxon";
import { z } from "zod";
import { MAX_HOURS } from "./booking";
import { rentalDateSchema } from "./pretix-order-model";

export const managedOrderSchema = z.object({
  code: z.string(), event: z.string(), email: z.string(), locale: z.string().nullable().optional(), status: z.enum(["p", "c"]),
  total: z.string(),
  positions: z.array(z.object({ id: z.number().int(), item: z.number().int(), subevent: z.number().int().nullable(), canceled: z.boolean().optional() })),
  payments: z.array(z.object({ local_id: z.number().int(), state: z.string(), amount: z.string(), provider: z.string() })),
  refunds: z.array(z.object({ local_id: z.number().int(), state: z.string(), amount: z.string() })),
});

export type ManagedOrder = z.infer<typeof managedOrderSchema>;
export type ManagedDate = z.infer<typeof rentalDateSchema>;

export function toOre(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Invalid amount");
  const [whole, fraction = ""] = value.split(".");
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(ore)) throw new Error("Invalid amount");
  return ore;
}

export function managedInterval(order: ManagedOrder, dates: ManagedDate[], itemId: number) {
  if (order.positions.length < 1 || order.positions.length > MAX_HOURS) throw new Error("Unsupported rental positions");
  const byId = new Map(dates.map((date) => [date.id, date]));
  const entries = order.positions.map((position) => {
    if (position.item !== itemId || position.subevent === null) throw new Error("Unsupported rental product");
    if (order.status === "p" && position.canceled) throw new Error("Canceled position in paid rental");
    const date = byId.get(position.subevent);
    if (!date?.date_to) throw new Error("Missing rental date");
    const start = DateTime.fromISO(date.date_from, { setZone: true });
    const end = DateTime.fromISO(date.date_to, { setZone: true });
    if (!start.isValid || !end.isValid || end.toMillis() - start.toMillis() !== 3_600_000) throw new Error("Invalid rental hour");
    return { positionId: position.id, subeventId: position.subevent, start: start.toMillis(), end: end.toMillis() };
  }).sort((a, b) => a.start - b.start);
  if (new Set(entries.map((entry) => entry.subeventId)).size !== entries.length ||
      entries.some((entry, index) => index > 0 && entry.start !== entries[index - 1].end)) {
    throw new Error("Rental hours are not consecutive");
  }
  const start = DateTime.fromMillis(entries[0].start, { zone: "utc" }).toISO()!;
  const end = DateTime.fromMillis(entries.at(-1)!.end, { zone: "utc" }).toISO()!;
  return { start, end, entries };
}

export function refundStatus(order: ManagedOrder): "none" | "pending" | "done" | "failed" {
  if (!order.refunds.length) return "none";
  if (order.refunds.some((refund) => refund.state === "failed")) return "failed";
  if (order.refunds.every((refund) => refund.state === "done")) return "done";
  return "pending";
}
