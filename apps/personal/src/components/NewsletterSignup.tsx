import { useFormsAvailable, formEndpoint, PreviewFormsNotice } from "../lib/forms";
import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

export function NewsletterSignup() {
  const available = useFormsAvailable();
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    setSending(true);
    setStatus("");
    try {
      const response = await fetch(formEndpoint("/api/marketing"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: "personal", action: "subscribe", language: "en", email: values.get("email"), website: values.get("website") }),
      });
      if (!response.ok) throw new Error("Signup failed");
      form.reset();
      setStatus("Check your inbox for a confirmation link. If you're already subscribed, you're all set.");
    } catch {
      setStatus("We couldn't start your signup right now. Please try again later.");
    } finally { setSending(false); }
  }

  return <div className="newsletter-signup" id="newsletter">
    <p>Sign up for my newsletter where I share updates on my work and dance videos!</p>
    <PreviewFormsNotice available={available} />
    <form onSubmit={submit}>
      <label htmlFor="newsletter-email">EMAIL ADDRESS</label>
      <div className="newsletter-fields"><input id="newsletter-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" /><button type="submit" disabled={sending || !available}>{sending ? "SENDING…" : "SIGN UP"}<ArrowUpRight size={18} /></button></div>
      <label className="newsletter-honeypot" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
    </form>
    <small>DD Production will email you to confirm. Unsubscribe at any time. <a href="/privacy">Privacy policy</a> · <a href="/unsubscribe">Unsubscribe</a></small>
    <p className="newsletter-status" role="status" aria-live="polite">{status}</p>
  </div>;
}
