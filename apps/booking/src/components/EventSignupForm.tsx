"use client";

import { submissionIdentity, submitWithIdentity } from "../lib/submission";

import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BuyerDetailsFields, DetailsConsent, invalidDetailFields } from "./BookingFormFields";
import { useMobileJourney } from "./useMobileJourney";
import { JourneyProgress } from "./MobileStudioPicker";
import type { BookingDetailsDraft } from "./CustomerDetailsPreview";
import { ticketLimit } from "@/lib/event-registration";
import { ZONE, type Language, type Occurrence } from "@/lib/events-model";

const copy = {
  en: {
    back: "Back to event", eyebrow: "YOUR DETAILS", title: "Sign up for the event.",
    intro: "Enter your details and choose how many tickets you would like. All tickets will be sent to your email.",
    name: "Name", email: "Email", phone: "Phone", quantity: "Number of tickets", ticket: "Ticket type", total: "Total",
    phoneInvalid: "Enter a valid phone number for the selected country code.",
    submit: "Continue to payment", working: "Checking tickets…",
    invalid: "Complete or correct the highlighted fields to continue.", changed: "Ticket availability or the price has changed. Refresh the event before continuing.",
    error: "Checkout could not be started. Please try again.", rate: "Please wait a moment before trying again.",
    accept: "Accept", terms: "terms", privacy: "privacy policy", max: "max", termsRequired: "Accept terms & privacy policy to continue.",
    marketing: "Email me TTD Studio offers, new events and discounts from TOTAL ENTERTAINMENT.",
    marketingFailed: "We could not start your TTD Studio email signup. You can continue to payment without it.", continue: "Continue to payment",
  },
  da: {
    back: "Tilbage til event", eyebrow: "DINE OPLYSNINGER", title: "Tilmeld dig eventet.",
    intro: "Indtast dine oplysninger, og vælg antal billetter. Alle billetter sendes til din e-mail.",
    name: "Navn", email: "E-mail", phone: "Telefon", quantity: "Antal billetter", ticket: "Billettype", total: "I alt",
    phoneInvalid: "Indtast et gyldigt telefonnummer med den valgte landekode.",
    submit: "Fortsæt til betaling", working: "Tjekker billetter…",
    invalid: "Udfyld eller ret de markerede felter for at fortsætte.", changed: "Antallet af ledige billetter eller prisen har ændret sig. Genindlæs eventet, før du fortsætter.",
    error: "Betaling kunne ikke startes. Prøv igen.", rate: "Vent et øjeblik, før du prøver igen.",
    accept: "Acceptér", terms: "vilkår", privacy: "privatlivspolitik", max: "maks.", termsRequired: "Acceptér vilkår og privatlivspolitik for at fortsætte.",
    marketing: "Send mig e-mails fra TOTAL ENTERTAINMENT om TTD Studio-tilbud, nye events og rabatter.",
    marketingFailed: "Tilmeldingen til TTD Studio-mails kunne ikke gennemføres. Du kan fortsætte til betaling uden den.", continue: "Fortsæt til betaling",
  },
};
type Handoff = { action: string; fields: Record<string, string>; marketingRequested: boolean | null };

