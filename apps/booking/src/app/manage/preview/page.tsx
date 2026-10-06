import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ManageBookingPreview } from "@/components/ManageBookingPreview";
import { signPreviewBooking } from "@/lib/manage-preview-token";
import { pageLanguage } from "@/lib/language";
import { ManageBookingLinks } from "@/components/ManageBookingLinks";
import { StaticSiteHeader } from "@/components/StaticSiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export default async function ManageBookingPreviewPage({ searchParams }: { searchParams: Promise<{ lang?: string; view?: string; hours?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const key = process.env.MANAGE_PREVIEW_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error("MANAGE_PREVIEW_SIGNING_KEY is required for the local preview");
  const { lang, view, hours: requestedHours } = await searchParams;
  const language = await pageLanguage(lang);
  const hours = requestedHours === "14" ? 14 : 2;
  const first = DateTime.now().setZone("Europe/Copenhagen").plus({ days: 7 }).startOf("day").plus({ hours: hours === 14 ? 8 : 10 });
  const booking = {
    reference: "DEMO-BOOKING", firstHourIso: first.toISO()!, endIso: first.plus({ hours }).toISO()!,
    paidOre: (hours === 14 ? 12 : hours) * 35_000, status: "paid" as const, refund: "none" as const,
  };
  if (view === "access") {
    const second = first.plus({ days: 1 }).set({ hour: 16 });
    return <>
      <div className="static-page-surface">
        <StaticSiteHeader language={language} languagePath="/manage/preview" hideLanguageSwitch />
        <main className="manage-main">
          <span className="section-kicker">TTD STUDIO / {language === "da" ? "DIN BOOKING" : "YOUR BOOKING"}</span>
          <h1>{language === "da" ? "Dine bookinger." : "Your bookings."}</h1>
          <ManageBookingLinks language={language} bookings={[booking, {
            reference: "DEMO-SECOND", firstHourIso: second.toISO()!, endIso: second.plus({ hours: 3 }).toISO()!,
          }]} />
        </main>
      </div>
      <SiteFooter language={language} />
    </>;
  }
  const token = signPreviewBooking({
    firstHourIso: booking.firstHourIso, endIso: booking.endIso, expiresAt: Date.now() + 3_600_000,
  }, key);
  return <ManageBookingPreview language={language} initialBooking={booking} initialToken={token} serverNowIso={new Date().toISOString()} />;
}
