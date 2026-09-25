import { BookingExperience } from "@/components/BookingExperience";
import { getAvailability, todayInStudio } from "@/lib/availability";
import type { Availability } from "@/lib/booking";
import { pageLanguage } from "@/lib/language";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const language = await pageLanguage((await searchParams).lang);
  const date = todayInStudio();
  let initialAvailability: Availability | null = null;
  try {
    initialAvailability = await getAvailability(date);
  } catch {
    // An incomplete or unavailable pretix connection must never silently become demo data.
  }
  return <BookingExperience initialDate={date} initialAvailability={initialAvailability} initialLanguage={language} />;
}
