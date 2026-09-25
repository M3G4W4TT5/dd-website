import { HeaderBookingActions } from "./HeaderBookingActions";
import { MobileNavigation } from "./MobileNavigation";
import type { Language } from "@/lib/language";

export function StaticSiteHeader({ language, languagePath, hideManageLink = false }: {
  language: Language;
  languagePath: string;
  hideManageLink?: boolean;
}) {
  return <header className="site-header">
    <MobileNavigation language={language} />
    <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
      <a href={`/?lang=${language}#booking`}>Booking</a>
      <a href={`/events?lang=${language}`}>Events</a>
      <a href={`/contact?lang=${language}`}>{language === "da" ? "Kontakt" : "Contact"}</a>
    </nav>
    <a className="brand" href={`/?lang=${language}`} aria-label="TTD Studio — home"><span className="brand-mark">TTD<br />STUDIO</span></a>
    <HeaderBookingActions language={language} languagePath={languagePath} hideManageLink={hideManageLink} />
  </header>;
}
