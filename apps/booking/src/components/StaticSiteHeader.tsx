import { HeaderBookingActions } from "./HeaderBookingActions";
import { MobileNavigation } from "./MobileNavigation";
import type { Language } from "@/lib/language";

export function StaticSiteHeader({ language, languagePath, hideLanguageSwitch = false }: {
  language: Language;
  languagePath: string;
  hideLanguageSwitch?: boolean;
}) {
  return <header className="site-header">
    <MobileNavigation language={language} />
    <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
      <a href={`/?lang=${language}`}>Booking</a>
      <a href={`/events?lang=${language}`}>Events</a>
      <a href={`/contact?lang=${language}`}>{language === "da" ? "Kontakt" : "Contact"}</a>
    </nav>
    <a className="brand" href={`/?lang=${language}`} aria-label="TTD Studio — home"><span className="brand-mark" aria-hidden="true" /></a>
    <HeaderBookingActions language={language} languagePath={languagePath} hideLanguageSwitch={hideLanguageSwitch} />
  </header>;
}
