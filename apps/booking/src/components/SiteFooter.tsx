"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight } from "lucide-react";

export function SiteFooter({ language = "en" }: { language?: "da" | "en" }) {
  const footerRef = useRef<HTMLElement>(null);
  const revealSpaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const footer = footerRef.current;
    const revealSpace = revealSpaceRef.current;
    if (!footer || !revealSpace) return;

    let frame = 0;
    const updateGradient = () => {
      frame = 0;
      const bounds = revealSpace.getBoundingClientRect();
      const progress = Math.min(Math.max((window.innerHeight - bounds.top) / bounds.height, 0), 1);
      footer.style.setProperty("--footer-progress", progress.toFixed(3));
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateGradient);
    };
    const measureFooter = () => {
      revealSpace.style.height = `${footer.offsetHeight}px`;
      scheduleUpdate();
    };
    const resizeObserver = new ResizeObserver(measureFooter);
    resizeObserver.observe(footer);
    measureFooter();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", measureFooter);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", measureFooter);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <>
    <div ref={revealSpaceRef} className="footer-reveal-space" aria-hidden="true" />
    <footer ref={footerRef} className="site-footer">
      <div className="footer-main">
        <div className="footer-identity"><span className="footer-mark">TTD</span></div>
        <div className="footer-details">
          <address>
            København Danser<br />Nygaardsvej 5a, 2. sal<br />2100 København Ø
            <a className="footer-map-link" href="https://www.google.com/maps/search/?api=1&query=K%C3%B8benhavn%20Danser%2C%20Nygaardsvej%205a%2C%202.%20sal%2C%202100%20K%C3%B8benhavn%20%C3%98" target="_blank" rel="noopener noreferrer">
              {language === "da" ? "Åbn i Google Maps" : "Open in Google Maps"}<ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </address>
          <div className="footer-links"><a href={`/privacy?lang=${language}`}>{language === "da" ? "Privatlivspolitik" : "Privacy policy"}<ArrowUpRight size={17} /></a><a href={`/terms?lang=${language}`}>{language === "da" ? "Bookingvilkår" : "Booking terms"}<ArrowUpRight size={17} /></a><a href={`/manage?lang=${language}`}>{language === "da" ? "Administrer din booking" : "Manage your booking"}<ArrowUpRight size={17} /></a><a href={`/unsubscribe?lang=${language}`}>{language === "da" ? "Afmeld e-mails" : "Unsubscribe from emails"}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">Administration<ArrowUpRight size={17} /></a></div>
        </div>
      </div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span><a className="footer-credit" href="https://memoryone.eu/"><span>Designed by</span><span className="footer-credit-logo" role="img" aria-label="Memory(One)" /></a></div>
    </footer>
  </>;
}
