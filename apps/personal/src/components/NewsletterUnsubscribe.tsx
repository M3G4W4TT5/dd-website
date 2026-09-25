import { useState, type FormEvent } from "react";

export function NewsletterUnsubscribe() {
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
      const base = import.meta.env.PUBLIC_BOOKING_URL || "http://127.0.0.1:3000";
      const response = await fetch(new URL("/api/marketing", base), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: "personal", action: "unsubscribe", language: "en", email }),
      });
      if (!response.ok) throw new Error("Unsubscribe request failed");
      form.reset();
      setStatus("If this address is subscribed, we'll email an unsubscribe link.");
    } catch { setStatus("Please try later, or reply to a newsletter and ask to unsubscribe."); }
    finally { setSending(false); }
  }
  return <form className="newsletter-unsubscribe-form" onSubmit={submit}>
    <label htmlFor="unsubscribe-email">EMAIL ADDRESS</label>
    <input id="unsubscribe-email" name="email" type="email" autoComplete="email" maxLength={254} required />
    <button type="submit" disabled={sending}>{sending ? "SENDING…" : "SEND UNSUBSCRIBE LINK"}</button>
    <p role="status" aria-live="polite">{status}</p>
  </form>;
}
