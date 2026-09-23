"use client";

import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flower2,
  Leaf,
  MapPin,
  MoveUpRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useMemo, useState } from "react";
import type { Availability, Quote, Slot } from "@/lib/booking";
import { MAX_HOURS, quoteInterval, STUDIO_ZONE } from "@/lib/booking";
import { CustomerDetailsPreview } from "@/components/CustomerDetailsPreview";

type Language = "da" | "en";

const copy = {
  da: {
    preview: "LOKAL FORHÅNDSVISNING · INGEN BOOKINGER OPRETTES",
    navBook: "Book studiet",
    navSpace: "Rummet",
    navInfo: "Praktisk",
    navAdmin: "Administration",
    heroEyebrow: "ET RUM TIL BEVÆGELSE",
    heroLine1: "Plads til det,",
    heroLine2: "du skaber.",
    heroText:
      "Et enkelt rum til dans, undervisning og kreativt arbejde. Tekst, billeder og praktiske oplysninger er foreløbige og afventer DD.",
    heroBook: "Se ledige tider",
    heroExplore: "Udforsk rummet",
    heroNote: "Designudkast · Studiebillede afventer",
    visualSide: "BEVÆGELSE / RUM / RO",
    visualPlace: "ADRESSE AFVENTER",
    visualBottom: "DIDDE-MIE LYKKE FROM — STUDIO",
    metricOne: "1 rum",
    metricTwo: "1 time ad gangen",
    metricThree: "Dit tempo",
    bookingEyebrow: "FIND DIN TID",
    bookingTitle: "Giv din idé tid og rum.",
    bookingIntro:
      "Vælg en starttid og det antal sammenhængende timer, du har brug for. Tilgængeligheden nedenfor er til visning; booking og betaling åbner senere.",
    demo: "Eksempeldata — tider og pris er ikke godkendt af DD.",
    live: "Tider hentes fra den lokale pretix-instans. Ingen reservation oprettes.",
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
    priceDemo: "Eksempelpris · afventer DD",
    priceLive: "Pris fra pretix · bekræftes ved checkout",
    noQuote: "Valgte timer skal være sammenhængende og ledige.",
    check: "Tjek tilgængelighed",
    checking: "Tjekker…",
    checked: "Tiderne var ledige ved seneste tjek. Udfyld forhåndsvisningen af bookingfelterne nedenfor. Tiderne er ikke reserveret.",
    changed: "Tiderne er ændret. Vælg et nyt interval.",
    checkoutLater: "Checkout åbner, når online betaling er integreret og testet.",
    policy: "Planlagt: gratis afbestilling indtil 24 timer før start. Præcis grænse og endelig pris godkendes før lancering.",
    studioEyebrow: "RUM TIL MERE",
    studioTitle: "Skabt til bevægelse.",
    studioText:
      "Her kommer godkendte studiebilleder, faciliteter og beskrivelse. Indtil da viser denne side struktur og retning for oplevelsen.",
    featureOne: "Træning & øvelse",
    featureTwo: "Undervisning",
    featureThree: "Kreativt arbejde",
    featureBody: "Eksempel på anvendelse · afventer endelig studiebeskrivelse.",
    infoEyebrow: "DET PRAKTISKE",
    infoTitle: "Enkel planlægning.",
    infoLocation: "Placering",
    infoLocationBody: "Adresse og ankomstvejledning tilføjes efter godkendelse.",
    infoTime: "Time for time",
    infoTimeBody: "Start med én time, og vælg flere sammenhængende timer i samme reservation.",
    infoTerms: "Bookingregler",
    infoTermsBody: "Endelig pris, åbningstider og vilkår bliver bekræftet af DD.",
    footerText: "Et rum for bevægelse. En hjemmeside under udvikling.",
    personal: "DD's personlige side",
    footerLabel: "LOKAL DEMO · IKKE KLAR TIL KUNDEBOOKINGER",
  },
  en: {
    preview: "LOCAL PREVIEW · NO BOOKINGS ARE CREATED",
    navBook: "Book the studio",
    navSpace: "The space",
    navInfo: "Good to know",
    navAdmin: "Administration",
    heroEyebrow: "A SPACE FOR MOVEMENT",
    heroLine1: "Room for what",
    heroLine2: "you create.",
    heroText:
      "A simple space for dance, teaching and creative work. Copy, images and practical details are placeholders pending DD's approval.",
    heroBook: "Explore availability",
    heroExplore: "Explore the space",
    heroNote: "Design preview · Studio photo pending",
    visualSide: "MOVEMENT / SPACE / CALM",
    visualPlace: "LOCATION TO COME",
    visualBottom: "DIDDE-MIE LYKKE FROM — STUDIO",
    metricOne: "1 space",
    metricTwo: "1 hour at a time",
    metricThree: "Your pace",
    bookingEyebrow: "FIND YOUR TIME",
    bookingTitle: "Give your idea room to move.",
    bookingIntro:
      "Choose a start time and the number of consecutive hours you need. Availability below is a preview; booking and payment will open later.",
    demo: "Sample data — times and price have not been approved by DD.",
    live: "Times come from the local pretix instance. No reservation is created.",
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
    priceDemo: "Example price · awaiting DD",
    priceLive: "Price from pretix · confirmed at checkout",
    noQuote: "The selected hours must be consecutive and available.",
    check: "Check availability",
    checking: "Checking…",
    checked: "These hours were available at the last check. Complete the booking-field preview below. The hours are not reserved.",
    changed: "Availability has changed. Choose another interval.",
    checkoutLater: "Checkout opens after online payment is integrated and tested.",
    policy: "Planned: free cancellation until 24 hours before start. The exact cutoff and final price require approval before launch.",
    studioEyebrow: "ROOM FOR MORE",
    studioTitle: "Made for movement.",
    studioText:
      "Approved studio photos, facilities and descriptions will go here. For now, this page shows the intended structure and direction.",
    featureOne: "Practice & rehearsal",
    featureTwo: "Teaching",
    featureThree: "Creative work",
    featureBody: "Example use · pending the final studio description.",
    infoEyebrow: "GOOD TO KNOW",
    infoTitle: "Easy to plan.",
    infoLocation: "Location",
    infoLocationBody: "Address and arrival information will be added after approval.",
    infoTime: "Hour by hour",
    infoTimeBody: "Start with one hour and choose more consecutive hours in a single reservation.",
    infoTerms: "Booking rules",
    infoTermsBody: "Final price, opening hours and terms will be confirmed by DD.",
    footerText: "A space for movement. A website in progress.",
    personal: "DD's personal site",
    footerLabel: "LOCAL DEMO · NOT READY FOR CUSTOMER BOOKINGS",
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
    document.documentElement.lang = language;
  }, [language]);

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
        <a className="brand" href="#top" aria-label="DD Studio — top">
          <span className="brand-mark">dd<span className="brand-star">✳</span></span>
          <span className="brand-divider" />
          <span className="brand-name">STUDIO<br />DIDDE-MIE</span>
        </a>
        <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
          <a href="#booking">{t.navBook}</a>
          <a href="#space">{t.navSpace}</a>
          <a href="#info">{t.navInfo}</a>
        </nav>
        <div className="header-actions">
          <div className="lang-switch" aria-label="Language">
            <button type="button" className={language === "da" ? "active" : ""} onClick={() => setLanguage("da")} aria-pressed={language === "da"}>DA</button>
            <span>/</span>
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")} aria-pressed={language === "en"}>EN</button>
          </div>
          <a className="header-book" href="#booking">{t.navBook}<ArrowUpRight size={16} /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" />{t.heroEyebrow}</div>
            <h1 id="hero-title">{t.heroLine1}<br /><em>{t.heroLine2}</em></h1>
            <p>{t.heroText}</p>
            <div className="hero-actions">
              <a className="button button-dark" href="#booking">{t.heroBook}<ArrowUpRight size={18} /></a>
              <a className="text-link" href="#space">{t.heroExplore}<ArrowRight size={17} /></a>
            </div>
            <div className="hero-fineprint"><Sparkles size={15} />{t.heroNote}</div>
          </div>
          <div className="hero-visual" aria-label={t.heroNote} role="img">
            <div className="visual-grain" />
            <div className="visual-arc arc-one" />
            <div className="visual-arc arc-two" />
            <div className="visual-orb" />
            <div className="visual-floor" />
            <div className="visual-topline"><span>DD — STUDIO</span><span>{t.visualPlace}</span></div>
            <div className="visual-side">{t.visualSide}</div>
            <div className="visual-bottom"><span>{t.visualBottom}</span><ArrowDownRight size={24} /></div>
          </div>
        </section>

        <div className="metric-strip" aria-label={language === "da" ? "Om studiet" : "About the studio"}>
          <div><span className="metric-icon"><Flower2 size={24} strokeWidth={1.4} /></span><span>{t.metricOne}</span></div>
          <div><span className="metric-icon"><Clock3 size={24} strokeWidth={1.4} /></span><span>{t.metricTwo}</span></div>
          <div><span className="metric-icon"><Leaf size={24} strokeWidth={1.4} /></span><span>{t.metricThree}</span></div>
        </div>

        <section className="booking-section" id="booking" aria-labelledby="booking-title">
          <div className="section-heading booking-heading">
            <div><span className="section-kicker">{t.bookingEyebrow}</span><h2 id="booking-title">{t.bookingTitle}</h2></div>
            <p>{t.bookingIntro}</p>
          </div>
          <div className="booking-notice"><span className="notice-pulse" />{error ? t.unavailable : current?.source === "demo" ? t.demo : t.live}</div>
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
                <div className="summary-total"><div><span>{t.price}</span><small>{current?.source === "demo" ? t.priceDemo : t.priceLive}</small></div><strong>{quote ? money(quote.totalOre, language) : "—"}</strong></div>
                <button className="button button-check" type="button" onClick={() => void checkSelection()} disabled={!quote || checking}>{checking ? t.checking : t.check}<MoveUpRight size={18} /></button>
                <p className={`check-result ${status}`} role="status">{status === "checked" ? t.checked : status === "changed" ? t.changed : status === "error" ? t.unavailable : t.checkoutLater}</p>
              </div>
              <div className="summary-footer"><ShieldCheck size={18} /><span>{t.policy}</span></div>
            </aside>
          </div>
          {status === "checked" && quote && selectedId && <CustomerDetailsPreview key={`${date}:${selectedId}:${hours}`} language={language} date={date} startId={selectedId} hours={hours} onConflict={async () => { await selectDate(date); setStatus("changed"); }} />}
        </section>

        <section className="space-section" id="space" aria-labelledby="space-title">
          <div className="space-intro"><span className="section-kicker">{t.studioEyebrow}</span><h2 id="space-title">{t.studioTitle}</h2><p>{t.studioText}</p></div>
          <div className="feature-cards">
            {[t.featureOne, t.featureTwo, t.featureThree].map((feature, index) => <article className={`feature-card feature-${index + 1}`} key={feature}><span className="feature-number">0{index + 1} / 03</span><div className="feature-art"><span /></div><div className="feature-caption"><div><h3>{feature}</h3><p>{t.featureBody}</p></div><ArrowUpRight size={22} /></div></article>)}
          </div>
        </section>

        <section className="info-section" id="info" aria-labelledby="info-title">
          <div className="info-title"><span className="section-kicker">{t.infoEyebrow}</span><h2 id="info-title">{t.infoTitle}</h2></div>
          <div className="info-list">
            {[{ icon: MapPin, title: t.infoLocation, body: t.infoLocationBody }, { icon: Clock3, title: t.infoTime, body: t.infoTimeBody }, { icon: ShieldCheck, title: t.infoTerms, body: t.infoTermsBody }].map(({ icon: Icon, title, body }) => <div className="info-row" key={title}><Icon size={23} strokeWidth={1.5} /><h3>{title}</h3><p>{body}</p><ArrowUpRight size={18} /></div>)}
          </div>
        </section>
      </main>

      <footer className="site-footer"><div className="footer-main"><div><span className="footer-mark">dd<span>✳</span></span><p>{t.footerText}</p></div><div className="footer-links"><a href={process.env.NEXT_PUBLIC_PERSONAL_URL || "http://127.0.0.1:4321"}>{t.personal}<ArrowUpRight size={17} /></a><a href="http://127.0.0.1:8345/control/">{t.navAdmin}<ArrowUpRight size={17} /></a></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} DD STUDIO</span><span>{t.footerLabel}</span></div></footer>
    </>
  );
}
