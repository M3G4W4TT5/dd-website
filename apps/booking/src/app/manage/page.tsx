import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { StaticSiteHeader } from "@/components/StaticSiteHeader";
import { pageLanguage } from "@/lib/language";

export const metadata: Metadata = { title: "Manage booking | TTD Studio", robots: { index: false, follow: false } };

export default async function ManagePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const language = await pageLanguage((await searchParams).lang);
  const da = language === "da";
  return <>
    <StaticSiteHeader language={language} languagePath="/manage" hideManageLink />
    <main className="manage-main">
      <span className="section-kicker">TTD STUDIO / {da ? "DIN BOOKING" : "YOUR BOOKING"}</span>
      <h1>{da ? "Administrer din booking." : "Manage your booking."}</h1>
      <p className="manage-intro">{da ? "Åbn det personlige link i din bookingbekræftelse for at se din booking, ændre den eller afbestille. Linket giver adgang til dine oplysninger, så del det ikke med andre." : "Open the personal link in your booking confirmation to view, change, or cancel your booking. The link gives access to your details, so do not share it."}</p>
      <div className="manage-help-grid">
        <section><span>01</span><h2>{da ? "Find din bookingmail" : "Find your booking email"}</h2><p>{da ? "Søg efter TTD Studio og din bookingreference i indbakken. Tjek også spam, hvis du ikke kan finde mailen." : "Search your inbox for TTD Studio and your booking reference. Check spam if you cannot find the email."}</p></section>
        <section><span>02</span><h2>{da ? "Har du mistet linket?" : "Lost the link?"}</h2><p>{da ? "Skriv til studiet fra den e-mailadresse, du brugte ved booking. Vi hjælper dig med at få et nyt sikkert link." : "Contact the studio from the email address used for booking. We will help you get a new secure link."}</p><a className="text-link" href={`/contact?lang=${language}`}>{da ? "Kontakt studiet" : "Contact the studio"}</a></section>
      </div>
      <p className="manage-policy">{da ? "Når der er mere end 24 timer til den første bookede time, kan du ændre til et andet ledigt tidsrum. Du kan også afbestille din booking gratis. Læs" : "When more than 24 hours remain before the first booked hour, you can change to another available interval. You can also cancel your booking free of charge. Read the"} <a href={`/terms?lang=${language}`}>{da ? "bookingvilkårene" : "booking terms"}</a>.</p>
      {process.env.NODE_ENV === "development" && <p className="manage-demo-link"><a href={`/manage/preview?lang=${language}`}>{da ? "Se lokal demo af bookingadministration" : "View local booking management demo"}</a></p>}
    </main>
    <SiteFooter language={language} />
  </>;
}
