import { ArrowUpRight } from "lucide-react";

type FooterLink = { href: string; label: string };

export function SiteFooter({ links }: { links: FooterLink[] }) {
  return <>
    <div className="footer-reveal-space" aria-hidden="true" />
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-identity"><span className="footer-mark">TTD</span><p>Time to Dance!</p></div>
        <div className="footer-details">
          <address>Hos København Danser<br />Nygaardsvej 5a, 2. sal<br />2100 København Ø</address>
          <div className="footer-links">{links.map(({ href, label }) => <a href={href} key={href}>{label}<ArrowUpRight size={17} /></a>)}</div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span><a className="footer-credit" href="https://memoryone.eu" aria-label="Designed by Memory(One)"><span>Designed by</span><img src="/branding/memory-one-full-colour-light-cropped.webp" alt="Memory(One)" width="1534" height="320" /></a></div>
    </footer>
  </>;
}
