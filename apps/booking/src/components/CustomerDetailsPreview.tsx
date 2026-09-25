"use client";

import { ArrowLeft, ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

type Language = "da" | "en";

const copy = {
  da: {
    eyebrow: "04 / DINE OPLYSNINGER",
    title: "Gør din booking klar.",
    intro: "Indtast dine oplysninger, og gennemgå din booking, før du fortsætter til betaling.",
    name: "Navn",
    email: "E-mail",
    phone: "Telefon",
    type: "Jeg booker som",
    private: "Privatperson",
    instructor: "Underviser / instruktør",
    business: "Virksomhed",
    attendeeCount: "Antal deltagere",
    purpose: "Formål med bookingen",
    company: "Virksomhedens navn",
    comment: "Kommentar / særlige ønsker",
    optional: "Valgfrit",
    placeholderType: "Vælg type",
    back: "Tilbage til valg af tid",
    review: "Fortsæt til betaling",
    reviewing: "Tjekker oplysninger…",
    accept: "Acceptér",
    and: "og",
    terms: "bookingvilkår",
    privacy: "privatlivspolitik",
    termsRequired: "Du skal acceptere bookingvilkår og privatlivspolitik for at fortsætte.",
    success: "Dine oplysninger er kontrolleret, og tiden var ledig ved seneste tjek.",
    invalid: "Kontrollér oplysningerne og prøv igen.",
    changed: "Tiderne er ikke længere ledige. Vælg et nyt interval.",
    error: "Tjekket kunne ikke gennemføres lige nu.",
    checkout: "Betaling sker på næste trin.",
  },
  en: {
    eyebrow: "04 / YOUR DETAILS",
    title: "Prepare your booking.",
    intro: "Enter your details and review your booking before continuing to payment.",
    name: "Name",
    email: "Email",
    phone: "Phone",
    type: "I am booking as",
    private: "Private customer",
    instructor: "Teacher / instructor",
    business: "Business",
    attendeeCount: "Number of participants",
    purpose: "Purpose of booking",
    company: "Company name",
    comment: "Comment / special requests",
    optional: "Optional",
    placeholderType: "Choose type",
    back: "Back to time selection",
    review: "Continue to payment",
    reviewing: "Checking details…",
    accept: "Accept",
    and: "&",
    terms: "booking terms",
    privacy: "privacy policy",
    termsRequired: "You must accept the booking terms and privacy policy to continue.",
    success: "Your details have been checked, and the time was available at the last check.",
    invalid: "Check the details and try again.",
    changed: "These hours are no longer free. Choose another interval.",
    error: "The check could not be completed right now.",
    checkout: "Payment takes place in the next step.",
  },
} as const;

export function CustomerDetailsPreview({
  language,
  date,
  startId,
  hours,
  onBack,
  onConflict,
}: {
  language: Language;
  date: string;
  startId: string;
  hours: number;
  onBack: () => void;
  onConflict: () => Promise<void>;
}) {
  const t = copy[language];
  const [customerType, setCustomerType] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "success" | "invalid" | "changed" | "error">("idle");

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termsAccepted) {
      setShowTermsError(true);
      return;
    }
    const values = new FormData(event.currentTarget);
    setStatus("working");
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startId,
          hours,
          termsAccepted,
          details: {
            name: values.get("name"),
            email: values.get("email"),
            phone: values.get("phone"),
            customerType: values.get("customerType"),
            attendeeCount: Number(values.get("attendeeCount")),
            purpose: values.get("purpose"),
            company: values.get("company") || "",
            comment: values.get("comment") || "",
          },
        }),
      });
      if (response.status === 409) {
        setStatus("changed");
        await onConflict();
      } else if (response.status === 400) {
        setStatus("invalid");
      } else if (!response.ok) {
        setStatus("error");
      } else {
        const result = (await response.json()) as {
          detailsAccepted: boolean;
          reservationCreated: boolean;
          paymentStarted: boolean;
        };
        setStatus(result.detailsAccepted && !result.reservationCreated && !result.paymentStarted ? "success" : "error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="details-preview" id="booking-details" aria-labelledby="details-title">
      <div className="details-intro"><button className="details-back" type="button" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" />{t.back}</button><span className="section-kicker">{t.eyebrow}</span><h3 id="details-title" tabIndex={-1}>{t.title}</h3><p>{t.intro}</p><div className="details-reminder"><ShieldCheck size={17} />{t.checkout}</div></div>
      <form className="details-form" onSubmit={(event) => void review(event)}>
        <div className="details-fields">
          <label>{t.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required /></label>
          <label>{t.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>{t.phone}<input name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={30} required /></label>
          <label>{t.type}<select name="customerType" value={customerType} onChange={(event) => setCustomerType(event.target.value)} required><option value="" disabled>{t.placeholderType}</option><option value="private">{t.private}</option><option value="instructor">{t.instructor}</option><option value="business">{t.business}</option></select></label>
          <label>{t.attendeeCount}<input name="attendeeCount" type="number" inputMode="numeric" min={1} max={100} step={1} required /></label>
          <label>{t.purpose}<input name="purpose" type="text" maxLength={150} minLength={2} required /></label>
          {customerType === "business" && <label className="details-wide">{t.company}<input name="company" type="text" maxLength={150} required /></label>}
          <label className="details-wide">{t.comment} <span>({t.optional})</span><textarea name="comment" rows={3} maxLength={2000} /></label>
        </div>
        <div className="terms-acceptance">
          <input id="accept-booking-terms" type="checkbox" required checked={termsAccepted} onInvalid={() => setShowTermsError(true)} onChange={(event) => { setTermsAccepted(event.target.checked); if (event.target.checked) setShowTermsError(false); }} aria-describedby={showTermsError ? "terms-acceptance-error" : undefined} aria-invalid={showTermsError} />
          <label htmlFor="accept-booking-terms">{t.accept} <a href={`/terms?lang=${language}`}>{t.terms}</a> {t.and} <a href={`/privacy?lang=${language}`}>{t.privacy}</a>.</label>
        </div>
        {showTermsError && <p id="terms-acceptance-error" className="terms-error" role="alert">{t.termsRequired}</p>}
        <div className="details-actions"><button type="submit" disabled={status === "working"} onClick={() => { if (!termsAccepted) setShowTermsError(true); }}>{status === "working" ? t.reviewing : t.review}<ArrowUpRight size={19} /></button>{status !== "idle" && status !== "working" && <p className={`details-status ${status}`} role="status">{status === "success" ? t.success : status === "invalid" ? t.invalid : status === "changed" ? t.changed : t.error}</p>}</div>
      </form>
    </section>
  );
}
