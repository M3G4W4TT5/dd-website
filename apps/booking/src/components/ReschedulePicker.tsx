"use client";

import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MAX_HOURS, quoteInterval, STUDIO_ZONE, type Availability } from "@/lib/booking";
export type AvailableInterval = { firstHourIso: string; endIso: string };

type Language = "da" | "en";

const copy = {
  da: {
    previousMonth: "Forrige måned", nextMonth: "Næste måned",
    previousWeek: "Forrige uge", nextWeek: "Næste uge",
    chooseDate: "Vælg dato", available: "ledige starter", full: "Ingen plads",
    loading: "Henter ledige tider…", error: "Ledige tider kunne ikke indlæses. Prøv en anden uge eller kontakt studiet.",
    chooseTime: "Ledige starttider", noTimes: "Ingen sammenhængende ledige timer denne dag. Vælg en anden dato.",
    demo: "Demotider – ingen reel booking ændres.", duration: "Bookingen flyttes med samme varighed:",
    hours: "timer", hour: "time", selected: "Valgt nyt tidsrum",
  },
  en: {
    previousMonth: "Previous month", nextMonth: "Next month",
    previousWeek: "Previous week", nextWeek: "Next week",
    chooseDate: "Choose date", available: "available starts", full: "No space",
    loading: "Loading availability…", error: "Availability could not be loaded. Try another week or contact the studio.",
    chooseTime: "Available start times", noTimes: "No consecutive hours are available on this day. Choose another date.",
    demo: "Demo availability – no real booking is changed.", duration: "The booking keeps the same duration:",
    hours: "hours", hour: "hour", selected: "Selected new interval",
  },
} as const;

function durationHours(firstHourIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(firstHourIso)) / 3_600_000;
}

function availableStarts(availability: Availability | undefined, hours: number, currentStart: string): AvailableInterval[] {
  if (!availability) return [];
  return availability.slots.flatMap((slot) => {
    const quote = quoteInterval(availability, slot.id, hours);
    return quote && Date.parse(quote.start) !== Date.parse(currentStart)
      ? [{ firstHourIso: quote.start, endIso: quote.end }]
      : [];
  });
}

