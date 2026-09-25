import { ArrowUpRight } from "lucide-react";

export function SiteFooter({ language = "da" }: { language?: "da" | "en" }) {
  return <>
    <div className="footer-reveal-space" aria-hidden="true" />
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-identity"><span className="footer-mark">TTD</span></div>
        <div className="footer-details">
          <address>Hos København Danser<br />Nygaardsvej 5a, 2. sal<br />2100 København Ø</address>
          <div className="footer-links"><a href={`/privacy?lang=${language}`}>{language === "da" ? "Privatlivspolitik" : "Privacy policy"}<ArrowUpRight size={17} /></a><a href={`/terms?lang=${language}`}>{language === "da" ? "Bookingvilkår" : "Booking terms"}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">Administration<ArrowUpRight size={17} /></a></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span><span className="footer-credit"><span>Designed by</span><span className="footer-credit-logo" role="img" aria-label="Memory(One)" /></span></div>
    </footer>
  </>;
}
