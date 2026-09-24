"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Flower2,
  MapPin,
  MoveUpRight,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import type { Availability, Quote, Slot } from "@/lib/booking";
import { MAX_HOURS, quoteInterval, STUDIO_ZONE } from "@/lib/booking";
import { CustomerDetailsPreview } from "@/components/CustomerDetailsPreview";
import { useVisualEffects } from "@/components/useVisualEffects";

type Language = "da" | "en";

const copy = {
  da: {
    preview: "LOKAL FORHÅNDSVISNING · INGEN BOOKINGER OPRETTES",
    navBook: "Book studiet",
    navSpace: "Rummet",
    navInfo: "Praktisk",
    navEvents: "Events",
    navAdmin: "Administration",
    heroEyebrow: "KØBENHAVN DANSER / TTD",
    displayLeft: "TTD",
    displayRight: "STUDIO",
    displaySub: "DANS · TRÆNING · BEVÆGELSE",
    imageOne: "Illustrativt urbant dansestudie med mursten, spejle og trægulv",
    imageTwo: "Illustrativ detalje med spejl og murstensvæg i et urbant dansestudie",
    heroText:
      "TTD Studio er et kreativt træningsrum for dansere hos København Danser på Østerbro. Skabt af Didde-Mie Lykke From og Toniah Pedersen.",
    heroBook: "Se ledige tider",
    heroNote: "Designudkast · Studiebillede afventer",
    metricOne: "68 m²",
    metricTwo: "Alle dage · 08–22",
    metricThree: "350 kr./time",
    bookingEyebrow: "FIND DIN TID",
    bookingTitle: "Giv din idé tid og rum.",
    bookingIntro:
      "Vælg en starttid og det antal sammenhængende timer, du har brug for. Denne forhåndsvisning opretter ikke en booking.",
    unavailable: "Ledige tider kan ikke indlæses lige nu. Kontrollér den lokale pretix-forbindelse.",
    pickDate: "01 / VÆLG DATO",
    pickTime: "02 / VÆLG STARTTID",
    pickDuration: "03 / ANTAL TIMER",
    previousWeek: "Forrige uge",
    nextWeek: "Næste uge",
    chooseDate: "Vælg dato",
    available: "Ledig",
    taken: "Optaget",
    noTimes: "Ingen tider denne dag. Prøv en anden dato.",
    loading: "Henter tider…",
    summaryEyebrow: "DIN TID I STUDIET",
    summaryTitle: "Overblik",
    selectedDay: "Dato",
    selectedHours: "Varighed",
    hour: "time",
    hours: "timer",
    fromTo: "Tidspunkt",
    chooseStart: "Vælg en ledig starttid",
    price: "Samlet pris",
    noQuote: "Valgte timer skal være sammenhængende og ledige.",
    check: "Tjek tilgængelighed",
    checking: "Tjekker…",
    checked: "Tiderne er ledige. Udfyld dine oplysninger nedenfor.",
    changed: "Tiderne er ændret. Vælg et nyt interval.",
    policy: "Gratis afbestilling indtil 24 timer før start.",
    studioEyebrow: "RUM TIL MERE",
    studioTitle: "TTD Studio.",
    studioText:
      "Et kreativt træningsrum for dansere, skabt af Didde-Mie Lykke From og Toniah Pedersen. Her er plads til fordybelse i bevægelse. Rummets mål er anslået ud fra København Dansers plantegning: cirka 6,7 × 10,2 m (68 m²).",
    featureOne: "Træning & øvelse",
    featureTwo: "Undervisning",
    featureThree: "Kreativt arbejde",
    featureBody: "Eksempel på anvendelse · afventer endelig studiebeskrivelse.",
    infoEyebrow: "DET PRAKTISKE",
    infoTitle: "Før du booker.",
    infoLocation: "Placering",
    infoLocationBody: "Hos København Danser · Nygaardsvej 5a, 2. sal · 2100 København Ø.",
    infoTime: "Åbningstider",
    infoTimeBody: "Alle dage kl. 08.00–22.00. Vælg én eller flere sammenhængende timer.",
    infoContact: "Kontakt",
    infoContactBody: "Telefon: +45 XX XX XX XX · E-mail: email@example.com",
    infoTerms: "Bookingregler",
    infoTermsBody: "Gratis afbestilling indtil 24 timer før start.",
    footerText: "Time to Dance!",
    toniahPersonal: "Toniahs personlige side",
    personal: "DD's personlige side",
  },
  en: {
    preview: "LOCAL PREVIEW · NO BOOKINGS ARE CREATED",
    navBook: "Book the studio",
    navSpace: "The space",
    navInfo: "Good to know",
    navEvents: "Events",
    navAdmin: "Administration",
    heroEyebrow: "KØBENHAVN DANSER / TTD",
    displayLeft: "TTD",
    displayRight: "STUDIO",
    displaySub: "DANCE · PRACTICE · MOVEMENT",
    imageOne: "Illustrative urban dance studio with brick, mirrors and wooden floor",
    imageTwo: "Illustrative urban dance studio detail with mirror and brick wall",
    heroText:
      "TTD Studio is a creative training room for dancers at København Danser in Østerbro, created by Didde-Mie Lykke From and Toniah Pedersen.",
    heroBook: "Explore availability",
    heroNote: "Design preview · Studio photo pending",
    metricOne: "68 m²",
    metricTwo: "Every day · 08–22",
    metricThree: "DKK 350/hour",
    bookingEyebrow: "FIND YOUR TIME",
    bookingTitle: "Give your idea room to move.",
    bookingIntro:
      "Choose a start time and the number of consecutive hours you need. This preview does not create a booking.",
    unavailable: "Availability could not be loaded. Check the local pretix connection.",
    pickDate: "01 / CHOOSE A DATE",
    pickTime: "02 / CHOOSE A START TIME",
    pickDuration: "03 / NUMBER OF HOURS",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    chooseDate: "Choose date",
    available: "Available",
    taken: "Unavailable",
    noTimes: "No times on this day. Try another date.",
    loading: "Loading times…",
    summaryEyebrow: "YOUR STUDIO TIME",
    summaryTitle: "At a glance",
    selectedDay: "Date",
    selectedHours: "Duration",
    hour: "hour",
    hours: "hours",
    fromTo: "Time",
    chooseStart: "Choose an available start time",
    price: "Total price",
    noQuote: "The selected hours must be consecutive and available.",
    check: "Check availability",
    checking: "Checking…",
    checked: "These hours are available. Enter your details below.",
    changed: "Availability has changed. Choose another interval.",
    policy: "Free cancellation until 24 hours before the start time.",
    studioEyebrow: "ROOM FOR MORE",
    studioTitle: "TTD Studio.",
    studioText:
      "A creative training room for dancers, created by Didde-Mie Lykke From and Toniah Pedersen. Its size is estimated from København Danser's floor plan: approximately 6.7 × 10.2 m (68 m²).",
    featureOne: "Practice & rehearsal",
    featureTwo: "Teaching",
    featureThree: "Creative work",
    featureBody: "Example use · pending the final studio description.",
    infoEyebrow: "GOOD TO KNOW",
    infoTitle: "Before you book.",
    infoLocation: "Location",
    infoLocationBody: "At København Danser · Nygaardsvej 5a, 2nd floor · 2100 Copenhagen Ø.",
    infoTime: "Opening hours",
    infoTimeBody: "Every day, 08:00–22:00. Choose one or more consecutive hours.",
    infoContact: "Contact",
    infoContactBody: "Phone: +45 XX XX XX XX · Email: email@example.com",
    infoTerms: "Booking rules",
    infoTermsBody: "Free cancellation until 24 hours before the start time.",
    footerText: "Time to Dance!",
    toniahPersonal: "Toniah's personal site",
    personal: "DD's personal site",
  },
} as const;