export function ReschedulePicker({ bookingStart, bookingEnd, language, selected, onSelect }: {
  bookingStart: string;
  bookingEnd: string;
  language: Language;
  selected: AvailableInterval | null;
  onSelect: (interval: AvailableInterval | null) => void;
}) {
  const today = DateTime.now().setZone(STUDIO_ZONE).startOf("day");
  const todayDate = today.toISODate()!;
  const maxDate = today.plus({ days: 45 }).toISODate()!;
  const bookedDay = DateTime.fromISO(bookingStart, { setZone: true }).setZone(STUDIO_ZONE).startOf("day");
  const initialDay = bookedDay >= today && bookedDay.toISODate()! <= maxDate ? bookedDay : today;
  const [weekStart, setWeekStart] = useState(initialDay.startOf("week").toISODate()!);
  const [date, setDate] = useState(initialDay.toISODate()!);
  const [days, setDays] = useState<Record<string, Availability | null>>({});
  const [loading, setLoading] = useState(false);
  const t = copy[language];
  const hours = durationHours(bookingStart, bookingEnd);
  const validDuration = Number.isInteger(hours) && hours >= 1 && hours <= MAX_HOURS;
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => DateTime.fromISO(weekStart, { zone: STUDIO_ZONE }).plus({ days: i }).toISODate()!), [weekStart]);

  useEffect(() => {
    const pending = week.filter((day) => day >= todayDate && day <= maxDate && !days[day]);
    if (pending.length === 0) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void Promise.all(pending.map(async (day) => {
      try {
        const response = await fetch(`/api/availability?date=${encodeURIComponent(day)}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Availability request failed");
        const result = (await response.json()) as Availability;
        return [day, result] as const;
      } catch {
        return [day, null] as const;
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      setDays((previous) => ({ ...previous, ...Object.fromEntries(results) }));
      setLoading(false);
    });
    return () => controller.abort();
    // Cache entries are intentionally read only when the visible week changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, todayDate, maxDate]);

  function showWeek(nextStart: string, preferredDate?: string) {
    const bounded = nextStart < todayDate ? today.startOf("week").toISODate()! : nextStart;
    const firstVisible = Array.from({ length: 7 }, (_, i) => DateTime.fromISO(bounded).plus({ days: i }).toISODate()!)
      .find((day) => day >= todayDate && day <= maxDate);
    if (!firstVisible) return;
    setWeekStart(bounded);
    setDate(preferredDate && preferredDate >= todayDate && preferredDate <= maxDate ? preferredDate : firstVisible);
    onSelect(null);
  }

  function shiftWeek(weeks: number) {
    showWeek(DateTime.fromISO(weekStart).plus({ weeks }).toISODate()!);
  }

  function shiftMonth(months: number) {
    const month = DateTime.fromISO(date).startOf("month").plus({ months });
    showWeek(month.startOf("week").toISODate()!, month.toISODate()!);
  }

  const current = days[date];
  const starts = validDuration ? availableStarts(current || undefined, hours, bookingStart) : [];
  const monthLabel = DateTime.fromISO(date).setLocale(language).toFormat("LLLL yyyy");
  const latestWeek = DateTime.fromISO(maxDate).startOf("week").toISODate()!;
  const earliestWeek = today.startOf("week").toISODate()!;
  const previousMonth = DateTime.fromISO(date).startOf("month").minus({ months: 1 });
  const nextMonth = DateTime.fromISO(date).startOf("month").plus({ months: 1 });

  return <div className="reschedule-picker">
    <p className="reschedule-duration">{t.duration} <strong>{hours} {hours === 1 ? t.hour : t.hours}</strong></p>
    <div className="reschedule-navigation" aria-label={t.chooseDate}>
      <div className="reschedule-nav-group">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={previousMonth.endOf("month").toISODate()! < todayDate} aria-label={t.previousMonth}><ChevronLeft size={17} /><ChevronLeft size={17} /></button>
        <button type="button" onClick={() => shiftWeek(-1)} disabled={weekStart <= earliestWeek} aria-label={t.previousWeek}><ChevronLeft size={19} /></button>
      </div>
      <strong>{monthLabel}</strong>
      <div className="reschedule-nav-group">
        <button type="button" onClick={() => shiftWeek(1)} disabled={weekStart >= latestWeek} aria-label={t.nextWeek}><ChevronRight size={19} /></button>
        <button type="button" onClick={() => shiftMonth(1)} disabled={nextMonth.toISODate()! > maxDate} aria-label={t.nextMonth}><ChevronRight size={17} /><ChevronRight size={17} /></button>
      </div>
    </div>
    <div className="reschedule-days" aria-label={t.chooseDate}>
      {week.map((day) => {
        const value = DateTime.fromISO(day).setLocale(language);
        const outOfRange = day < todayDate || day > maxDate;
        const entry = days[day];
        const count = validDuration ? availableStarts(entry || undefined, hours, bookingStart).length : 0;
        const status = outOfRange ? "" : entry === undefined ? "…" : entry === null ? "!" : count ? String(count) : "–";
        const description = entry === undefined ? t.loading : entry === null ? t.error : count ? `${count} ${t.available}` : t.full;
        return <button key={day} type="button" disabled={outOfRange} aria-pressed={date === day} aria-label={`${value.toFormat("cccc d. LLLL")}: ${description}`} className={date === day ? "reschedule-day selected" : "reschedule-day"} onClick={() => { setDate(day); onSelect(null); }}>
          <span>{value.toFormat("ccc")}</span><strong>{value.day}</strong><small>{status}</small>
        </button>;
      })}
    </div>
    <p className="reschedule-key">{language === "da" ? "Tal viser antal ledige starttider · – betyder ingen plads" : "Numbers show available start times · – means no space"}</p>
    <h4>{t.chooseTime} · {DateTime.fromISO(date).setLocale(language).toFormat("d. LLLL")}</h4>
    {loading && current === undefined ? <p role="status">{t.loading}</p> : current === null ? <p className="manage-error" role="alert">{t.error}</p> : starts.length === 0 ? <p>{t.noTimes}</p> : <div className="reschedule-times">
      {starts.map((interval) => <button key={interval.firstHourIso} type="button" aria-pressed={selected?.firstHourIso === interval.firstHourIso} className={selected?.firstHourIso === interval.firstHourIso ? "selected" : ""} onClick={() => onSelect(interval)}>
        {DateTime.fromISO(interval.firstHourIso, { setZone: true }).setZone(STUDIO_ZONE).toFormat("HH:mm")}–{DateTime.fromISO(interval.endIso, { setZone: true }).setZone(STUDIO_ZONE).toFormat("HH:mm")}
      </button>)}
    </div>}
    {current?.source === "demo" && <p className="reschedule-demo">{t.demo}</p>}
  </div>;
}
