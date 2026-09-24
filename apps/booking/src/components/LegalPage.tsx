import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";

type Language = "da" | "en";

export function LegalPage({ language, kind, children }: { language: Language; kind: "privacy" | "terms"; children: ReactNode }) {
  const title = kind === "privacy"
    ? language === "da" ? "Privatlivspolitik" : "Privacy policy"
    : language === "da" ? "Bookingvilkår" : "Booking terms";
  return <>
    <header className="legal-header"><a className="brand" href="/" aria-label="TTD Studio — forside"><span className="brand-mark">TTD<br />STUDIO</span></a><nav aria-label={language === "da" ? "Navigation" : "Navigation"}><a href="/">{language === "da" ? "Booking" : "Booking"}</a><a href={`/contact?lang=${language}`}>{language === "da" ? "Kontakt" : "Contact"}</a><a href={`/${kind}?lang=${language === "da" ? "en" : "da"}`} lang={language === "da" ? "en" : "da"}>{language === "da" ? "English" : "Dansk"}</a></nav></header>
    <main className="legal-main"><div className="legal-intro"><span className="section-kicker">TTD STUDIO / {language === "da" ? "INFORMATION" : "INFORMATION"}</span><h1>{title}</h1><p>{language === "da" ? "Senest opdateret 25. september 2026" : "Last updated 25 September 2026"}</p></div><div className="legal-content">{children}</div></main>
    <SiteFooter language={language} links={[{ href: "/", label: "Booking" }, { href: `/contact?lang=${language}`, label: language === "da" ? "Kontakt" : "Contact" }]} />
  </>;
}
