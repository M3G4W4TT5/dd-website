"use client";

import { useState, type FormEvent } from "react";

export function MarketingUnsubscribe({ list, language }: { list: "personal" | "booking"; language: "da" | "en" }) {
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const email = new FormData(form).get("email");
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/marketing", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list, action: "unsubscribe", language, email }),
      });
      if (!response.ok) throw new Error("Unsubscribe request failed");
      setStatus(language === "da" ? "Hvis adressen er tilmeldt, modtager du en e-mail med et afmeldingslink." : "If this address is subscribed, we'll email an unsubscribe link.");
      form.reset();
    } catch { setStatus(language === "da" ? "Prøv igen senere, eller svar på en af vores e-mails og bed om afmelding." : "Please try later, or reply to one of our emails and ask to unsubscribe."); }
    finally { setSending(false); }
  }
  return <form onSubmit={submit} className="marketing-unsubscribe-form">
    <label htmlFor="marketing-unsubscribe-email">{language === "da" ? "E-mailadresse" : "Email address"}</label>
    <input id="marketing-unsubscribe-email" name="email" type="email" autoComplete="email" maxLength={254} required />
    <button type="submit" disabled={sending}>{language === "da" ? "Send afmeldingslink" : "Send unsubscribe link"}</button>
    <p role="status" aria-live="polite">{status}</p>
  </form>;
}
