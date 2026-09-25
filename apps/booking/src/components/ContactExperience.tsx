"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "./SiteFooter";
import { MobileNavigation } from "./MobileNavigation";
import { useVisualEffects } from "./useVisualEffects";
import { HeaderBookingActions } from "./HeaderBookingActions";

type Language = "da" | "en";
const copy = {
  da: {
    preview: "TTD STUDIO · KONTAKT", events: "Events", contact: "Kontakt",
    title: "Kontakt os.", intro: "Spørg os om booking, events eller noget helt tredje. Vi glæder os til at høre fra dig.",
    form: "SEND EN BESKED", name: "Navn", email: "Din e-mail", topic: "Emne", choose: "Vælg emne", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Andet", message: "Besked", send: "Send besked",
    sending: "Sender…", sent: "Din besked er sendt. Tak!", failed: "Beskeden kunne ikke sendes. Prøv igen senere.",
    fieldsRequired: "Udfyld eller ret de markerede felter for at sende beskeden.",
  },
  en: {
    preview: "TTD STUDIO · CONTACT", events: "Events", contact: "Contact",
    title: "Let's talk.", intro: "Ask us about bookings, events, or anything else. We'd love to hear from you.",
    form: "SEND A MESSAGE", name: "Name", email: "Your email", topic: "Topic", choose: "Choose a topic", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Other", message: "Message", send: "Send message",
    sending: "Sending…", sent: "Your message has been sent. Thank you!", failed: "Your message could not be sent. Please try again later.",
    fieldsRequired: "Complete or correct the highlighted fields to send your message.",
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
  useVisualEffects();
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("ttd-language", language); }, [language]);
  const t = copy[language];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = invalidContactFields(form);
    setInvalidFields(invalid);
    if (invalid.length) {
      form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${invalid[0]}"]`)?.focus();
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
          website: fields.get("website"),
        }),
      });
      if (!response.ok) throw new Error("Delivery failed");
      form.reset();
      setInvalidFields([]);
      setStatus("sent");
    } catch {
      setStatus("failed");
    } finally {
      setSending(false);
    }
  }

  return <>
    <div className="preview-bar"><span className="preview-dot" />{t.preview}</div>
    <header className="site-header event-header">
      <MobileNavigation language={language} currentPage="contact" />
      <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
        <a href="/#booking">Booking</a><a href={`/events?lang=${language}`}>{t.events}</a><a href={`/contact?lang=${language}`} aria-current="page">{t.contact}</a>
      </nav>
      <a className="brand" href="/" aria-label="TTD Studio — home"><span className="brand-mark">TTD<br />STUDIO</span></a>
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
          <div className="contact-form-bottom"><button type="submit" disabled={sending}>{sending ? t.sending : t.send}<ArrowUpRight size={20} /></button><p role="status" aria-live="polite">{status ? t[status] : ""}</p></div>
          <p className="form-privacy">{language === "da" ? "Vi bruger dine oplysninger til at svare dig." : "We use your details to reply."} <a href={`/privacy?lang=${language}`}>{language === "da" ? "Læs privatlivspolitikken" : "Read the privacy policy"}</a>.</p>
        </form>
        <div className="contact-visual-placeholder" aria-hidden="true" />
      </section>
    </main>
    <SiteFooter language={language} links={[{ href: "/", label: "Booking" }, { href: `/events?lang=${language}`, label: t.events }]} />
  </>;
}
