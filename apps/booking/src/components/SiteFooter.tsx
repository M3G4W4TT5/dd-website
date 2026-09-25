import { ArrowUpRight } from "lucide-react";

type FooterLink = { href: string; label: string };

export function SiteFooter({ links, language = "da" }: { links: FooterLink[]; language?: "da" | "en" }) {
  return <>
    <div className="footer-reveal-space" aria-hidden="true" />
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-identity"><span className="footer-mark">TTD</span></div>
        <div className="footer-details">
          <address>Hos København Danser<br />Nygaardsvej 5a, 2. sal<br />2100 København Ø</address>
          <div className="footer-links">{links.map(({ href, label }) => <a href={href} key={href}>{label}<ArrowUpRight size={17} /></a>)}<a href={`/manage?lang=${language}`}>{language === "da" ? "Administrer booking" : "Manage booking"}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">Administration<ArrowUpRight size={17} /></a><a href={`/privacy?lang=${language}`}>{language === "da" ? "Privatlivspolitik" : "Privacy policy"}<ArrowUpRight size={17} /></a><a href={`/terms?lang=${language}`}>{language === "da" ? "Bookingvilkår" : "Booking terms"}<ArrowUpRight size={17} /></a></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span><a className="footer-credit" href="https://memoryone.eu" aria-label="Designed by Memory(One)"><span>Designed by</span><span className="footer-credit-logo" aria-hidden="true" /></a></div>
    </footer>
  </>;
}
