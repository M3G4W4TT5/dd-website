"use client";
import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";
import { STUDIO_ZONE, type Availability, type Quote } from "@/lib/booking";
import { studioEndChoices, studioProgress, studioRangeChanges, type StudioStep } from "@/lib/mobile-journey";

import { useMonthAvailability } from "./useMonthAvailability";
import { MobileMonthCalendar } from "./MobileMonthCalendar";

type Language = "da" | "en";
const copy = {
 en: {entry:"Book the Studio",date:"Select a date",start:"Select a start time",end:"Select an end time",review:"Review the booking",details:"Your details",payment:"Payment",back:"Back",next:"Continue",loading:"Loading times…",unavailable:"Availability could not be loaded. Please try again later.",empty:"No times on this day. Try another date.",changed:"Availability has changed. Choose another interval.",error:"The check could not be completed right now.",checking:"Confirming…",previous:"Previous week",following:"Next week",step:"Step",of:"of",total:"Total price",duration:"Duration",hours:"hours",hour:"hour",policy:"Free cancellation until 24 hours before the first booked hour."},
 da: {entry:"Book studiet",date:"Vælg dato",start:"Vælg starttid",end:"Vælg sluttid",review:"Gennemgå bookingen",details:"Dine oplysninger",payment:"Betaling",back:"Tilbage",next:"Fortsæt",loading:"Henter tider…",unavailable:"Ledige tider kan ikke indlæses lige nu. Prøv igen senere.",empty:"Ingen tider denne dag. Prøv en anden dato.",changed:"Tiderne er ændret. Vælg et nyt interval.",error:"Tjekket kunne ikke gennemføres lige nu.",checking:"Bekræfter…",previous:"Forrige uge",following:"Næste uge",step:"Trin",of:"af",total:"Samlet pris",duration:"Varighed",hours:"timer",hour:"time",policy:"Gratis afbestilling indtil 24 timer før første bookede time."},
};
export function JourneyProgress({ language, labels, index }: {language: Language; labels: string[]; index: number}) {
 const t = copy[language];
 return <div className="journey-progress" aria-label={`${t.step} ${index + 1} ${t.of} ${labels.length}`}><span>{t.step} {index + 1} {t.of} {labels.length} · {labels[index]}</span><progress max={labels.length} value={index + 1} /></div>;
}
export function MobileStudioPicker({language,step,setStep,endSelected,date,today,maxDay,availability,startId,quote,loading,error,checking,status,onDate,onStart,onEnd,onCheck}: {
 language:Language;step:StudioStep;setStep:(step:StudioStep)=>void;endSelected:boolean;
 date:string;today:string;maxDay:string;availability:Availability|null;startId:string|null;quote:Quote|null;
 loading:boolean;error:boolean;checking:boolean;status:string;onDate:(date:string)=>void;onStart:(id:string)=>void;onEnd:(hours:number)=>void;onCheck:()=>void;
}) {
 const t = copy[language];
 const [month, setMonth] = useState(() => DateTime.fromISO(date).startOf("month").toISODate()!);
 const days = useMonthAvailability(month, today, maxDay, step === "date");
 const timeGrid = availability ? [...availability.slots.map(slot => ({iso: slot.start, slot})), ...(availability.slots.length ? [{iso: availability.slots.at(-1)!.end, slot: undefined}] : [])] : [];
 const [rangeMotion, setRangeMotion] = useState<{ revision: number; tiles: Record<string, { filling: boolean; delay: number }> }>({ revision: 0, tiles: {} });
 useEffect(() => {
   const changes = Object.values(rangeMotion.tiles);
   if (!changes.length) return;
   const timeout = window.setTimeout(() => setRangeMotion(current => ({ ...current, tiles: {} })), Math.max(...changes.map(tile => tile.delay)) + 120);
   return () => window.clearTimeout(timeout);
 }, [rangeMotion]);
 function selectEnd(hours: number) {
   const changes = studioRangeChanges(endSelected ? quote?.hours ?? 0 : 0, hours);
   const tiles: Record<string, { filling: boolean; delay: number }> = {};
   if (quote && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
     for (const change of changes) {
       const boundary = timeGrid.find(({ iso }) => Date.parse(iso) === Date.parse(quote.start) + change.offset * 3600000);
       if (boundary) tiles[boundary.iso] = change;
     }
   }
   setRangeMotion(current => ({ revision: current.revision + 1, tiles }));
   onEnd(hours);
 }
 const heading = useRef<HTMLHeadingElement>(null);
 const progress = studioProgress();
 const endChoices = studioEndChoices(availability,startId);
 const time = (iso:string)=>DateTime.fromISO(iso).setZone(STUDIO_ZONE).toFormat("HH:mm");
 useEffect(()=>{ if(step === "entry")return;const target=heading.current;target?.focus({preventScroll:true});if (step !== "end") target?.closest(".mobile-journey")?.scrollIntoView({block:"start",behavior:"instant"}); },[step]);
 if(step === "entry")return <div className="mobile-studio-entry"><button className="button button-dark" type="button" onClick={()=>setStep("date")}>{t.entry}</button></div>;
 const labels = progress.map(value=>t[value as keyof typeof t]);
 const valid = step === "date" ? !loading && !!availability?.slots.some(slot => slot.available) && !error : step === "start" ? !!quote : step === "end" ? !!quote && endSelected : !!quote;
 const next = ()=>{ if(step === "review")onCheck();else setStep(step === "date"?"start":step === "start"?"end":"review"); };
 const back = ()=>setStep(step === "date"?"entry":step === "start"?"date":step === "end"?"start":"end");
 return <section className="mobile-journey" aria-labelledby="mobile-studio-title" aria-busy={loading || checking}>
  <JourneyProgress language={language} labels={labels} index={progress.indexOf(step)} />
  <h2 ref={heading} tabIndex={-1} id="mobile-studio-title" className="mobile-journey-heading">{t[step]}</h2>
  {step === "date" && <><MobileMonthCalendar language={language} month={month} onMonth={setMonth} date={date} min={today} max={maxDay} onDate={onDate} status={day => {
    const entry = day === date ? (loading ? undefined : error ? null : availability ?? undefined) : days[day];
    const available = entry?.slots.some(slot => slot.available);
    return {text: "", description: entry === undefined ? t.loading : entry === null ? t.unavailable : available ? (language === "da" ? "Ledige tider" : "Times available") : t.empty, disabled: !available, unavailable: !!entry && !available};
  }} /></>}
  {(step === "start" || step === "end") && <div className="journey-options journey-times">{timeGrid.map(({iso, slot}) => {
    const choice = endChoices.find(choice => choice.end === iso);
    const selectingEnd = step === "end";
    const selected = selectingEnd && !!quote && (iso === quote.start || (endSelected && iso > quote.start && iso <= quote.end));
    const disabled = selectingEnd ? !choice : !slot?.available;
    const motion = selectingEnd ? rangeMotion.tiles[iso] : undefined;
    return <button key={iso} type="button" disabled={disabled}
      className={selected ? "journey-time-selected" : !selectingEnd && slot && !slot.available ? "is-unavailable" : undefined}
      aria-pressed={selectingEnd ? selected : slot?.id === startId}
      onClick={() => { if (selectingEnd && choice) selectEnd(choice.hours); else if (slot) { setRangeMotion(current => ({ ...current, tiles: {} })); onStart(slot.id); } }}><span key={motion ? rangeMotion.revision : "idle"} className={motion ? motion.filling ? "time-slot--spreading" : "journey-time--clearing" : undefined} style={motion ? { animationDelay: `${motion.delay}ms` } : undefined}>{time(iso)}</span></button>;
  })}</div>}
  {step === "review" && quote && <div className="journey-review"><p>{DateTime.fromISO(date).setLocale(language).toLocaleString({weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p><strong>{time(quote.start)}–{time(quote.end)}</strong><p>{t.duration}: {quote.hours} {quote.hours===1?t.hour:t.hours}</p><p>{t.total}: <strong>{new Intl.NumberFormat(language==="da"?"da-DK":"en-DK",{style:"currency",currency:"DKK"}).format(quote.totalOre/100)}</strong></p><p>{t.policy}</p></div>}
  {loading && <p role="status">{t.loading}</p>}{error && <p role="alert">{t.unavailable}</p>}{!loading && availability && !availability.slots.some(slot=>slot.available) && <p>{t.empty}</p>}
  {(status==="changed" || status==="error") && <p role="alert">{t[status]}</p>}
  <div className="journey-actions"><button type="button" disabled={checking} onClick={back}>{t.back}</button><button type="button" disabled={!valid || checking} onClick={next}>{checking?t.checking:t.next}</button></div>
 </section>;
}
