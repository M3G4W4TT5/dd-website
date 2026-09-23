export const STUDIO_ZONE = "Europe/Copenhagen";
export const MAX_HOURS = 8;

export type Slot = {
  id: string;
  start: string;
  end: string;
  available: boolean;
  priceOre: number;
};

export type Availability = {
  date: string;
  source: "demo" | "pretix";
  currency: "DKK";
  slots: Slot[];
  checkedAt: string;
};

export type Quote = {
  slotIds: string[];
  start: string;
  end: string;
  hours: number;
  totalOre: number;
  currency: "DKK";
};

// This is an indicative selection only. It never holds inventory or creates an order.
export function quoteInterval(
  availability: Availability,
  startId: string,
  hours: number,
): Quote | null {
  if (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS) return null;

  const ordered = [...availability.slots].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start),
  );
  const index = ordered.findIndex((slot) => slot.id === startId);
  if (index < 0) return null;

  const selected = ordered.slice(index, index + hours);
  if (selected.length !== hours || selected.some((slot) => !slot.available)) return null;

  for (let i = 0; i < selected.length; i += 1) {
    const slot = selected[i];
    if (Date.parse(slot.end) - Date.parse(slot.start) !== 3_600_000) return null;
    if (i > 0 && selected[i - 1].end !== slot.start) return null;
  }

  return {
    slotIds: selected.map((slot) => slot.id),
    start: selected[0].start,
    end: selected[selected.length - 1].end,
    hours,
    totalOre: selected.reduce((sum, slot) => sum + slot.priceOre, 0),
    currency: availability.currency,
  };
}
