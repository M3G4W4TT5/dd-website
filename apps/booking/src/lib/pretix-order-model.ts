import { DateTime } from "luxon";
import { z } from "zod";
import { MAX_HOURS } from "./booking";

export const rentalPositionSchema = z.object({
  item: z.number().int(),
  subevent: z.number().int().nullable(),
  canceled: z.boolean().optional(),
});

export const rentalOrderSchema = z.object({
  code: z.string(),
  event: z.string(),
  secret: z.string(),
  status: z.string(),
  positions: z.array(rentalPositionSchema),
});

export const rentalDateSchema = z.object({
  id: z.number().int(),
  date_from: z.string(),
  date_to: z.string().nullable(),
});

export type RentalOrder = z.infer<typeof rentalOrderSchema>;
export type RentalDate = z.infer<typeof rentalDateSchema>;

export function firstBookedHour(order: RentalOrder, dates: RentalDate[], itemId: number): string | null {
  if (order.status !== "p" || order.positions.length === 0 || order.positions.length > MAX_HOURS) return null;
  const byId = new Map(dates.map((date) => [date.id, date]));
  const starts: number[] = [];
  const unique = new Set<number>();
  for (const position of order.positions) {
    if (position.canceled || position.item !== itemId || position.subevent === null || unique.has(position.subevent)) return null;
    unique.add(position.subevent);
    const date = byId.get(position.subevent);
    if (!date?.date_to) return null;
    const start = DateTime.fromISO(date.date_from, { setZone: true });
    const end = DateTime.fromISO(date.date_to, { setZone: true });
    if (!start.isValid || !end.isValid || end.toMillis() - start.toMillis() !== 3_600_000) return null;
    starts.push(start.toMillis());
  }
  starts.sort((a, b) => a - b);
  if (starts.some((start, index) => index > 0 && start - starts[index - 1] !== 3_600_000)) return null;
  return DateTime.fromMillis(starts[0], { zone: "utc" }).toISO();
}
