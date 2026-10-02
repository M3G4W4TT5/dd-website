import { MAX_HOURS, quoteInterval, type Availability, type Quote } from "./booking";
export type StudioStep = "entry" | "date" | "start" | "end" | "review";
export function studioEndChoices(availability: Availability | null, startId: string | null): Quote[] {
  if (!availability || !startId) return [];
  return Array.from({ length: MAX_HOURS }, (_, index) => quoteInterval(availability, startId, index + 1)).filter((quote): quote is Quote => !!quote);
}
export function studioProgress() {
  return ["date", "start", "end", "review", "details", "payment"];
}

// Boundary offsets that change when extending or shortening an existing range.
export function studioRangeChanges(previousHours: number, nextHours: number) {
  const filling = nextHours > previousHours;
  return Array.from({ length: Math.abs(nextHours - previousHours) }, (_, index) => ({
    offset: filling ? previousHours + index + 1 : previousHours - index,
    filling,
    delay: index * 35,
  }));
}
