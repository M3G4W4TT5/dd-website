"use client";

import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";

type Language = "da" | "en";

const copy = {
  da: {
    eyebrow: "04 / DINE OPLYSNINGER",
    title: "Gør din booking klar.",
    intro: "Dette trin afprøver felterne og tjekker tiderne igen. Dine oplysninger bliver ikke gemt, og ingen booking oprettes.",
    name: "Navn",
    email: "E-mail",
    phone: "Telefon",
    type: "Jeg booker som",
    private: "Privatperson",
    instructor: "Underviser / instruktør",
    business: "Virksomhed",
    attendeeCount: "Antal deltagere",
    purpose: "Formål med bookingen",
    company: "Virksomhedens navn",
    comment: "Kommentar / særlige ønsker",
    optional: "Valgfrit",
    placeholderType: "Vælg type",
    review: "Gennemgå oplysninger",
    reviewing: "Tjekker oplysninger…",
    initial: "Dette er en lokal forhåndsvisning. Ingen oplysninger sendes til DD.",
    success: "Felterne er gyldige, og tiderne var ledige ved seneste tjek. Ingen reservation, betaling eller besked blev oprettet.",
    invalid: "Kontrollér oplysningerne og prøv igen.",
    changed: "Tiderne er ikke længere ledige. Vælg et nyt interval.",
    error: "Tjekket kunne ikke gennemføres lige nu.",
    occupancy: "Det endelige deltagerloft afventer DD.",
    checkout: "Betaling og endelig booking bliver først åbnet efter integration og test.",
  },
  en: {
    eyebrow: "04 / YOUR DETAILS",
    title: "Prepare your booking.",
    intro: "This step validates the fields and checks the hours again. Your details are not stored, and no booking is created.",
    name: "Name",
    email: "Email",
    phone: "Phone",
    type: "I am booking as",
    private: "Private customer",
    instructor: "Teacher / instructor",
    business: "Business",
    attendeeCount: "Number of participants",
    purpose: "Purpose of booking",
    company: "Company name",
    comment: "Comment / special requests",
    optional: "Optional",
    placeholderType: "Choose type",
    review: "Review details",
    reviewing: "Checking details…",
    initial: "This is a local preview. No details are sent to DD.",
    success: "The fields are valid, and the hours were free at the last check. No reservation, payment, or message was created.",
    invalid: "Check the details and try again.",
    changed: "These hours are no longer free. Choose another interval.",
    error: "The check could not be completed right now.",
    occupancy: "DD has not confirmed the final occupancy limit.",
    checkout: "Payment and final booking will open after integration and testing.",
  },
} as const;

export function CustomerDetailsPreview({
  language,
  date,
  startId,
  hours,
  onConflict,
}: {
  language: Language;
  date: string;
  startId: string;
  hours: number;
  onConflict: () => Promise<void>;
}) {
  const t = copy[language];
  const [customerType, setCustomerType] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "success" | "invalid" | "changed" | "error">("idle");

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setStatus("working");
    try {
      const response = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          startId,
          hours,
          details: {
            name: values.get("name"),
            email: values.get("email"),
            phone: values.get("phone"),
            customerType: values.get("customerType"),
            attendeeCount: Number(values.get("attendeeCount")),
            purpose: values.get("purpose"),
            company: values.get("company") || "",
            comment: values.get("comment") || "",
          },
        }),
      });
      if (response.status === 409) {
        setStatus("changed");
        await onConflict();
      } else if (response.status === 400) {
        setStatus("invalid");
      } else if (!response.ok) {
        setStatus("error");
      } else {
        const result = (await response.json()) as {
          detailsAccepted: boolean;
          reservationCreated: boolean;
          paymentStarted: boolean;
        };
        setStatus(result.detailsAccepted && !result.reservationCreated && !result.paymentStarted ? "success" : "error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <section className="details-preview" id="booking-details" aria-labelledby="details-title">
      <div className="details-intro"><span className="section-kicker">{t.eyebrow}</span><h3 id="details-title">{t.title}</h3><p>{t.intro}</p><div className="details-reminder"><ShieldCheck size={17} />{t.checkout}</div></div>
      <form className="details-form" onSubmit={(event) => void review(event)}>
        <div className="details-fields">
          <label>{t.name}<input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required /></label>
          <label>{t.email}<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label>{t.phone}<input name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={30} required /></label>
          <label>{t.type}<select name="customerType" value={customerType} onChange={(event) => setCustomerType(event.target.value)} required><option value="" disabled>{t.placeholderType}</option><option value="private">{t.private}</option><option value="instructor">{t.instructor}</option><option value="business">{t.business}</option></select></label>
          <label>{t.attendeeCount}<input name="attendeeCount" type="number" inputMode="numeric" min={1} max={100} step={1} required /><small>{t.occupancy}</small></label>
          <label>{t.purpose}<input name="purpose" type="text" maxLength={150} minLength={2} required /></label>
          {customerType === "business" && <label className="details-wide">{t.company}<input name="company" type="text" maxLength={150} required /></label>}
          <label className="details-wide">{t.comment} <span>({t.optional})</span><textarea name="comment" rows={3} maxLength={2000} /></label>
        </div>
        <div className="details-actions"><button type="submit" disabled={status === "working"}>{status === "working" ? t.reviewing : t.review}<ArrowUpRight size={19} /></button><p className={`details-status ${status}`} role="status">{status === "success" ? t.success : status === "invalid" ? t.invalid : status === "changed" ? t.changed : status === "error" ? t.error : t.initial}</p></div>
      </form>
    </section>
  );
}
