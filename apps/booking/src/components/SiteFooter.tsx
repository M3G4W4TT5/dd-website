import { ArrowUpRight } from "lucide-react";

export function SiteFooter({ language = "en" }: { language?: "da" | "en" }) {
  return <>
    <div className="footer-reveal-space" aria-hidden="true" />
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-identity"><span className="footer-mark">TTD</span></div>
        <div className="footer-details">
          <address>
            København Danser<br />Nygaardsvej 5a, 2. sal<br />2100 København Ø
            <a className="footer-map-link" href="https://www.google.com/maps/search/?api=1&query=K%C3%B8benhavn%20Danser%2C%20Nygaardsvej%205a%2C%202.%20sal%2C%202100%20K%C3%B8benhavn%20%C3%98" target="_blank" rel="noopener noreferrer">
              {language === "da" ? "Åbn i Google Maps" : "Open in Google Maps"}<ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </address>
          <div className="footer-links"><a href={`/privacy?lang=${language}`}>{language === "da" ? "Privatlivspolitik" : "Privacy policy"}<ArrowUpRight size={17} /></a><a href={`/terms?lang=${language}`}>{language === "da" ? "Bookingvilkår" : "Booking terms"}<ArrowUpRight size={17} /></a><a href={`/unsubscribe?lang=${language}`}>{language === "da" ? "Afmeld e-mails" : "Unsubscribe from emails"}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">Administration<ArrowUpRight size={17} /></a></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span><span className="footer-credit"><span>Designed by</span><span className="footer-credit-logo" role="img" aria-label="Memory(One)" /></span></div>
    </footer>
  </>;
}
