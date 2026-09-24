"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import { SiteFooter } from "./SiteFooter";
import { useVisualEffects } from "./useVisualEffects";

type Language = "da" | "en";
const copy = {
  da: {
    preview: "TTD STUDIO · KONTAKT", booking: "Book studiet", space: "Rummet", info: "Praktisk", events: "Events", contact: "Kontakt",
    title: "Lad os tale sammen.", intro: "Spørg os om booking, events eller noget helt tredje. Vi glæder os til at høre fra dig.",
    form: "SEND EN BESKED", name: "Navn", email: "Din e-mail", topic: "Emne", choose: "Vælg emne", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Andet", message: "Besked", send: "Send besked",
    unavailable: "Kontaktformularen afventer opsætning. Den kan endnu ikke sende beskeder.",
    details: "FIND OS", phone: "Telefon", address: "Adresse", addressLine: "Nygaardsvej 5a, 2. sal", city: "2100 København Ø", location: "Hos København Danser", imageAlt: "Illustration af dansestudiet med spejle og trægulv", imageCaption: "Studiebillede afventer",
  },
  en: {
    preview: "TTD STUDIO · CONTACT", booking: "Book the studio", space: "The space", info: "Good to know", events: "Events", contact: "Contact",
    title: "Let's talk.", intro: "Ask us about bookings, events, or anything else. We'd love to hear from you.",
    form: "SEND A MESSAGE", name: "Name", email: "Your email", topic: "Topic", choose: "Choose a topic", bookingTopic: "Booking", eventTopic: "Event", otherTopic: "Other", message: "Message", send: "Send message",
    unavailable: "The contact form is awaiting setup and cannot send messages yet.",
    details: "FIND US", phone: "Phone", address: "Address", addressLine: "Nygaardsvej 5a, 2nd floor", city: "2100 Copenhagen Ø", location: "At København Danser", imageAlt: "Illustration of the dance studio with mirrors and wooden flooring", imageCaption: "Studio photo pending",
  },
} as const;

export function ContactExperience({ initialLanguage, phone }: { initialLanguage: Language; phone: string }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  useVisualEffects();
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("ttd-language", language); }, [language]);
  const t = copy[language];

  return <>
    <div className="preview-bar"><span className="preview-dot" />{t.preview}</div>
    <header className="site-header event-header">
      <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
        <a href="/#booking">{t.booking}</a><a href="/#space">{t.space}</a><a href="/#info">{t.info}</a><a href={`/events?lang=${language}`}>{t.events}</a><a href={`/contact?lang=${language}`} aria-current="page">{t.contact}</a>
      </nav>
      <a className="brand" href="/" aria-label="TTD Studio — home"><span className="brand-mark">TTD<br />STUDIO</span></a>
      <div className="header-actions">
        <div className="lang-switch" aria-label="Language"><button type="button" className={language === "da" ? "active" : ""} onClick={() => setLanguage("da")} aria-pressed={language === "da"}>DA</button><span>/</span><button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button></div>
        <a className="event-mobile-link" href={`/events?lang=${language}`}>{t.events}</a>
      </div>
    </header>
    <main className="contact-main">
      <div className="events-heading"><span className="section-kicker">TTD STUDIO / {t.contact.toUpperCase()}</span><h1>{t.title}</h1><p>{t.intro}</p></div>
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
        <figure className="contact-visual"><div className="image-frame" data-image-shadow data-reveal><img src="/concepts/studio-room.png" alt={t.imageAlt} loading="lazy" /></div><figcaption><span>TTD STUDIO / 01</span><span>{t.imageCaption}</span></figcaption></figure>
      </section>
      <section className="contact-details" aria-labelledby="contact-details-title"><div className="contact-details-heading"><span className="section-kicker">02 / {t.details}</span><h2 id="contact-details-title">{t.details}</h2></div><div className="contact-detail-rows"><div><Phone size={24} strokeWidth={1.5} /><h3>{t.phone}</h3><p>{phone}</p></div><div><MapPin size={24} strokeWidth={1.5} /><h3>{t.address}</h3><p>{t.location}<br />{t.addressLine}<br />{t.city}</p></div></div></section>
    </main>
    <SiteFooter links={[{ href: "/", label: "TTD Studio" }, { href: `/events?lang=${language}`, label: t.events }, { href: `/contact?lang=${language}`, label: t.contact }]} />
  </>;
}
