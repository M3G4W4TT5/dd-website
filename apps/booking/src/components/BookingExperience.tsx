"use client";

import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coins,
  Maximize2,
  MoveUpRight,
  ShieldCheck,
} from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Availability, Quote, Slot } from "@/lib/booking";
import { MAX_HOURS, quoteInterval, STUDIO_ZONE } from "@/lib/booking";
import { CustomerDetailsPreview } from "@/components/CustomerDetailsPreview";
import { useVisualEffects } from "@/components/useVisualEffects";
import { SiteFooter } from "@/components/SiteFooter";
import { MobileNavigation } from "@/components/MobileNavigation";
import { HeaderBookingActions } from "@/components/HeaderBookingActions";
import { HeaderBlur } from "@/components/HeaderBlur";
import { WarpText } from "@/components/WarpText";

type Language = "da" | "en";

const copy = {
  da: {
    galleryTitle: "STUDIET",
    navEvents: "Events",
    navContact: "Kontakt",
    imageOne: "TTD Studio med skrå hvid væg, trægulv og vinduer",
    imageTwo: "TTD Studio fra den modsatte vinkel med skrå væg og trægulv",
    heroTextBeforeVenue: "TTD Studio er et kreativt træningsrum for dansere hos ",
    heroTextAfterVenue: " på Østerbro. Skabt af Didde-Mie Lykke From og Toniah Pedersen.",
    metricOne: "68 m²",
    metricTwo: "Alle dage · 08–22",
    perHour: "/time",
    bookingTitle: { firstLine: "Tid og rum", secondLinePrefix: "til ", lastWord: "bevægelse." },
    unavailable: "Ledige tider kan ikke indlæses lige nu. Prøv igen senere.",
    pickDate: "01 / VÆLG DATO",
    pickTime: "02 / VÆLG STARTTID",
    pickEnd: "02 / VÆLG SLUTTID (VALGFRIT)",
    fullDay: "Hele dagen",
    multiDayLink: "Kontakt os",
    multiDayText: ", hvis du vil booke mere end én dag.",
    previousWeek: "Forrige uge",
    nextWeek: "Næste uge",
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
    check: "Bekræft tidsrum",
    checking: "Bekræfter…",
    changed: "Tiderne er ændret. Vælg et nyt interval.",
    policy: "Gratis afbestilling indtil 24 timer før første bookede time.",
  },
  en: {
    galleryTitle: "THE STUDIO",
    navEvents: "Events",
    navContact: "Contact",
    imageOne: "TTD Studio with a sloping white wall, wooden floor and windows",
    imageTwo: "TTD Studio from the opposite angle, with a sloping wall and wooden floor",
    heroTextBeforeVenue: "TTD Studio is a creative training room for dancers at ",
    heroTextAfterVenue: " in Østerbro, created by Didde-Mie and Toniah Pedersen.",
    metricOne: "68 m²",
    metricTwo: "Every day · 08–22",
    perHour: "/hour",
    bookingTitle: { firstLine: "Give your idea room to ", secondLinePrefix: "", lastWord: "move." },
    unavailable: "Availability could not be loaded. Please try again later.",
    pickDate: "01 / CHOOSE A DATE",
    pickTime: "02 / CHOOSE A START TIME",
    pickEnd: "02 / CHOOSE AN END TIME (OPTIONAL)",
    fullDay: "Full day",
    multiDayLink: "Contact us",
    multiDayText: " if you want to book more than one day.",
    previousWeek: "Previous week",
    nextWeek: "Next week",
    available: "Available",
    taken: "Unavailable",
    noTimes: "No times on this day. Try another date.",
    loading: "Loading times…",
    summaryEyebrow: "YOUR STUDIO TIME",
    summaryTitle: "Overview",
    selectedDay: "Date",
    selectedHours: "Duration",
    hour: "hour",
    hours: "hours",
    fromTo: "Time",
    chooseStart: "Choose an available start time",
    price: "Total price",
    noQuote: "The selected hours must be consecutive and available.",
    check: "Confirm period",
    checking: "Confirming…",
    changed: "Availability has changed. Choose another interval.",
    policy: "Free cancellation until 24 hours before the first booked hour.",
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
  initialLanguage,
}: {
  initialDate: string;
  initialAvailability: Availability | null;
  initialLanguage: Language;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [weekStart, setWeekStart] = useState(initialDate);
  const [weekTransition, setWeekTransition] = useState<{ phase: "out" | "in"; months: boolean[]; heading: boolean } | null>(null);
  const weekAnimationTimer = useRef<number | null>(null);
  const [date, setDate] = useState(initialDate);
  const [datePath, setDatePath] = useState<string[]>([]);
  const [availability, setAvailability] = useState(initialAvailability);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hours, setHours] = useState(1);
  const [endSelected, setEndSelected] = useState(false);
  const [clearingSlotIds, setClearingSlotIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"idle" | "checked" | "changed" | "error">("idle");
  const [phase, setPhase] = useState<"selection" | "selection-out" | "details" | "details-out">("selection");
  const [hasVisitedDetails, setHasVisitedDetails] = useState(false);
  const [error, setError] = useState(!initialAvailability);
  const availabilityRequest = useRef(0);
  const t = copy[language];
  const today = initialDate;
  const maxDay = DateTime.fromISO(initialDate).plus({ days: 45 }).toISODate()!;

  useEffect(() => () => {
    if (weekAnimationTimer.current !== null) window.clearTimeout(weekAnimationTimer.current);
  }, []);

  useEffect(() => {
    if (phase !== "selection-out" && phase !== "details-out") return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    const timeout = window.setTimeout(() => {
      if (phase === "selection-out") {
        setHasVisitedDetails(true);
        setPhase("details");
      } else {
        setPhase("selection");
      }
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [phase]);

  useEffect(() => {
    if (!clearingSlotIds.length) return;
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120;
    const timeout = window.setTimeout(() => setClearingSlotIds([]), delay);
    return () => window.clearTimeout(timeout);
  }, [clearingSlotIds]);

  useEffect(() => {
    if (!datePath.length) return;
    const timeout = window.setTimeout(() => setDatePath([]), (datePath.length - 1) * 35 + 120);
    return () => window.clearTimeout(timeout);
  }, [datePath]);

  useEffect(() => {
    if (phase !== "details" && !(phase === "selection" && hasVisitedDetails)) return;
    const frame = window.requestAnimationFrame(() => {
      const flow = document.getElementById("booking-flow");
      const focusTarget = document.getElementById(phase === "details" ? "details-title" : "booking-flow");
      if (!flow || !focusTarget) return;
      const headerHeight = document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
      const bounds = flow.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + bounds.top - headerHeight - 16, behavior: "auto" });
      focusTarget.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, hasVisitedDetails]);

  useVisualEffects();

  const week = useMemo(
    () => Array.from({ length: 7 }, (_, index) => DateTime.fromISO(weekStart).plus({ days: index }).toISODate()!),
    [weekStart],
  );
  const current = availability?.date === date ? availability : null;
  const displayedSlots = loading ? availability?.slots : current?.slots;
  const selectedSlot = current?.slots.find((slot) => slot.id === selectedId) || null;
  const quote = current && selectedId ? quoteInterval(current, selectedId, hours) : null;
  function selectTime(slot: Slot) {
    if (!current || !slot.available) return;
    if (!selectedId || endSelected) {
      setClearingSlotIds(endSelected ? quote?.slotIds.filter((id) => id !== slot.id) ?? [] : []);
      setSelectedId(slot.id);
      setHours(1);
      setEndSelected(false);
      setStatus("idle");
      return;
    }
    const ordered = [...current.slots].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const startIndex = ordered.findIndex((entry) => entry.id === selectedId);
    const endIndex = ordered.findIndex((entry) => entry.id === slot.id);
    const nextHours = endIndex - startIndex + 1;
    if (!quoteInterval(current, selectedId, nextHours)) {
      setClearingSlotIds(quote?.slotIds.filter((id) => id !== slot.id) ?? []);
      setSelectedId(slot.id);
      setHours(1);
      setEndSelected(false);
      setStatus("idle");
      return;
    }
    setClearingSlotIds([]);
    setHours(nextHours);
    setEndSelected(true);
    setStatus("idle");
  }

  async function selectDate(nextDate: string, animate = false, nextWeekStart = weekStart) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate < today || nextDate > maxDay) return;
    const fromIndex = week.indexOf(date);
    const nextWeek = Array.from({ length: 7 }, (_, index) => DateTime.fromISO(nextWeekStart).plus({ days: index }).toISODate()!);
    const toIndex = nextWeek.indexOf(nextDate);
    if (animate && fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const direction = Math.sign(toIndex - fromIndex);
      setDatePath(Array.from({ length: Math.abs(toIndex - fromIndex) + 1 }, (_, index) => nextWeek[fromIndex + index * direction]));
    } else {
      setDatePath([]);
    }
    const request = ++availabilityRequest.current;
    setDate(nextDate);
    setSelectedId(null);
    setHours(1);
    setEndSelected(false);
    setClearingSlotIds([]);
    setStatus("idle");
    setLoading(true);
    setError(false);
    const blurDelay = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? Promise.resolve()
      : new Promise<void>((resolve) => window.setTimeout(resolve, 380));
    try {
      const response = await fetch(`/api/availability?date=${encodeURIComponent(nextDate)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Availability request failed");
      const nextAvailability = (await response.json()) as Availability;
      await blurDelay;
      if (availabilityRequest.current === request) setAvailability(nextAvailability);
    } catch {
      await blurDelay;
      if (availabilityRequest.current === request) {
        setAvailability(null);
        setError(true);
      }
    } finally {
      if (availabilityRequest.current === request) setLoading(false);
    }
  }

  function shiftWeek(amount: number) {
    if (weekAnimationTimer.current !== null) return;
    const next = DateTime.fromISO(weekStart).plus({ days: amount }).toISODate()!;
    if (next < today || next > maxDay) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setWeekStart(next);
      void selectDate(next, true, next);
      return;
    }
    const months = week.map((day, index) => DateTime.fromISO(day).toFormat("yyyy-MM") !== DateTime.fromISO(next).plus({ days: index }).toFormat("yyyy-MM"));
    const heading = DateTime.fromISO(weekStart).toFormat("yyyy-MM") !== DateTime.fromISO(next).toFormat("yyyy-MM");
    setWeekTransition({ phase: "out", months, heading });
    weekAnimationTimer.current = window.setTimeout(() => {
      setWeekStart(next);
      void selectDate(next, true, next);
      setWeekTransition({ phase: "in", months, heading });
      weekAnimationTimer.current = window.setTimeout(() => {
        setWeekTransition(null);
        weekAnimationTimer.current = null;
      }, 250);
    }, 250);
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
        if (result.reservationCreated) setStatus("error");
        else {
          setStatus("checked");
          setPhase("selection-out");
        }
      }
    } catch {
      setStatus("error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <HeaderBlur />
        <MobileNavigation language={language} />
        <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
          <a href={`/?lang=${language}`}>Booking</a>
          <a href={`/events?lang=${language}`}>{t.navEvents}</a>
          <a href={`/contact?lang=${language}`}>{t.navContact}</a>
        </nav>
        <a className="brand" href="#top" aria-label="TTD Studio — top">
          <span className="brand-mark" aria-hidden="true" />
        </a>
        <HeaderBookingActions language={language} onLanguageChange={setLanguage} />
      </header>

      <main id="top">
        <section className="booking-section" id="booking" aria-labelledby="booking-title">
          <div className="section-heading booking-heading">
            <div><h1 id="booking-title">{t.bookingTitle.firstLine}{t.bookingTitle.secondLinePrefix && <br />}{t.bookingTitle.secondLinePrefix}<WarpText text={t.bookingTitle.lastWord} /></h1></div>
            <div className="booking-heading-side"><p>{t.heroTextBeforeVenue}<a className="hero-venue-link" href="https://kbhdanser.dk/">København Danser<ArrowUpRight className="hero-venue-arrow" aria-hidden="true" size={12} strokeWidth={1.8} /></a>{t.heroTextAfterVenue}</p></div>
          </div>
          <div id="booking-flow" className={`booking-layout booking-stage ${phase.endsWith("-out") ? "booking-stage--leaving" : phase === "details" || hasVisitedDetails ? "booking-stage--entering" : ""} ${phase === "details" || phase === "details-out" ? "booking-layout--details" : ""}`} tabIndex={-1} inert={phase.endsWith("-out")}>
            {phase === "details" || phase === "details-out" ? (
              <CustomerDetailsPreview key={`${date}:${selectedId}:${hours}`} language={language} date={date} startId={selectedId!} hours={hours} onBack={() => setPhase("details-out")} onConflict={async () => { await selectDate(date); setStatus("changed"); setPhase("selection"); }} />
            ) : <>
            <div className="picker-panel">
              <div className="picker-head"><span>{t.pickDate}</span><CalendarDays size={19} /></div>
              <div className="date-navigation">
                <button type="button" onClick={() => shiftWeek(-7)} disabled={weekStart <= today} aria-label={t.previousWeek}><ChevronLeft size={20} /></button>
                <span className={weekTransition?.heading ? `date-label--${weekTransition.phase}` : undefined}>{DateTime.fromISO(weekStart).setLocale(language).toFormat("LLLL yyyy")}</span>
                <button type="button" onClick={() => shiftWeek(7)} disabled={DateTime.fromISO(weekStart).plus({ days: 7 }).toISODate()! > maxDay} aria-label={t.nextWeek}><ChevronRight size={20} /></button>
              </div>
              <div className="date-strip" inert={weekTransition !== null} aria-busy={weekTransition !== null}>
                {week.map((day, index) => {
                  const value = DateTime.fromISO(day).setLocale(language);
                  const pathIndex = datePath.indexOf(day);
                  const pathClass = pathIndex < 0 ? "" : pathIndex === 0 ? "date-tile--departing" : day === date ? "date-tile--arriving" : "date-tile--passing";
                  return <button key={day} type="button" className={`date-tile ${date === day ? "selected" : ""} ${pathClass}`} style={pathIndex >= 0 ? { animationDelay: `${Math.max(0, pathIndex - 1) * 35}ms` } : undefined} disabled={day > maxDay} onClick={() => void selectDate(day, true)} aria-pressed={date === day}>
                    <span>{value.toFormat("ccc")}</span><strong className={weekTransition ? `date-label--${weekTransition.phase}` : undefined}>{value.day}</strong><small className={weekTransition?.months[index] ? `date-label--${weekTransition.phase}` : undefined}>{value.toFormat("LLL")}</small>
                  </button>;
                })}
              </div>

              <div className="picker-head time-head"><span>{selectedId && !endSelected ? t.pickEnd : t.pickTime}</span><span className="timezone">EUROPE / COPENHAGEN</span></div>
              <span className="time-loading-status" role="status" aria-live="polite">{loading ? t.loading : ""}</span>
              {error && !loading ? <div className="slot-message error-message">{t.unavailable}</div> : !displayedSlots?.length ? <div className="slot-message">{loading ? t.loading : t.noTimes}</div> : (
                <div className="time-slot-area">
                  <div className={`time-grid ${loading ? "time-grid--loading" : ""}`} aria-busy={loading} inert={loading}>
                    {displayedSlots.map((slot: Slot) => {
                      const selectedIndex = quote?.slotIds.indexOf(slot.id) ?? -1;
                      const spread = endSelected && selectedIndex > 0;
                      const clearing = selectedIndex < 0 && clearingSlotIds.includes(slot.id);
                      return <button type="button" key={slot.id} className={`time-slot ${!slot.available ? "time-slot--unavailable" : ""} ${selectedIndex >= 0 ? "selected" : ""} ${spread ? "time-slot--spreading" : ""} ${clearing ? "time-slot--clearing" : ""}`} style={spread ? { animationDelay: `${(selectedIndex - 1) * 35}ms` } : undefined} disabled={loading || !slot.available} onClick={() => selectTime(slot)} aria-pressed={selectedIndex >= 0}>
                        <span className="time-value">{timeLabel(slot.start)}</span>
                        {selectedIndex < 0 && !clearing && <span className="slot-state">{slot.available ? t.available : t.taken}</span>}
                      </button>;
                    })}
                  </div>
                  <div className={`time-loader ${loading ? "time-loader--visible" : ""}`} aria-hidden="true">
                    <div className="time-loader-ping" />
                  </div>
                </div>
              )}
            </div>

            <aside className="summary-panel" aria-labelledby="summary-title">
              <div className="summary-header">
                <div className="summary-heading"><span className="section-kicker">{t.summaryEyebrow}</span><h3 id="summary-title">{t.summaryTitle}</h3></div>
                <div className="summary-fact"><span className="metric-icon"><Clock3 size={17} strokeWidth={1.4} /></span><span>{t.metricTwo}</span></div>
                <div className="summary-fact"><span className="metric-icon"><Coins size={17} strokeWidth={1.4} /></span><span>{current?.slots[0] ? `${money(current.slots[0].priceOre, language)}${t.perHour}` : "—"}</span></div>
                <div className="summary-fact"><span className="metric-icon"><Maximize2 size={17} strokeWidth={1.4} /></span><span>{t.metricOne}</span></div>
              </div>
              <div className="summary-content">
                <div className="summary-row"><span>{t.selectedDay}</span><strong>{dateLabel(date, language)}</strong></div>
                <div className="summary-row"><span>{t.selectedHours}</span><strong>{quote ? hours === MAX_HOURS ? t.fullDay : `${hours} ${hours === 1 ? t.hour : t.hours}` : "—"}</strong></div>
                <div className="summary-row"><span>{t.fromTo}</span><strong>{quote ? `${timeLabel(quote.start)} — ${timeLabel(quote.end)}` : selectedSlot ? t.noQuote : t.chooseStart}</strong></div>
                <div className="summary-total"><span>{t.price}</span><strong>{quote ? money(quote.totalOre, language) : "—"}</strong></div>
                <button className="button button-check" type="button" onClick={() => void checkSelection()} disabled={!quote || checking}>{checking ? t.checking : t.check}<MoveUpRight size={18} /></button>
                <p className="multi-day-note"><a href={`/contact?lang=${language}`}>{t.multiDayLink}</a>{t.multiDayText}</p>
                {(status === "changed" || status === "error") && <p className={`check-result ${status}`} role="status">{status === "changed" ? t.changed : t.unavailable}</p>}
              </div>
              <div className="summary-footer"><ShieldCheck size={18} /><span>{t.policy} <a href={`/terms?lang=${language}`}>{language === "da" ? "Bookingvilkår" : "Booking terms"}</a></span></div>
            </aside>
            </>}
          </div>
        </section>

        <section className="studio-gallery-section" aria-labelledby="studio-gallery-title">
          <h2 className="studio-gallery-title" id="studio-gallery-title">{t.galleryTitle}</h2>
          <div className="hero-gallery">
            <figure className="hero-photo hero-photo-wide">
              <div className="image-frame" data-image-shadow data-reveal><img src="/studio/ttd-studio-01-booking-wide.webp" loading="lazy" alt={t.imageOne} /></div>
            </figure>
            <figure className="hero-photo hero-photo-detail">
              <div className="image-frame" data-image-shadow data-reveal><img src="/studio/ttd-studio-03-booking-angle.webp" loading="lazy" alt={t.imageTwo} /></div>
            </figure>
          </div>
        </section>
      </main>

      <SiteFooter language={language} />
    </>
  );
}
