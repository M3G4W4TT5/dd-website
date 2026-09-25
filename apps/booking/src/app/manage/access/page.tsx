import type { Metadata } from "next";
import { ManageLinkAccess } from "@/components/ManageLinkAccess";
import { SiteFooter } from "@/components/SiteFooter";
import { StaticSiteHeader } from "@/components/StaticSiteHeader";
import { pageLanguage } from "@/lib/language";

export const metadata: Metadata = { title: "Booking access | TTD Studio", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ManageAccessPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const language = await pageLanguage(lang);
  return <>
    <div className="static-page-surface">
    <StaticSiteHeader language={language} languagePath="/manage/access" hideLanguageSwitch hideManageLink />
    <main className="manage-main">
      <span className="section-kicker">TTD STUDIO / {language === "da" ? "DIN BOOKING" : "YOUR BOOKING"}</span>
      <h1>{language === "da" ? "Dine bookinger." : "Your bookings."}</h1>
      <ManageLinkAccess language={language} />
    </main>
    </div>
    <SiteFooter language={language} />
  </>;
}
