"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect } from "react";

type Language = "da" | "en";

export function HeaderBookingActions({
  language,
  onLanguageChange,
  languagePath,
  hideLanguageSwitch = false,
  hideManageLink = false,
}: {
  language: Language;
  onLanguageChange?: (language: Language) => void;
  languagePath?: string;
  hideLanguageSwitch?: boolean;
  hideManageLink?: boolean;
}) {
  useEffect(() => {
    document.documentElement.lang = language;
    document.cookie = `ttd-language=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem("ttd-language", language);
  }, [language]);

  function changeLanguage(next: Language) {
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
    document.cookie = `ttd-language=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    localStorage.setItem("ttd-language", next);
    onLanguageChange?.(next);
  }

  const languageSeparator = languagePath?.includes("?") ? "&" : "?";

  return <div className="header-actions booking-header-actions">
    {hideLanguageSwitch ? null : onLanguageChange ? <div className="lang-switch" aria-label="Language">
      <button type="button" className={language === "en" ? "active" : ""} onClick={() => changeLanguage("en")} aria-pressed={language === "en"}>EN</button>
      <span>/</span>
      <button type="button" className={language === "da" ? "active" : ""} onClick={() => changeLanguage("da")} aria-pressed={language === "da"}>DA</button>
    </div> : <nav className="manage-language-switch" aria-label={language === "da" ? "Sprog" : "Language"}>
      <a href={`${languagePath}${languageSeparator}lang=en`} lang="en" aria-current={language === "en" ? "page" : undefined}>EN</a>
      <span aria-hidden="true">/</span>
      <a href={`${languagePath}${languageSeparator}lang=da`} lang="da" aria-current={language === "da" ? "page" : undefined}>DA</a>
    </nav>}
    {!hideManageLink && <a className="header-manage-link" href={`/manage?lang=${language}`} aria-label={language === "da" ? "Administrer din booking" : "Manage your booking"}>
      <span className="desktop-label">{language === "da" ? "Administrer din booking" : "Manage your booking"}</span>
      <span className="mobile-label" aria-hidden="true">{language === "da" ? "Administrer" : "Manage"}</span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>}
  </div>;
}
