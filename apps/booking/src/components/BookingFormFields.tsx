"use client";

import type { ReactNode } from "react";
import { SpringCheckbox } from "./SpringCheckbox";

export function invalidDetailFields(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".details-fields input, .details-fields select, .details-fields textarea"))
    .filter(field => !field.checkValidity()).map(field => field.name);
}

export function BuyerDetailsFields({ labels, invalidFields }: {
  labels: { name: string; email: string; phone: string }; invalidFields: string[];
}) {
  return <>
    <label>{labels.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required aria-invalid={invalidFields.includes("name")} /></label>
    <label>{labels.email}<input name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={invalidFields.includes("email")} /></label>
    <label>{labels.phone}<input name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={30} required aria-invalid={invalidFields.includes("phone")} /></label>
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
