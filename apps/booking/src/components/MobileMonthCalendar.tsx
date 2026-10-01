"use client";
import { DateTime } from "luxon";
import { mobileMonthCells } from "@/lib/mobile-calendar";

export function MobileMonthCalendar({language, month, onMonth, date, min, max, onDate, status}: {
  language: "da" | "en"; month: string; onMonth: (month: string) => void;
  date: string; min: string; max: string; onDate: (day: string) => void;
  status?: (day: string) => { text: string; description: string; disabled?: boolean; unavailable?: boolean };
}) {
  const first = DateTime.fromISO(month).startOf("month");
  const previous = first.minus({months: 1});
  const next = first.plus({months: 1});
  return <div className="mobile-month-calendar">
    <div className="journey-date-nav">
      <button type="button" disabled={previous.endOf("month").toISODate()! < min} aria-label={language === "da" ? "Forrige måned" : "Previous month"} onClick={() => onMonth(previous.toISODate()!)}>←</button>
      <strong aria-live="polite">{first.setLocale(language).toFormat("LLLL yyyy")}</strong>
      <button type="button" disabled={next.toISODate()! > max} aria-label={language === "da" ? "Næste måned" : "Next month"} onClick={() => onMonth(next.toISODate()!)}>→</button>
    </div>
    <div className="mobile-month-weekdays" aria-hidden="true">{Array.from({length: 7}, (_, i) => <span key={i}>{first.startOf("week").plus({days: i}).setLocale(language).toFormat("ccc")}</span>)}</div>
    <div className="mobile-month-days" aria-label={language === "da" ? "Vælg dato" : "Select a date"}>
      {mobileMonthCells(month).map((day, i) => {
        if (!day) return <span key={`blank-${i}`} aria-hidden="true" />;
        const value = DateTime.fromISO(day).setLocale(language);
        const outOfRange = day < min || day > max;
        const state = outOfRange ? undefined : status?.(day);
        return <button key={day} type="button" disabled={outOfRange || state?.disabled} className={state?.unavailable ? "is-unavailable" : undefined} aria-pressed={day === date} aria-label={`${value.toFormat("cccc d LLLL yyyy")}${state ? `: ${state.description}` : ""}`} onClick={() => onDate(day)}>
          <strong>{value.day}</strong>{state && <small>{state.text}</small>}
        </button>;
      })}
    </div>
  </div>;
}
