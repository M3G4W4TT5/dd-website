"use client";
import { DateTime } from "luxon";
import { useEffect, useRef, useState } from "react";
import { STUDIO_ZONE, type Availability, type Quote } from "@/lib/booking";
import { studioEndChoices, studioProgress, type StudioStep } from "@/lib/mobile-journey";

import { MobileMonthCalendar } from "./MobileMonthCalendar";

type Language = "da" | "en";
const copy = {
 en: {entry:"Book the Studio",date:"Select a date",start:"Select a start time",more:"Add more hours?",end:"Select an end time",review:"Review the booking",details:"Your details",payment:"Payment",yes:"Yes",no:"No — one hour",back:"Back",next:"Continue",loading:"Loading times…",unavailable:"Availability could not be loaded. Please try again later.",empty:"No times on this day. Try another date.",changed:"Availability has changed. Choose another interval.",error:"The check could not be completed right now.",checking:"Confirming…",previous:"Previous week",following:"Next week",step:"Step",of:"of",total:"Total price",duration:"Duration",hours:"hours",hour:"hour",policy:"Free cancellation until 24 hours before the first booked hour."},
 da: {entry:"Book studiet",date:"Vælg dato",start:"Vælg starttid",more:"Vil du tilføje flere timer?",end:"Vælg sluttid",review:"Gennemgå bookingen",details:"Dine oplysninger",payment:"Betaling",yes:"Ja",no:"Nej — én time",back:"Tilbage",next:"Fortsæt",loading:"Henter tider…",unavailable:"Ledige tider kan ikke indlæses lige nu. Prøv igen senere.",empty:"Ingen tider denne dag. Prøv en anden dato.",changed:"Tiderne er ændret. Vælg et nyt interval.",error:"Tjekket kunne ikke gennemføres lige nu.",checking:"Bekræfter…",previous:"Forrige uge",following:"Næste uge",step:"Trin",of:"af",total:"Samlet pris",duration:"Varighed",hours:"timer",hour:"time",policy:"Gratis afbestilling indtil 24 timer før første bookede time."},
};
export function JourneyProgress({ language, labels, index }: {language: Language; labels: string[]; index: number}) {
 const t = copy[language];
 return <div className="journey-progress" aria-label={`${t.step} ${index + 1} ${t.of} ${labels.length}`}><span>{t.step} {index + 1} {t.of} {labels.length} · {labels[index]}</span><progress max={labels.length} value={index + 1} /></div>;
}
export function MobileStudioPicker({language,step,setStep,more,onMore,date,today,maxDay,availability,startId,quote,loading,error,checking,status,onDate,onStart,onEnd,onCheck}: {
 language:Language;step:StudioStep;setStep:(step:StudioStep)=>void;more:boolean|null;onMore:(more:boolean)=>void;
 date:string;today:string;maxDay:string;availability:Availability|null;startId:string|null;quote:Quote|null;
 loading:boolean;error:boolean;checking:boolean;status:string;onDate:(date:string)=>void;onStart:(id:string)=>void;onEnd:(hours:number)=>void;onCheck:()=>void;
}) {
 const t = copy[language];
 const [month, setMonth] = useState(() => DateTime.fromISO(date).startOf("month").toISODate()!);
 const heading = useRef<HTMLHeadingElement>(null);
 const progress = studioProgress(more);
 const endChoices = studioEndChoices(availability,startId);
 const time = (iso:string)=>DateTime.fromISO(iso).setZone(STUDIO_ZONE).toFormat("HH:mm");
 useEffect(()=>{ if(step === "entry")return;const target=heading.current;target?.focus({preventScroll:true});target?.closest(".mobile-journey")?.scrollIntoView({block:"start",behavior:"instant"}); },[step]);
 if(step === "entry")return <div className="mobile-studio-entry"><button className="button button-dark" type="button" onClick={()=>setStep("date")}>{t.entry}</button></div>;
 const labels = progress.map(value=>t[value as keyof typeof t]);
 const valid = step === "date" ? !loading && !!availability && !error : step === "start" ? !!quote : step === "more" ? more !== null : step === "end" ? !!quote && quote.hours > 1 : !!quote;
 const next = ()=>{ if(step === "review")onCheck();else setStep(step === "date"?"start":step === "start"?"more":step === "more"?(more?"end":"review"):"review"); };
 const back = ()=>setStep(step === "date"?"entry":step === "start"?"date":step === "more"?"start":step === "end"?"more":more?"end":"more");
 return <section className="mobile-journey" aria-labelledby="mobile-studio-title" aria-busy={loading || checking}>
  <JourneyProgress language={language} labels={labels} index={progress.indexOf(step)} />
  <h2 ref={heading} tabIndex={-1} id="mobile-studio-title" className="mobile-journey-heading">{t[step]}</h2>
  {step === "date" && <><MobileMonthCalendar language={language} month={month} onMonth={setMonth} date={date} min={today} max={maxDay} onDate={onDate} status={day => ({text: day === date ? (loading ? "…" : error ? "!" : availability?.slots.some(slot => slot.available) ? "✓" : "–") : "", description: day === date ? (loading ? t.loading : error ? t.unavailable : availability?.slots.some(slot => slot.available) ? (language === "da" ? "Ledige tider" : "Times available") : t.empty) : (language === "da" ? "Vælg for at se ledige tider" : "Select to check availability")})} /><p className="mobile-calendar-key">{language === "da" ? "Vælg en dato for at se ledige tider · ✓ ledig · – ingen tider" : "Select a date to check availability · ✓ available · – no times"}</p></>}
  {step === "start" && <div className="journey-options journey-times">{availability?.slots.map(slot=><button key={slot.id} type="button" disabled={!slot.available} aria-pressed={slot.id===startId} onClick={()=>onStart(slot.id)}>{time(slot.start)}</button>)}</div>}
  {step === "more" && <div className="journey-options"><button type="button" aria-pressed={more===false} onClick={()=>onMore(false)}>{t.no}</button><button type="button" aria-pressed={more===true} disabled={!endChoices.length} onClick={()=>onMore(true)}>{t.yes}</button></div>}
  {step === "end" && <div className="journey-options journey-times">{endChoices.map(choice=><button key={choice.hours} type="button" aria-pressed={quote?.hours===choice.hours} onClick={()=>onEnd(choice.hours)}>{time(choice.end)}</button>)}</div>}
  {step === "review" && quote && <div className="journey-review"><p>{DateTime.fromISO(date).setLocale(language).toLocaleString({weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p><strong>{time(quote.start)}–{time(quote.end)}</strong><p>{t.duration}: {quote.hours} {quote.hours===1?t.hour:t.hours}</p><p>{t.total}: <strong>{new Intl.NumberFormat(language==="da"?"da-DK":"en-DK",{style:"currency",currency:"DKK"}).format(quote.totalOre/100)}</strong></p><p>{t.policy}</p></div>}
  {loading && <p role="status">{t.loading}</p>}{error && <p role="alert">{t.unavailable}</p>}{!loading && availability && !availability.slots.some(slot=>slot.available) && <p>{t.empty}</p>}
  {(status==="changed" || status==="error") && <p role="alert">{t[status]}</p>}
  <div className="journey-actions"><button type="button" disabled={checking} onClick={back}>{t.back}</button><button type="button" disabled={!valid || checking} onClick={next}>{checking?t.checking:t.next}</button></div>
 </section>;
}
