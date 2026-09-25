type Language = "da" | "en";

export function MobileNavigation({ language, currentPage }: { language: Language; currentPage?: "events" | "contact" }) {
  return (
    <details className="mobile-nav">
      <summary>
        <span aria-hidden="true" className="mobile-nav-icon"><span /><span /><span /></span>
        <span>Menu</span>
      </summary>
      <nav aria-label={language === "da" ? "Mobilnavigation" : "Mobile navigation"}>
        <a href={`/?lang=${language}#booking`}>Booking</a>
        <a href={`/events?lang=${language}`} aria-current={currentPage === "events" ? "page" : undefined}>Events</a>
        <a href={`/contact?lang=${language}`} aria-current={currentPage === "contact" ? "page" : undefined}>{language === "da" ? "Kontakt" : "Contact"}</a>
      </nav>
    </details>
  );
}
