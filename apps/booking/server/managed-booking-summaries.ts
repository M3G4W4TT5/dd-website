import { MAX_HOURS } from "../src/lib/booking";
import type { ManagedBookingSummary } from "../src/lib/managed-booking-summary";
import { getManagedBooking } from "./pretix-live-management";
import { boundedPretix } from "./pretix-deadline";

export function getManagedBookingSummaries(codes: string[], email: string): Promise<ManagedBookingSummary[]> {
  return boundedPretix(async () => {
    const bookings: ManagedBookingSummary[] = [];
    // Keep provider reads bounded; each booking needs its order and hourly dates.
    for (let index = 0; index < codes.length; index += 4) {
      const batch = await Promise.all(codes.slice(index, index + 4).map(async (code) => {
        const { reference, firstHourIso, endIso } = await getManagedBooking(code, email);
        return { reference, firstHourIso, endIso };
      }));
      bookings.push(...batch);
    }
    return bookings;
  }, 25_000, codes.length * (MAX_HOURS + 1));
}
