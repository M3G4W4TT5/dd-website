"use client";

import type { ReactNode } from "react";
import { SpringCheckbox } from "./SpringCheckbox";
import { countryOptions } from "../lib/phone";
import { normalizePhone } from "../lib/phone";

export function invalidDetailFields(form: HTMLFormElement): string[] {
  const invalid = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".details-fields input, .details-fields select, .details-fields textarea"))
    .filter(field => !field.checkValidity()).map(field => field.name);
  const values = new FormData(form);
  if (!normalizePhone(String(values.get("phone") || ""), String(values.get("phoneCountry") || "DK"))) invalid.push("phone");
  return [...new Set(invalid)];
}

export function BuyerDetailsFields({ labels, invalidFields, language }: {
  labels: { name: string; email: string; phone: string }; invalidFields: string[]; language: "da" | "en";
}) {
  return <>
    <label>{labels.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required aria-invalid={invalidFields.includes("name")} /></label>
    <label>{labels.email}<input name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={invalidFields.includes("email")} /></label>
    <label>{language === "da" ? "Landekode" : "Country code"}<select name="phoneCountry" defaultValue="DK" autoComplete="tel-country-code">
      {countryOptions(language).map(country => <option key={country.code} value={country.code}>{country.label}</option>)}
    </select></label>
    <label>{labels.phone}<input name="phone" type="tel" autoComplete="tel-national" minLength={6} maxLength={30} required aria-invalid={invalidFields.includes("phone")} aria-describedby={invalidFields.includes("phone") ? "phone-field-error" : undefined} /></label>
  </>;
}

export function DetailsConsent({ idPrefix, marketingId = `${idPrefix}-marketing`, termsErrorId = `${idPrefix}-terms-error`, marketingLabel, termsLabel, termsError, marketingOptIn, termsAccepted, showTermsError, onMarketingChange, onTermsChange }: {
  idPrefix: string; marketingLabel: string; termsLabel: ReactNode; termsError: string;
  marketingId?: string; termsErrorId?: string;
  marketingOptIn: boolean; termsAccepted: boolean; showTermsError: boolean;
  onMarketingChange: (checked: boolean) => void; onTermsChange: (checked: boolean) => void;
}) {
  return <>
    <div className="terms-acceptance marketing-acceptance">
      <SpringCheckbox id={marketingId} checked={marketingOptIn} onChange={event => onMarketingChange(event.target.checked)} />
      <label htmlFor={marketingId}>{marketingLabel}</label>
    </div>
    <div className="terms-acceptance">
      <SpringCheckbox id={`${idPrefix}-terms`} required checked={termsAccepted} onChange={event => onTermsChange(event.target.checked)} aria-describedby={showTermsError ? termsErrorId : undefined} aria-invalid={showTermsError} />
      <label htmlFor={`${idPrefix}-terms`}>{termsLabel}</label>
    </div>
    {showTermsError && <p id={termsErrorId} className="terms-error" role="alert">{termsError}</p>}
  </>;
}
