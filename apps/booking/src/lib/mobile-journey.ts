import { MAX_HOURS, quoteInterval, type Availability, type Quote } from "./booking";
export type StudioStep = "entry" | "date" | "start" | "more" | "end" | "review";
export function studioEndChoices(availability: Availability | null, startId: string | null): Quote[] {
  if (!availability || !startId) return [];
  return Array.from({ length: MAX_HOURS - 1 }, (_, index) => quoteInterval(availability, startId, index + 2)).filter((quote): quote is Quote => !!quote);
}
export function studioProgress(more: boolean | null) {
  return ["date", "start", "more", ...(more === true ? ["end"] : []), "review", "details", "payment"];
}
