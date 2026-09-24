import type { Metadata } from "next";
import { ContactExperience } from "@/components/ContactExperience";

export const metadata: Metadata = {
  title: "Contact | TTD Studio",
  description: "Contact TTD Studio about bookings, events, and other questions.",
  robots: { index: false, follow: false },
};

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const language = (await searchParams).lang === "en" ? "en" : "da";
  return <ContactExperience initialLanguage={language} />;
}
