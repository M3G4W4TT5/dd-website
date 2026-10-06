import type {CopyGroup} from "../cms/model";
import { useFormsAvailable, formEndpoint, PreviewFormsNotice } from "../lib/forms";
import { useState, type FormEvent } from "react";

export function NewsletterUnsubscribe({copy, formsCopy}: {copy: CopyGroup<"unsubscribe">; formsCopy: CopyGroup<"forms">}) {
  const available = useFormsAvailable();
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const email = new FormData(form).get("email");
    setSending(true);
    setStatus("");
    try {
      const response = await fetch(formEndpoint("/api/marketing"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: "personal", action: "unsubscribe", language: "en", email }),
      });
      if (!response.ok) throw new Error("Unsubscribe request failed");
      form.reset();
      setStatus(copy.success);
    } catch { setStatus(copy.error); }
    finally { setSending(false); }
  }
  return <form className="newsletter-unsubscribe-form" onSubmit={submit}>
    <PreviewFormsNotice available={available} copy={formsCopy} />
    <label htmlFor="unsubscribe-email">{copy.emailLabel}</label>
    <input id="unsubscribe-email" name="email" type="email" autoComplete="email" maxLength={254} required />
    <button type="submit" disabled={sending || !available}>{sending ? copy.sending : copy.send}</button>
    <p role="status" aria-live="polite">{status}</p>
  </form>;
}