function submitCart(handoff: Handoff) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = handoff.action;
  form.hidden = true;
  for (const [name, value] of Object.entries(handoff.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  form.remove();
}

export function EventSignupForm({ occurrence, language, onBack, draft }: {
  occurrence: Occurrence; language: Language; onBack: () => void; draft: BookingDetailsDraft;
}) {
  const t = copy[language];
  const mobile = useMobileJourney();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const next = language === "da" ? "Fortsæt" : "Continue";
  const back = language === "da" ? "Tilbage" : "Back";
  const formRef = useRef<HTMLFormElement>(null);
  const submission = useRef<ReturnType<typeof submissionIdentity> | null>(null);
  submission.current ??= submissionIdentity();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const eligible = occurrence.tickets.filter(ticket => !ticket.hasVariations && ticketLimit(ticket, occurrence.remaining) >= ticket.minPerOrder);
  const [itemId, setItemId] = useState(Number(draft.fields.itemId) || eligible[0]?.id);
  const ticket = eligible.find(item => item.id === itemId) || eligible[0];
  const [quantity, setQuantity] = useState<string>(draft.fields.quantity || String(ticket?.minPerOrder ?? 1));
  const [showQuantityLimit, setShowQuantityLimit] = useState(false);
  const maximum = ticket ? ticketLimit(ticket, occurrence.remaining) : 0;
  const [termsAccepted, setTermsAccepted] = useState(draft.termsAccepted);
  const [marketingOptIn, setMarketingOptIn] = useState(draft.marketingOptIn);
  const [showTermsError, setShowTermsError] = useState(false);
  const [invalidFields, setInvalidFields] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "working" | "invalid" | "changed" | "error" | "rate" | "phoneInvalid">("idle");
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const submitting = useRef(false);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); if (mobile) titleRef.current?.closest(".event-signup")?.scrollIntoView({ block: "start", behavior: "instant" }); }, [step, mobile]);
  useEffect(() => { draft.fields.itemId = String(itemId ?? ""); draft.fields.quantity = quantity; draft.termsAccepted = termsAccepted; draft.marketingOptIn = marketingOptIn; }, [draft, itemId, quantity, termsAccepted, marketingOptIn]);
  function remember(form: HTMLFormElement) { for (const [name, value] of new FormData(form)) if (typeof value === "string") draft.fields[name] = value; }

  const formatPrice = (price: number) => new Intl.NumberFormat(language === "da" ? "da-DK" : "en-US", { style: "currency", currency: "DKK" }).format(price);
  const start = DateTime.fromISO(occurrence.start, { setZone: true }).setZone(ZONE).setLocale(language);
  const end = DateTime.fromISO(occurrence.end, { setZone: true }).setZone(ZONE);
  const count = Number(quantity);
  const validQuantity = ticket && Number.isInteger(count) && count >= ticket.minPerOrder && count <= ticketLimit(ticket, occurrence.remaining);

  async function checkout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mobile && step !== 3) { if (validQuantity) setStep(step === 1 ? 2 : 3); return; }
    if (submitting.current || !ticket) return;
    const form = event.currentTarget;
    const invalid = invalidDetailFields(form);
    const values = new FormData(form);
    setInvalidFields([...new Set(invalid)]);
    setShowTermsError(!termsAccepted);
    if (invalid.length || !termsAccepted) {
      form.querySelector<HTMLInputElement>(invalid.length ? `[name="${invalid[0]}"]` : "#event-terms")?.focus();
      return;
    }
    submitting.current = true;
    setStatus("working");
    try {
      const response = await submitWithIdentity(submission.current!, "/api/events/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: occurrence.slug, dateId: occurrence.dateId, itemId: ticket.id, quantity: count, unitPrice: ticket.price,
          language, name: values.get("name"), email: values.get("email"), phone: values.get("phone"), phoneCountry: values.get("phoneCountry"), termsAccepted, marketingOptIn }),
      });
      if (!response.ok) {
        if (response.status === 422) setInvalidFields(["phone"]);
        setStatus(response.status === 422 ? "phoneInvalid" : response.status === 409 ? "changed" : response.status === 400 ? "invalid" : response.status === 429 ? "rate" : "error");
        return;
      }
      const result = await response.json() as Handoff;
      if (result.marketingRequested === false) {
        setHandoff(result);
        setStatus("idle");
      } else {
        submitCart(result);
      }
    } catch { setStatus("error"); }
    finally { submitting.current = false; }
  }

  return <section className={`details-preview event-signup ${mobile ? "event-signup--guided" : ""}`} aria-labelledby="event-signup-title">
    {mobile && <JourneyProgress language={language} labels={language === "da" ? ["Event og dato", "Billetter", "Overblik", "Dine oplysninger", "Betaling"] : ["Event and date", "Tickets", "Review", "Your details", "Payment"]} index={step} />}
    <div className="details-intro event-signup-heading">
      <button className="details-back" type="button" onClick={() => mobile && step > 1 ? setStep(step === 3 ? 2 : 1) : onBack()} disabled={status === "working"}><ArrowLeft size={17} aria-hidden="true" />{mobile ? back : t.back}</button>
      <span className="section-kicker">{mobile && step < 3 ? (step === 1 ? t.ticket : language === "da" ? "OVERBLIK" : "REVIEW") : t.eyebrow}</span>
      <h3 id="event-signup-title" ref={titleRef} tabIndex={-1}>{mobile && step < 3 ? (step === 1 ? t.ticket : language === "da" ? "Gennemgå dine billetter" : "Review your tickets") : t.title}</h3>
      </div>
    <div className="details-intro" hidden={mobile && step === 1}>
      {(!mobile || step === 3) && <p>{t.intro}</p>}
      <div className="event-signup-summary">
        <strong>{language === "da" ? occurrence.title : occurrence.titleEn}</strong>
        <p>{start.toLocaleString({ weekday: "long", day: "numeric", month: "long", year: "numeric" })}<br />{start.toFormat("HH:mm")}–{end.toFormat("HH:mm")}</p>
        <p>{(language === "da" ? occurrence.location : occurrence.locationEn) || "TTD Studio"}</p>
        {mobile && ticket && <p className="event-selected-ticket">{language === "da" ? ticket.name : ticket.nameEn}</p>}
        {ticket && <p>{validQuantity ? `${count} × ${formatPrice(Number(ticket.price))}` : formatPrice(Number(ticket.price))}</p>}
        <div className="event-signup-total" aria-live="polite"><span>{t.total}</span><strong>{validQuantity ? formatPrice(count * Number(ticket.price)) : "—"}</strong></div>
      </div>
    </div>
    <form ref={formRef} className="details-form" noValidate onSubmit={event => void checkout(event)} onInput={event => { remember(event.currentTarget); if (invalidFields.length) setInvalidFields(invalidDetailFields(event.currentTarget)); setHandoff(null); }}>
      <fieldset className="event-signup-fields" disabled={status === "working"}>
        <div className="details-fields">
          <div className="event-buyer-fields" hidden={mobile && step !== 3}><BuyerDetailsFields labels={t} invalidFields={invalidFields} language={language} defaults={draft.fields} /></div>
          <div className="event-ticket-fields" hidden={mobile && step !== 1}>
          {eligible.length > 1 && <label>{t.ticket}<select name="itemId" value={ticket?.id} onChange={event => { const item = eligible.find(item => item.id === Number(event.target.value))!; setItemId(item.id); setQuantity(String(item.minPerOrder)); setShowQuantityLimit(false); }}>
            {eligible.map(item => <option key={item.id} value={item.id}>{language === "da" ? item.name : item.nameEn} · {formatPrice(Number(item.price))}</option>)}
          </select></label>}
          <label>{t.quantity}<input name="quantity" type="number" inputMode="numeric" min={ticket?.minPerOrder ?? 1} max={maximum} aria-describedby={showQuantityLimit ? "event-quantity-limit" : undefined} step={1} required value={quantity} onChange={event => { const value = event.target.value; const overMaximum = Number(value) > maximum; setQuantity(overMaximum ? String(maximum) : value); setShowQuantityLimit(overMaximum); if (overMaximum) setInvalidFields(fields => fields.filter(field => field !== "quantity")); }} aria-invalid={invalidFields.includes("quantity")} /></label>
          </div>
        </div>
        {showQuantityLimit && <p id="event-quantity-limit" className="form-field-error" role="alert">{maximum} {t.max}</p>}
        {invalidFields.length > 0 && <p className="form-field-error" role="alert">{t.invalid}</p>}
        {invalidFields.includes("phone") && <p id="phone-field-error" className="form-field-error" role="alert">{t.phoneInvalid}</p>}
        <div hidden={mobile && step !== 3}><DetailsConsent idPrefix="event" marketingLabel={t.marketing} termsLabel={<>{t.accept} <a href={`/terms?lang=${language}`}>{t.terms}</a> {language === "en" ? "&" : "og"} <a href={`/privacy?lang=${language}`}>{t.privacy}</a>.</>} termsError={t.termsRequired} marketingOptIn={marketingOptIn} termsAccepted={termsAccepted} showTermsError={showTermsError} onMarketingChange={setMarketingOptIn} onTermsChange={checked => { setTermsAccepted(checked); if (checked) setShowTermsError(false); }} /></div>
        {mobile && step < 3 ? <div className="journey-actions"><button type="button" disabled={!validQuantity} onClick={() => setStep(step === 1 ? 2 : 3)}>{next}</button></div> : <div className="details-actions"><button type="submit" disabled={!ticket || status === "working" || !!handoff}>{status === "working" ? t.working : t.submit}<ArrowUpRight size={19} aria-hidden="true" /></button></div>}
      </fieldset>
      {status !== "idle" && status !== "working" && <p className={`details-status ${status}`} role="alert">{t[status]}</p>}
      {handoff && <div className="marketing-result" role="status"><p>{t.marketingFailed}</p><div className="details-actions"><button type="button" onClick={() => submitCart(handoff)}>{t.continue}<ArrowUpRight size={19} aria-hidden="true" /></button></div></div>}
    </form>
  </section>;
}
