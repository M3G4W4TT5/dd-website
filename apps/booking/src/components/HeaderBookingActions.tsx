"use client";

import { ArrowUpRight } from "lucide-react";

type Language = "da" | "en";

export function HeaderBookingActions({
  language,
  onLanguageChange,
  languagePath,
  hideManageLink = false,
}: {
  language: Language;
  onLanguageChange?: (language: Language) => void;
  languagePath?: string;
  hideManageLink?: boolean;
}) {
  return <div className="header-actions booking-header-actions">
    {onLanguageChange ? <div className="lang-switch" aria-label="Language">
      <button type="button" className={language === "da" ? "active" : ""} onClick={() => onLanguageChange("da")} aria-pressed={language === "da"}>DA</button>
      <span>/</span>
      <button type="button" className={language === "en" ? "active" : ""} onClick={() => onLanguageChange("en")} aria-pressed={language === "en"}>EN</button>
    </div> : <nav className="manage-language-switch" aria-label={language === "da" ? "Sprog" : "Language"}>
      <a href={`${languagePath}?lang=da`} lang="da" aria-current={language === "da" ? "page" : undefined}>DA</a>
      <span aria-hidden="true">/</span>
      <a href={`${languagePath}?lang=en`} lang="en" aria-current={language === "en" ? "page" : undefined}>EN</a>
    </nav>}
    {!hideManageLink && <a className="header-manage-link" href={`/manage?lang=${language}`} aria-label={language === "da" ? "Administrer din booking" : "Manage your booking"}>
      <span className="desktop-label">{language === "da" ? "Administrer din booking" : "Manage your booking"}</span>
      <span className="mobile-label" aria-hidden="true">{language === "da" ? "Administrer" : "Manage"}</span>
      <ArrowUpRight size={16} aria-hidden="true" />
    </a>}
  </div>;
}
