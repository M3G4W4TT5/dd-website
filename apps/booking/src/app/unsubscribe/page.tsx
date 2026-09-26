import { MarketingUnsubscribe } from "@/components/MarketingUnsubscribe";
import { pageLanguage } from "@/lib/language";

export const metadata = { robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang } = await searchParams;
  const language = await pageLanguage(lang);
  return <main className="unsubscribe-main">
    <div className="marketing-page">
    <span>TTD STUDIO</span>
    <h1>{language === "da" ? "Afmeld e-mails" : "Unsubscribe"}</h1>
    <p>{language === "da" ? "Afmeld e-mails om TTD Studio-tilbud, nye events og rabatter. Bookingmails påvirkes ikke." : "Stop TTD Studio emails about offers, new events and discounts. Booking emails are unaffected."}</p>
    <MarketingUnsubscribe list="booking" language={language} />
    <a href="/">{language === "da" ? "Tilbage til TTD Studio" : "Back to TTD Studio"}</a>
    </div>
    <img className="unsubscribe-flower" src="/branding/flower-greeting-outline.png" width="1536" height="1024" alt="" />
  </main>;
}
