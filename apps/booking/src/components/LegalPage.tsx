import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { StaticSiteHeader } from "./StaticSiteHeader";

type Language = "da" | "en";

export function LegalPage({ language, kind, children }: { language: Language; kind: "privacy" | "terms"; children: ReactNode }) {
  const title = kind === "privacy"
    ? language === "da" ? "Privatlivspolitik" : "Privacy policy"
    : language === "da" ? "Bookingvilkår" : "Booking terms";
  return <>
    <div className="static-page-surface">
      <StaticSiteHeader language={language} languagePath={`/${kind}`} />
      <main className="legal-main"><div className="legal-intro"><span className="section-kicker">TTD STUDIO / {language === "da" ? "INFORMATION" : "INFORMATION"}</span><h1>{title}</h1><p>{language === "da" ? "Senest opdateret 25. september 2026" : "Last updated 25 September 2026"}</p></div><div className="legal-content">{children}</div></main>
    </div>
    <SiteFooter language={language} />
  </>;
}
