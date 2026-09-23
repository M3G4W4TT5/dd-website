import { BookingExperience } from "@/components/BookingExperience";
import { getAvailability, todayInStudio } from "@/lib/availability";
import type { Availability } from "@/lib/booking";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const date = todayInStudio();
  let initialAvailability: Availability | null = null;
  try {
    initialAvailability = await getAvailability(date);
  } catch {
    // An incomplete or unavailable pretix connection must never silently become demo data.
  }
  return <BookingExperience initialDate={date} initialAvailability={initialAvailability} />;
}
