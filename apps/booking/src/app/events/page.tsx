import type { Metadata } from "next";
import { EventsExperience } from "@/components/EventsExperience";
import { pageLanguage } from "@/lib/language";
import { getCatalog } from "@/lib/events";

export const metadata: Metadata = { title: "Events | TTD Studio", description: "Upcoming activities and workshops at TTD Studio in Copenhagen.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const language = await pageLanguage((await searchParams).lang);
  return <EventsExperience catalog={await getCatalog()} initialLanguage={language} />;
}
