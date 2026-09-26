"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { StaticSiteHeader } from "./StaticSiteHeader";
import { SiteFooter } from "./SiteFooter";
import type { Language } from "@/lib/language";

export function NotFoundExperience({ initialLanguage }: { initialLanguage: Language }) {
  const pathname = usePathname();
  const [language, setLanguage] = useState(initialLanguage);
  useEffect(() => {
    const lang = new URLSearchParams(window.location.search).get("lang");
    if (lang === "da" || lang === "en") setLanguage(lang);
  }, [pathname]);

  return <>
    <div className="static-page-surface">
      <StaticSiteHeader language={language} languagePath={pathname} />
      <main className="not-found-main">
        <div className="not-found-copy">
          <h1>404<span className="sr-only"> — Page not found</span></h1>
          <p>Sorry! I lost this page.<br />Here are some flowers instead.</p>
          <a className="not-found-return" href={`/?lang=${language}#booking`}>Return to booking</a>
        </div>
        <img className="not-found-flowers" src="/branding/flowers-yellow.svg" width="736" height="736" alt="" />
      </main>
    </div>
    <SiteFooter language={language} />
  </>;
}
