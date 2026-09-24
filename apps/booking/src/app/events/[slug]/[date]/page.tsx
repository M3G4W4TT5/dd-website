import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventsExperience } from "@/components/EventsExperience";
import { getCatalog } from "@/lib/events";

export const metadata: Metadata = { title: "Events | TTD Studio", description: "Upcoming activities and workshops at TTD Studio in Copenhagen.", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function EventDetailPage({ params, searchParams }: { params: Promise<{ slug: string; date: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ slug, date }, query, catalog] = await Promise.all([params, searchParams, getCatalog()]);
  const selected = catalog.occurrences.find(item => item.slug === slug && String(item.dateId ?? "single") === date);
  if (!selected) notFound();
  return <EventsExperience catalog={catalog} selected={selected} initialLanguage={query.lang === "en" ? "en" : "da"} />;
}
