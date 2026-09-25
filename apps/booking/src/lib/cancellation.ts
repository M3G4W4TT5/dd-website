import { DateTime } from "luxon";

export const CANCELLATION_HOURS = 24;

/** Self-service closes at this instant, 24 elapsed hours before the first booked slot. */
export function cancellationDeadline(firstHourIso: string): DateTime | null {
  const start = DateTime.fromISO(firstHourIso, { setZone: true });
  return start.isValid ? start.toUTC().minus({ hours: CANCELLATION_HOURS }) : null;
}

export function canManageBooking(firstHourIso: string, nowIso: string): boolean {
  const deadline = cancellationDeadline(firstHourIso);
  const now = DateTime.fromISO(nowIso, { setZone: true });
  return Boolean(deadline && now.isValid && now.toMillis() < deadline.toMillis());
}
