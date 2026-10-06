import type {CopyGroup} from "../cms/model";
import { useFormsAvailable, formEndpoint, PreviewFormsNotice } from "../lib/forms";
import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

export function NewsletterSignup({copy, formsCopy}: {copy: CopyGroup<"newsletter">; formsCopy: CopyGroup<"forms">}) {
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
      setStatus(copy.success);
    } catch {
      setStatus(copy.error);
    } finally { setSending(false); }
  }

  return <div className="newsletter-signup" id="newsletter">
    <p>{copy.intro}</p>
    <PreviewFormsNotice available={available} copy={formsCopy} />
    <form onSubmit={submit}>
      <label htmlFor="newsletter-email">{copy.emailLabel}</label>
      <div className="newsletter-fields"><input id="newsletter-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder={copy.emailPlaceholder} /><button type="submit" disabled={sending || !available}>{sending ? copy.sending : copy.send}<ArrowUpRight size={18} /></button></div>
      <label className="newsletter-honeypot" aria-hidden="true">{formsCopy.honeypot}<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
    </form>
    <small>{copy.notice} <a href="/privacy">{copy.privacy}</a> · <a href="/unsubscribe">{copy.unsubscribe}</a></small>
    <p className="newsletter-status" role="status" aria-live="polite">{status}</p>
  </div>;
}
