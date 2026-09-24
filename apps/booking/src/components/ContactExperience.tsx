"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SiteFooter } from "./SiteFooter";
import { MobileNavigation } from "./MobileNavigation";
import { useVisualEffects } from "./useVisualEffects";

type Language = "da" | "en";
const copy = {
  da: {
    preview: "TTD STUDIO · KONTAKT", events: "Events", contact: "Kontakt",
    title: "Kontakt os.", intro: "Spørg os om booking, events eller noget helt tredje. Vi glæder os til at høre fra dig.",
    form: "SEND EN BESKED", name: "Navn", email: "Din e-mail", topic: "Emne", choose: "Vælg emne", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Andet", message: "Besked", send: "Send besked",
    unavailable: "Kontaktformularen afventer opsætning. Den kan endnu ikke sende beskeder.",
  },
  en: {
    preview: "TTD STUDIO · CONTACT", events: "Events", contact: "Contact",
    title: "Let's talk.", intro: "Ask us about bookings, events, or anything else. We'd love to hear from you.",
    form: "SEND A MESSAGE", name: "Name", email: "Your email", topic: "Topic", choose: "Choose a topic", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Other", message: "Message", send: "Send message",
    unavailable: "The contact form is awaiting setup and cannot send messages yet.",
  },
} as const;

export function ContactExperience({ initialLanguage }: { initialLanguage: Language }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useVisualEffects();
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("ttd-language", language); }, [language]);
  const t = copy[language];

  return <>
    <div className="preview-bar"><span className="preview-dot" />{t.preview}</div>
    <header className="site-header event-header">
      <MobileNavigation language={language} currentPage="contact" />
      <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
        <a href="/#booking">Booking</a><a href={`/events?lang=${language}`}>{t.events}</a><a href={`/contact?lang=${language}`} aria-current="page">{t.contact}</a>
      </nav>
      <a className="brand" href="/" aria-label="TTD Studio — home"><span className="brand-mark">TTD<br />STUDIO</span></a>
      <div className="header-actions">
        <div className="lang-switch" aria-label="Language"><button type="button" className={language === "da" ? "active" : ""} onClick={() => setLanguage("da")} aria-pressed={language === "da"}>DA</button><span>/</span><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button></div>
      </div>
    </header>
    <main className="contact-main">
      <div className="events-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
      <section className="contact-layout" aria-label={t.form}>
        <form className="studio-contact-form" onSubmit={(event) => event.preventDefault()}>
          <div className="contact-form-heading"><span className="section-kicker">01 / {t.form}</span><ArrowUpRight size={25} strokeWidth={1.5} /></div>
          <div className="contact-field-grid">
            <label>{t.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={120} required /></label>
            <label>{t.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <label className="contact-wide">{t.topic}<select name="topic" defaultValue="" required><option value="" disabled>{t.choose}</option><option value="booking">{t.bookingTopic}</option><option value="event">{t.eventTopic}</option><option value="other">{t.otherTopic}</option></select></label>
            <label className="contact-wide">{t.message}<textarea name="message" rows={7} minLength={10} maxLength={5000} required /></label>
          </div>
          <div className="contact-form-bottom"><button type="submit" disabled>{t.send}<ArrowUpRight size={20} /></button><p role="status">{t.unavailable}</p></div>
        </form>
      </section>
    </main>
    <SiteFooter links={[{ href: "/", label: "Booking" }, { href: `/events?lang=${language}`, label: t.events }]} />
  </>;
}
