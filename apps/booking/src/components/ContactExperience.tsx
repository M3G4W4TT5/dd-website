"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "./SiteFooter";
import { MobileNavigation } from "./MobileNavigation";
import { useVisualEffects } from "./useVisualEffects";
import { HeaderBookingActions } from "./HeaderBookingActions";
import { SpringCheckbox } from "./SpringCheckbox";

type Language = "da" | "en";
const copy = {
  da: {
    events: "Events", contact: "Kontakt",
    title: "Kontakt os.", intro: "Spørg os om booking, events eller noget helt tredje. Vi glæder os til at høre fra dig.",
    form: "SEND EN BESKED", name: "Navn", email: "Din e-mail", topic: "Emne", choose: "Vælg emne", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Andet", message: "Besked", send: "Send besked",
    sending: "Sender…", sent: "Din besked er sendt. Tak!", failed: "Beskeden kunne ikke sendes. Prøv igen senere.",
    fieldsRequired: "Udfyld eller ret de markerede felter for at sende beskeden.",
    acceptPrivacy: "Acceptér",
    privacyPolicy: "privatlivspolitikken",
    privacyRequired: "Du skal acceptere privatlivspolitikken for at sende beskeden.",
  },
  en: {
    events: "Events", contact: "Contact",
    title: "Let's talk.", intro: "Ask us about bookings, events, or anything else. We'd love to hear from you.",
    form: "SEND A MESSAGE", name: "Name", email: "Your email", topic: "Topic", choose: "Choose a topic", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Other", message: "Message", send: "Send message",
    sending: "Sending…", sent: "Your message has been sent. Thank you!", failed: "Your message could not be sent. Please try again later.",
    fieldsRequired: "Complete or correct the highlighted fields to send your message.",
    acceptPrivacy: "Accept",
    privacyPolicy: "privacy policy",
    privacyRequired: "You must accept the privacy policy to send your message.",
  },
} as const;

function invalidContactFields(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".contact-field-grid :is(input, select, textarea):not([name=website])"))
    .filter((field) => !field.checkValidity()).map((field) => field.name);
}

export function ContactExperience({ initialLanguage }: { initialLanguage: Language }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"sent" | "failed" | null>(null);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPrivacyError, setShowPrivacyError] = useState(false);
  useVisualEffects();
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("ttd-language", language); }, [language]);
  const t = copy[language];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = invalidContactFields(form);
    setInvalidFields(invalid);
    setShowPrivacyError(!privacyAccepted);
    if (invalid.length || !privacyAccepted) {
      if (invalid.length) form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${invalid[0]}"]`)?.focus();
      else form.querySelector<HTMLInputElement>("#accept-contact-privacy")?.focus();
      return;
    }
    const fields = new FormData(form);
    setSending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "booking",
          name: fields.get("name"),
          email: fields.get("email"),
          topic: fields.get("topic"),
          message: fields.get("message"),
          privacyAccepted,
          website: fields.get("website"),
        }),
      });
      if (!response.ok) throw new Error("Delivery failed");
      form.reset();
      setInvalidFields([]);
      setPrivacyAccepted(false);
      setShowPrivacyError(false);
      setStatus("sent");
    } catch {
      setStatus("failed");
    } finally {
      setSending(false);
    }
  }

  return <>
    <header className="site-header event-header">
      <MobileNavigation language={language} currentPage="contact" />
      <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
        <a href={`/?lang=${language}`}>Booking</a><a href={`/events?lang=${language}`}>{t.events}</a><a href={`/contact?lang=${language}`} aria-current="page">{t.contact}</a>
      </nav>
      <a className="brand" href={`/?lang=${language}`} aria-label="TTD Studio — home"><span className="brand-mark" aria-hidden="true" /></a>
      <HeaderBookingActions language={language} onLanguageChange={setLanguage} />
    </header>
    <main className="contact-main">
      <div className="events-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
      <section className="contact-layout" aria-label={t.form}>
        <form className="studio-contact-form" noValidate onInput={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onChange={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onSubmit={submit}>
          <div className="contact-form-heading"><span className="section-kicker">01 / {t.form}</span><ArrowUpRight size={25} strokeWidth={1.5} /></div>
          <div className="contact-field-grid">
            <label>{t.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={120} required aria-invalid={invalidFields.includes("name")} /></label>
            <label>{t.email}<input name="email" type="email" autoComplete="email" maxLength={254} required aria-invalid={invalidFields.includes("email")} /></label>
            <label className="contact-wide">{t.topic}<select name="topic" defaultValue="" required aria-invalid={invalidFields.includes("topic")}><option value="" disabled>{t.choose}</option><option value="booking">{t.bookingTopic}</option><option value="event">{t.eventTopic}</option><option value="other">{t.otherTopic}</option></select></label>
            <label className="contact-wide">{t.message}<textarea name="message" rows={7} minLength={10} maxLength={5000} required aria-invalid={invalidFields.includes("message")} /></label>
            <label className="contact-honeypot" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {invalidFields.length > 0 && <p className="form-field-error" role="alert">{t.fieldsRequired}</p>}
          <div className="contact-privacy-acceptance terms-acceptance">
            <SpringCheckbox id="accept-contact-privacy" required checked={privacyAccepted} onChange={(event) => { setPrivacyAccepted(event.target.checked); if (event.target.checked) setShowPrivacyError(false); }} aria-describedby={showPrivacyError ? "contact-privacy-error" : undefined} aria-invalid={showPrivacyError} />
            <label htmlFor="accept-contact-privacy">{t.acceptPrivacy} <a href={`/privacy?lang=${language}`}>{t.privacyPolicy}</a>.</label>
          </div>
          {showPrivacyError && <p id="contact-privacy-error" className="contact-privacy-error terms-error" role="alert">{t.privacyRequired}</p>}
          <div className="contact-form-bottom"><button type="submit" disabled={sending}>{sending ? t.sending : t.send}<ArrowUpRight size={20} /></button><p role="status" aria-live="polite">{status ? t[status] : ""}</p></div>
        </form>
        <div className="contact-visual-placeholder" aria-hidden="true" />
      </section>
    </main>
    <SiteFooter language={language} />
  </>;
}
