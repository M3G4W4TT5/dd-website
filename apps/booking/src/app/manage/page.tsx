import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { StaticSiteHeader } from "@/components/StaticSiteHeader";
import { ManageLinkRequest } from "@/components/ManageLinkRequest";
import { pageLanguage } from "@/lib/language";

export const metadata: Metadata = { title: "Manage booking | TTD Studio", robots: { index: false, follow: false } };

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const language = await pageLanguage((await searchParams).lang);
  const da = language === "da";
  return <>
    <div className="static-page-surface">
    <StaticSiteHeader language={language} languagePath="/manage" hideManageLink />
    <main className="manage-main">
      <span className="section-kicker">TTD STUDIO / {da ? "DIN BOOKING" : "YOUR BOOKING"}</span>
      <h1>{da ? "Administrer din booking." : "Manage your booking."}</h1>
      <p className="manage-intro">{da ? "Find linket i din bookingbekræftelse, eller få et nyt link sendt til den e-mailadresse, du brugte ved booking." : "Find the link in your booking confirmation, or have a new one sent to the email address you used when booking."}</p>
      <div className="manage-help-grid">
        <section><span>01</span><h2>{da ? "Find din bookingmail" : "Find your confirmation email"}</h2><p>{da ? "Find bookingbekræftelsen fra TTD Studio, og klik på linket i mailen." : "Find your TTD Studio booking confirmation and click the link in the email."}</p></section>
        <section><span>02</span><h2>{da ? "Har du mistet linket?" : "Lost your link?"}</h2><p>{da ? "Indtast din e-mailadresse, og få et nyt link." : "Enter your email address to get a new link."}</p><ManageLinkRequest language={language} /></section>
      </div>
      <p className="manage-policy">{da ? "Når der er mere end 24 timer til den første bookede time, kan du ændre til et andet ledigt tidsrum. Du kan også afbestille din booking gratis. Læs" : "When more than 24 hours remain before the first booked hour, you can change to another available interval. You can also cancel your booking free of charge. Read the"} <a href={`/terms?lang=${language}`}>{da ? "bookingvilkårene" : "booking terms"}</a>.</p>
      {process.env.NODE_ENV === "development" && <p className="manage-demo-link"><a href={`/manage/preview?lang=${language}`}>{da ? "Se lokal demo af bookingadministration" : "View local booking management demo"}</a></p>}
    </main>
    </div>
    <SiteFooter language={language} />
  </>;
}
