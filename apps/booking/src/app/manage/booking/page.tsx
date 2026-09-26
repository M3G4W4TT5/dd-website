import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageBookingLive } from "@/components/ManageBookingLive";
import { SiteFooter } from "@/components/SiteFooter";
import { StaticSiteHeader } from "@/components/StaticSiteHeader";
import { pageLanguage } from "@/lib/language";
import { authorizedManageEmail } from "@/lib/manage-session";
import { getManagedBooking, selfServiceEnabled } from "@/lib/pretix-live-management";

export const metadata: Metadata = { title: "Manage booking | TTD Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ManagedBookingPage({ searchParams }: { searchParams: Promise<{ lang?: string; code?: string }> }) {
  const { lang, code } = await searchParams;
  const language = await pageLanguage(lang);
  const email = code ? await authorizedManageEmail(code) : null;
  if (!code || !email) redirect(`/manage?lang=${language}`);
  let booking;
  try { booking = await getManagedBooking(code, email); }
  catch { redirect(`/manage?lang=${language}`); }
  return <>
    <div className="static-page-surface">
      <StaticSiteHeader language={language} languagePath={`/manage/booking?code=${encodeURIComponent(code)}`} />
      <main className="manage-main"><ManageBookingLive language={language} initialBooking={booking} serverNowIso={new Date().toISOString()} enabled={selfServiceEnabled()} /></main>
    </div>
    <SiteFooter language={language} />
  </>;
}
