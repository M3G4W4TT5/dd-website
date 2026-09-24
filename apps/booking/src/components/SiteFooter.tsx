import { ArrowUpRight } from "lucide-react";

type FooterLink = { href: string; label: string };

export function SiteFooter({ links }: { links: FooterLink[] }) {
  return <>
    <div className="footer-reveal-space" aria-hidden="true" />
    <footer className="site-footer">
      <div className="footer-main">
        <div><span className="footer-mark">TTD</span><p>Time to Dance!</p></div>
        <div className="footer-links">{links.map(({ href, label }) => <a href={href} key={href}>{label}<ArrowUpRight size={17} /></a>)}</div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span></div>
    </footer>
  </>;
}