function timeLabel(iso: string): string {
  return DateTime.fromISO(iso).setZone(STUDIO_ZONE).toFormat("HH:mm");
}

function dateLabel(iso: string, language: Language): string {
  return DateTime.fromISO(iso, { zone: STUDIO_ZONE })
    .setLocale(language)
    .toLocaleString({ weekday: "long", day: "numeric", month: "long" });
}

function money(ore: number, language: Language): string {
  return new Intl.NumberFormat(language === "da" ? "da-DK" : "en-DK", {
    style: "currency",
    currency: "DKK",
    maximumFractionDigits: 0,
  }).format(ore / 100);
}

export function BookingExperience({
  initialDate,
  initialAvailability,
}: {
  initialDate: string;
  initialAvailability: Availability | null;
}) {
  const [language, setLanguage] = useState<Language>("da");
  const [weekStart, setWeekStart] = useState(initialDate);
  const [date, setDate] = useState(initialDate);
  const [availability, setAvailability] = useState(initialAvailability);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hours, setHours] = useState(2);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"idle" | "checked" | "changed" | "error">("idle");
  const [error, setError] = useState(!initialAvailability);
  const t = copy[language];
  const today = initialDate;
  const maxDay = DateTime.fromISO(initialDate).plus({ days: 45 }).toISODate()!;

  useEffect(() => {
    const saved = localStorage.getItem("ttd-language");
    if (saved === "en") setLanguage("en");
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    if (status !== "checked") return;
    const frame = window.requestAnimationFrame(() => {
      const details = document.getElementById("booking-details");
      if (!details) return;
      const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
      const contentTop = headerHeight + 16;
      const availableHeight = window.innerHeight - contentTop - 16;
      const bounds = details.getBoundingClientRect();
      const targetTop = bounds.height <= availableHeight
        ? contentTop + (availableHeight - bounds.height) / 2
        : contentTop;
      window.scrollTo({
        top: window.scrollY + bounds.top - targetTop,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [status]);

  useVisualEffects();

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, index) => DateTime.fromISO(weekStart).plus({ days: index }).toISODate()!),
    [weekStart],
  );
  const current = availability?.date === date ? availability : null;
  const selectedSlot = current?.slots.find((slot) => slot.id === selectedId) || null;
  const quote = current && selectedId ? quoteInterval(current, selectedId, hours) : null;

  async function selectDate(nextDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < today || nextDate > maxDay) return;
    setDate(nextDate);
    setSelectedId(null);
    setStatus("idle");
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(nextDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Availability request failed");
      setAvailability((await response.json()) as Availability);
    } catch {
      setAvailability(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  function shiftWeek(amount: number) {
    const next = DateTime.fromISO(weekStart).plus({ days: amount }).toISODate()!;
    if (next < today || next > maxDay) return;
    setWeekStart(next);
    void selectDate(next);
  }

  async function checkSelection() {
    if (!quote || !selectedId) return;
    setChecking(true);
    setStatus("idle");
    try {
      const response = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, startId: selectedId, hours }),
      });
      if (response.status === 409) {
        setStatus("changed");
        await selectDate(date);
        setStatus("changed");
      } else if (!response.ok) {
        setStatus("error");
      } else {
        const result = (await response.json()) as { quote: Quote; reservationCreated: boolean };
        setStatus(result.reservationCreated ? "error" : "checked");
      }
    } catch {
      setStatus("error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <div className="preview-bar"><span className="preview-dot" />{t.preview}</div>
      <header className="site-header">
        <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
          <a href="#booking">{t.navBook}</a>
          <a href="#space">{t.navSpace}</a>
          <a href="#info">{t.navInfo}</a>
          <a href={`/events?lang=${language}`}>{t.navEvents}</a>
        </nav>
        <a className="brand" href="#top" aria-label="TTD Studio — top">
          <span className="brand-mark">TTD<br />STUDIO</span>
        </a>
        <div className="header-actions">
          <a className="event-mobile-link" href={`/events?lang=${language}`}>{t.navEvents}</a>
          <div className="lang-switch" aria-label="Language">
            <button type="button" className={language === "da" ? "active" : ""} onClick={() => { setLanguage("da"); localStorage.setItem("ttd-language", "da"); }} aria-pressed={language === "da"}>DA</button>
            <span>/</span>
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => { setLanguage("en"); localStorage.setItem("ttd-language", "en"); }} aria-pressed={language === "en"}>EN</button>
          </div>
          <a className="header-book" href="#booking">{t.navBook}<ArrowUpRight size={16} /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-introline"><span>{t.heroEyebrow}</span><span>{t.displaySub}</span></div>
          <div className="hero-title-row">
            <h1 id="hero-title"><span>{t.displayLeft}</span><span>{t.displayRight}</span></h1>
          </div>
          <div className="hero-gallery">
            <figure className="hero-photo hero-photo-wide">
              <div className="image-frame" data-image-shadow data-reveal><img src="/concepts/studio-room.png" alt={t.imageOne} /></div>
              <figcaption><span>01 / {t.navSpace}</span><span>{t.heroNote}</span></figcaption>
            </figure>
            <figure className="hero-photo hero-photo-detail">
              <div className="image-frame" data-image-shadow data-reveal><img src="/concepts/studio-detail.png" loading="lazy" alt={t.imageTwo} /></div>
              <figcaption><span>02 / STUDIO DETAIL</span><span>{t.heroNote}</span></figcaption>
            </figure>
          </div>
          <div className="hero-after"><p>{t.heroText}</p><a href="#booking">{t.heroBook}<ArrowDownRight size={21} /></a></div>
        </section>

        <div className="metric-strip" aria-label={language === "da" ? "Om studiet" : "About the studio"}>
          <div><span className="metric-icon"><Flower2 size={24} strokeWidth={1.4} /></span><span>{t.metricOne}</span></div>
          <div><span className="metric-icon"><Clock3 size={24} strokeWidth={1.4} /></span><span>{t.metricTwo}</span></div>
          <div><span className="metric-icon"><Coins size={24} strokeWidth={1.4} /></span><span>{t.metricThree}</span></div>
        </div>

        <section className="booking-section" id="booking" aria-labelledby="booking-title">
          <div className="section-heading booking-heading">
            <div><span className="section-kicker">{t.bookingEyebrow}</span><h2 id="booking-title">{t.bookingTitle}</h2></div>
            <p>{t.bookingIntro}</p>
          </div>
          <div className="booking-layout">
            <div className="picker-panel">
              <div className="picker-head"><span>{t.pickDate}</span><CalendarDays size={19} /></div>
              <div className="date-controls">
                <div className="date-navigation">
                  <button type="button" onClick={() => shiftWeek(-7)} disabled={weekStart <= today} aria-label={t.previousWeek}><ChevronLeft size={20} /></button>
                  <span>{DateTime.fromISO(weekStart).setLocale(language).toFormat("LLLL yyyy")}</span>
                  <button type="button" onClick={() => shiftWeek(7)} disabled={DateTime.fromISO(weekStart).plus({ days: 7 }).toISODate()! > maxDay} aria-label={t.nextWeek}><ChevronRight size={20} /></button>
                </div>
                <label className="date-input-label"><span>{t.chooseDate}</span><input type="date" min={today} max={maxDay} value={date} onChange={(event) => { const next = event.target.value; if (next >= today && next <= maxDay) { setWeekStart(next); void selectDate(next); } }} /></label>
              </div>
              <div className="date-strip">
                {week.map((day) => {
                  const value = DateTime.fromISO(day).setLocale(language);
                  return <button key={day} type="button" className={date === day ? "date-tile selected" : "date-tile"} disabled={day > maxDay} onClick={() => void selectDate(day)} aria-pressed={date === day}>
                    <span>{value.toFormat("ccc")}</span><strong>{value.day}</strong><small>{value.toFormat("LLL")}</small>
                  </button>;
                })}
              </div>

              <div className="picker-head time-head"><span>{t.pickTime}</span><span className="timezone">EUROPE / COPENHAGEN</span></div>
              {loading ? <div className="slot-message">{t.loading}</div> : error ? <div className="slot-message error-message">{t.unavailable}</div> : !current?.slots.length ? <div className="slot-message">{t.noTimes}</div> : (
                <div className="time-grid">
                  {current.slots.map((slot: Slot) => (
                    <button type="button" key={slot.id} className={`time-slot ${selectedId === slot.id ? "selected" : ""}`} disabled={!slot.available} onClick={() => { setSelectedId(slot.id); setStatus("idle"); }} aria-pressed={selectedId === slot.id}>
                      <span className="time-value">{timeLabel(slot.start)}</span>
                      <span className="slot-state">{slot.available ? selectedId === slot.id ? <Check size={15} /> : t.available : t.taken}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="picker-legend"><span><i className="legend-available" />{t.available}</span><span><i className="legend-taken" />{t.taken}</span></div>
            </div>

            <aside className="summary-panel" aria-labelledby="summary-title">
              <div className="summary-header"><span className="section-kicker">{t.summaryEyebrow}</span><h3 id="summary-title">{t.summaryTitle}</h3></div>
              <div className="summary-content">
                <div className="summary-row"><span>{t.selectedDay}</span><strong>{dateLabel(date, language)}</strong></div>
                <div className="duration-block"><div className="picker-head"><span>{t.pickDuration}</span><span>{hours} {hours === 1 ? t.hour : t.hours}</span></div><div className="duration-options">{Array.from({ length: MAX_HOURS }, (_, index) => index + 1).map((amount) => <button key={amount} type="button" className={hours === amount ? "active" : ""} onClick={() => { setHours(amount); setStatus("idle"); }} aria-pressed={hours === amount}>{amount}</button>)}</div></div>
                <div className="summary-row"><span>{t.fromTo}</span><strong>{quote ? `${timeLabel(quote.start)} — ${timeLabel(quote.end)}` : selectedSlot ? t.noQuote : t.chooseStart}</strong></div>
                <div className="summary-total"><span>{t.price}</span><strong>{quote ? money(quote.totalOre, language) : "—"}</strong></div>
                <button className="button button-check" type="button" onClick={() => void checkSelection()} disabled={!quote || checking}>{checking ? t.checking : t.check}<MoveUpRight size={18} /></button>
                {status !== "idle" && <p className={`check-result ${status}`} role="status">{status === "checked" ? t.checked : status === "changed" ? t.changed : t.unavailable}</p>}
              </div>
              <div className="summary-footer"><ShieldCheck size={18} /><span>{t.policy}</span></div>
            </aside>
          </div>
          {status === "checked" && quote && selectedId && <CustomerDetailsPreview key={`${date}:${selectedId}:${hours}`} language={language} date={date} startId={selectedId} hours={hours} onConflict={async () => { await selectDate(date); setStatus("changed"); }} />}
        </section>

        <section className="space-section" id="space" aria-labelledby="space-title">
          <div className="space-intro"><span className="section-kicker">{t.studioEyebrow}</span><h2 id="space-title">{t.studioTitle}</h2><p>{t.studioText}</p></div>
          <div className="feature-cards">
            {[t.featureOne, t.featureTwo, t.featureThree].map((feature, index) => <article className={`feature-card feature-${index + 1}`} key={feature}><div className="feature-art image-frame" data-image-shadow data-reveal><img src={index === 1 ? "/concepts/studio-detail.png" : "/concepts/studio-room.png"} loading="lazy" alt={index === 1 ? t.imageTwo : t.imageOne} /></div><div className="feature-caption"><div><span>0{index + 1} / 03 · {t.heroNote}</span><h3>{feature}</h3><p>{t.featureBody}</p></div><ArrowUpRight size={22} /></div></article>)}
          </div>
        </section>

        <section className="info-section" id="info" aria-labelledby="info-title">
          <div className="info-title"><span className="section-kicker">{t.infoEyebrow}</span><h2 id="info-title">{t.infoTitle}</h2></div>
          <div className="info-list">
            {[{ icon: MapPin, title: t.infoLocation, body: t.infoLocationBody }, { icon: Clock3, title: t.infoTime, body: t.infoTimeBody }, { icon: Phone, title: t.infoContact, body: t.infoContactBody }, { icon: ShieldCheck, title: t.infoTerms, body: t.infoTermsBody }].map(({ icon: Icon, title, body }) => <div className="info-row" key={title}><Icon size={23} strokeWidth={1.5} /><h3>{title}</h3><p>{body}</p><ArrowUpRight size={18} /></div>)}
          </div>
        </section>
      </main>

      <div className="footer-reveal-space" aria-hidden="true" />
      <footer className="site-footer"><div className="footer-main"><div><span className="footer-mark">TTD</span><p>{t.footerText}</p></div><div className="footer-links"><a href="https://toniah.com/en/">{t.toniahPersonal}<ArrowUpRight size={17} /></a><a href={process.env.NEXT_PUBLIC_PERSONAL_URL || "http://127.0.0.1:4321"}>{t.personal}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">{t.navAdmin}<ArrowUpRight size={17} /></a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} TTD STUDIO</span></div></footer>
    </>
  );
}
