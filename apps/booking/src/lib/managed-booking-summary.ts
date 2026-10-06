import { DateTime } from "luxon";
import type { ManagedBooking } from "@dd/contracts";
import { STUDIO_ZONE } from "./booking";

export type ManagedBookingSummary = Pick<ManagedBooking, "reference" | "firstHourIso" | "endIso">;

export function bookingSummaryLabels(booking: ManagedBookingSummary, language: "da" | "en") {
  const start = DateTime.fromISO(booking.firstHourIso).setZone(STUDIO_ZONE).setLocale(language);
  const end = DateTime.fromISO(booking.endIso);
  const hours = end.diff(start, "hours").hours;
  const da = language === "da";
  return {
    date: `${da ? "Dato" : "Date"}: ${start.toFormat("d LLLL yyyy")}`,
    time: `${da ? "Tid" : "Time"}: ${start.toFormat("HH:mm")}`,
    duration: `${da ? "Varighed" : "Duration"}: ${hours} ${da ? (hours === 1 ? "time" : "timer") : (hours === 1 ? "hour" : "hours")}`,
  };
}
