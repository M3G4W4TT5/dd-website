"use client";
import { useEffect, useMemo, useState } from "react";
import type { Availability } from "@/lib/booking";
import { mobileMonthCells } from "@/lib/mobile-calendar";

/** Bounded reads for the visible mobile month; unknown/error days are not sold out. */
export function useMonthAvailability(month: string, min: string, max: string, enabled: boolean) {
  const [days, setDays] = useState<Record<string, Availability | null>>({});
  const visible = useMemo(() => mobileMonthCells(month).filter((day): day is string => !!day && day >= min && day <= max), [month, min, max]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const pending = visible.filter(day => !days[day]);
    void (async () => {
      for (let index = 0; index < pending.length && !controller.signal.aborted; index += 4) {
        const results = await Promise.all(pending.slice(index, index + 4).map(async day => {
          try {
            const response = await fetch(`/api/availability?date=${encodeURIComponent(day)}`, {cache: "no-store", signal: controller.signal});
            if (!response.ok) throw new Error("Availability request failed");
            return [day, await response.json() as Availability] as const;
          } catch { return [day, null] as const; }
        }));
        if (controller.signal.aborted) return;
        setDays(previous => ({...previous, ...Object.fromEntries(results)}));
      }
    })();
    return () => controller.abort();
    // Cache is read when the month opens/changes, not after each completed batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, enabled]);
  return days;
}
