"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useVisualEffects } from "./useVisualEffects";
import { SiteFooter } from "./SiteFooter";
import { MobileNavigation } from "./MobileNavigation";
import { HeaderBookingActions } from "./HeaderBookingActions";
import { ZONE, checkoutPath, type Language, type Occurrence } from "@/lib/events-model";
import type { Catalog } from "@/lib/events";

type Props = { catalog: Catalog; selected?: Occurrence; initialLanguage: Language };
const words = {
  da: { events: "Events", contact: "Kontakt", title: "Det sker i studiet.", intro: "Se kommende aktiviteter og vælg den dato, der passer dig.", upcoming: "KOMMENDE DATOER", calendar: "Kalender", list: "Liste", back: "Alle events", location: "Sted", time: "Tid", tickets: "Billetter", places: "pladser tilbage", signup: "Vælg billet hos pretix", sold: "Udsolgt", closed: "Billetsalget er ikke åbent", test: "Testevent · ingen rigtige betalinger", conflict: "Rummet er optaget af en eksisterende booking.", gate: "Tilmelding åbner, når billetsalg og rumplan er verificeret.", empty: "Der er ingen offentlige kommende events endnu.", setup: "Eventkalenderen afventer pretix-opsætning.", error: "Events kan ikke indlæses lige nu. Prøv igen senere.", description: "Beskrivelse følger.", previous: "Forrige måned", next: "Næste måned", previousEvents: "Forrige events", nextEvents: "Næste events", of: "af", preview: "TTD STUDIO · EVENTKALENDER" },
  en: { events: "Events", contact: "Contact", title: "What's on at the studio.", intro: "Browse upcoming activities and choose the date that suits you.", upcoming: "UPCOMING DATES", calendar: "Calendar", list: "List", back: "All events", location: "Location", time: "Time", tickets: "Tickets", places: "places left", signup: "Choose tickets on pretix", sold: "Sold out", closed: "Ticket sales are not open", test: "Test event · no real payments", conflict: "The room is occupied by an existing booking.", gate: "Signup opens after ticket sales and room scheduling are verified.", empty: "There are no public upcoming events yet.", setup: "The event calendar is waiting for pretix setup.", error: "Events could not be loaded. Please try again later.", description: "Description to follow.", previous: "Previous month", next: "Next month", previousEvents: "Previous events", nextEvents: "Next events", of: "of", preview: "TTD STUDIO · EVENT CALENDAR" },
};
const EVENTS_PER_PAGE = 6;
function localDay(iso: string) { return DateTime.fromISO(iso, { setZone: true }).setZone(ZONE); }
function dateText(iso: string, lang: Language) { return localDay(iso).setLocale(lang).toLocaleString({ weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function timeText(iso: string) { return localDay(iso).toFormat("HH:mm"); }
function priceText(value: string, lang: Language) { return new Intl.NumberFormat(lang === "da" ? "da-DK" : "en-US", { style: "currency", currency: "DKK" }).format(Number(value)); }
function href(item: Occurrence, lang: Language) { return `/events/${encodeURIComponent(item.slug)}/${item.dateId ?? "single"}?lang=${lang}`; }
export function EventsExperience({ catalog, selected, initialLanguage }: Props) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [month, setMonth] = useState(() => catalog.occurrences.length ? localDay(catalog.occurrences[0].start).startOf("month") : DateTime.now().setZone(ZONE).startOf("month"));
  const [listPage, setListPage] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useVisualEffects();
  useEffect(() => { document.documentElement.lang = language; localStorage.setItem("ttd-language", language); }, [language]);
  const t = words[language];
  const pageCount = Math.ceil(catalog.occurrences.length / EVENTS_PER_PAGE);
  const currentPage = Math.min(listPage, Math.max(0, pageCount - 1));
  const firstEvent = currentPage * EVENTS_PER_PAGE;
  const lastEvent = Math.min(firstEvent + EVENTS_PER_PAGE, catalog.occurrences.length);
  const pageRange = lastEvent === firstEvent + 1 ? `${lastEvent}` : `${firstEvent + 1}–${lastEvent}`;
  const visibleEvents = catalog.occurrences.slice(firstEvent, firstEvent + EVENTS_PER_PAGE);
  function changeListPage(nextPage: number) {
    setListPage(nextPage);
    listRef.current?.scrollIntoView({ block: "start" });
  }
  const days = useMemo(() => {
    const first = month.startOf("month");
    const offset = first.weekday - 1;
    return Array.from({ length: Math.ceil((offset + first.daysInMonth!) / 7) * 7 }, (_, i) => first.minus({ days: offset }).plus({ days: i }));
  }, [month]);
  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    for (const item of catalog.occurrences) {
      const day = localDay(item.start).toISODate()!;
      map.set(day, [...(map.get(day) || []), item]);
    }
    return map;
  }, [catalog.occurrences]);
  const shop = (() => {
    if (!selected || !catalog.shopBase || !catalog.checkoutEnabled) return null;
    const configured = new URL(catalog.shopBase);
    const publicUrl = selected.shopUrl ? new URL(selected.shopUrl) : null;
    const base = publicUrl?.origin === configured.origin ? publicUrl! : new URL(checkoutPath(catalog.organizer, selected).replace(/^\//, ""), configured.href.endsWith("/") ? configured.href : `${configured.href}/`);
    if (publicUrl?.origin === configured.origin && selected.dateId !== null) base.searchParams.set("subevent", String(selected.dateId));
    return base.href;
  })();
  const canBuy = selected?.status === "available" && selected.roomVerified && catalog.checkoutEnabled && shop;
  return <>
    <div className="preview-bar"><span className="preview-dot" />{t.preview}</div>
    <header className="site-header event-header">
      <MobileNavigation language={language} currentPage="events" />
      <nav className="desktop-nav" aria-label={language === "da" ? "Hovednavigation" : "Main navigation"}>
        <a href="/#booking">Booking</a><a href={`/events?lang=${language}`} aria-current={selected ? undefined : "page"}>{t.events}</a><a href={`/contact?lang=${language}`}>{t.contact}</a>
      </nav>
      <a className="brand" href="/" aria-label="TTD Studio — home"><span className="brand-mark">TTD<br />STUDIO</span></a>
      <HeaderBookingActions language={language} onLanguageChange={setLanguage} />
    </header>
    <main className="events-main">
      {selected ? <>
        <div className="events-heading"><a className="events-back" href={`/events?lang=${language}`}>← {t.back}</a><span className="section-kicker">{t.upcoming}</span><h1>{language === "da" ? selected.title : selected.titleEn}</h1><p>{dateText(selected.start, language)} · {timeText(selected.start)}–{timeText(selected.end)}</p></div>
        <div className="event-detail-grid">
          <div>{selected.image && <div className="image-frame event-image" data-image-shadow data-reveal><img src={selected.image} alt={`${language === "da" ? "Foto til" : "Photo for"} ${language === "da" ? selected.title : selected.titleEn}`} /></div>}<section className="event-description"><h2>{language === "da" ? selected.title : selected.titleEn}</h2><p>{(language === "da" ? selected.description : selected.descriptionEn) || t.description}</p></section></div>
          <aside className="event-facts"><div><span>{t.time}</span><strong>{dateText(selected.start, language)}<br />{timeText(selected.start)}–{timeText(selected.end)} · Copenhagen</strong></div><div><span>{t.location}</span><strong>{(language === "da" ? selected.location : selected.locationEn) || "TTD Studio"}</strong></div><div><span>{t.tickets}</span>{selected.tickets.length ? selected.tickets.map((ticket, index) => <strong key={index}>{language === "da" ? ticket.name : ticket.nameEn} · {priceText(ticket.price, language)}{ticket.remaining !== null && <> · {ticket.remaining} {t.places}</>}</strong>) : <strong>—</strong>}</div>
            {canBuy ? <a className="event-cta" href={shop}>{t.signup}<ArrowUpRight size={20} /></a> : <p className="event-gate" role="status">{selected.status === "sold-out" ? t.sold : selected.status === "not-on-sale" ? t.closed : selected.status === "test" ? t.test : selected.status === "room-conflict" ? t.conflict : t.gate}</p>}
          </aside>
        </div>
      </> : <>
        <div className="events-heading"><h1>{t.title}</h1><p>{t.intro}</p></div>
        {catalog.state !== "ready" ? <p className="events-message" role="status">{catalog.state === "setup" ? t.setup : t.error}</p> : catalog.occurrences.length === 0 ? <p className="events-message" role="status">{t.empty}</p> : <section className="events-section" aria-label={t.events}>
          <div className="events-list" ref={listRef} key={currentPage}>{visibleEvents.map((item, index) => {
            const date = localDay(item.start).setLocale(language);
            return <a className="event-row" key={item.key} href={href(item, language)} style={{ animationDelay: `${index * 45}ms` }}><time dateTime={item.start}><span className="event-day-number">{date.toFormat("dd")}</span><span>{date.toFormat("LLL")}</span></time><span className="event-row-details"><strong>{language === "da" ? item.title : item.titleEn}</strong><small>{timeText(item.start)}–{timeText(item.end)} · {(language === "da" ? item.location : item.locationEn) || "TTD Studio"}</small></span><span className="event-row-status">{item.status === "sold-out" ? t.sold : item.status === "test" ? t.test : item.status === "not-on-sale" ? t.closed : item.status === "room-conflict" ? t.conflict : "↗"}</span></a>;
          })}</div>
          {pageCount > 1 && <nav className="events-list-pagination" aria-label={language === "da" ? "Sider med events" : "Event pages"}><button type="button" aria-label={t.previousEvents} disabled={currentPage === 0} onClick={() => changeListPage(currentPage - 1)}><ChevronLeft aria-hidden="true" /></button><span aria-live="polite">{pageRange} {t.of} {catalog.occurrences.length}</span><button type="button" aria-label={t.nextEvents} disabled={currentPage >= pageCount - 1} onClick={() => changeListPage(currentPage + 1)}><ChevronRight aria-hidden="true" /></button></nav>}
          <div className="events-toolbar"><h2>{t.calendar}</h2><div><button aria-label={t.previous} onClick={() => setMonth(month.minus({ months: 1 }))}><ChevronLeft /></button><strong>{month.setLocale(language).toLocaleString({ month: "long", year: "numeric" })}</strong><button aria-label={t.next} onClick={() => setMonth(month.plus({ months: 1 }))}><ChevronRight /></button></div></div>
          <div className="events-calendar" role="group" aria-label={`${t.calendar} ${month.toFormat("yyyy-MM")}`}>
            {Array.from({ length: 7 }, (_, i) => <div className="calendar-weekday" key={i}>{month.setLocale(language).startOf("week").plus({ days: i }).toFormat("ccc")}</div>)}
            {days.map(day => <div className={`calendar-day ${day.month !== month.month ? "other-month" : ""}`} key={day.toISODate()} role="group" aria-label={day.setLocale(language).toLocaleString(DateTime.DATE_FULL)}><span>{day.day}</span>{(byDay.get(day.toISODate()!) || []).map(item => <a key={item.key} href={href(item, language)}><strong>{language === "da" ? item.title : item.titleEn}</strong><small>{timeText(item.start)}</small></a>)}</div>)}
          </div>
        </section>}
      </>}
    </main>
    <SiteFooter language={language} links={[{ href: "/", label: "Booking" }, { href: `/contact?lang=${language}`, label: t.contact }]} />
  </>;
}
