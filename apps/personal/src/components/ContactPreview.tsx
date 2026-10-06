import type {CopyGroup} from "../cms/model";
import { useFormsAvailable, formEndpoint, PreviewFormsNotice } from "../lib/forms";
import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

function invalidContactFields(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".contact-fields :is(input, select, textarea):not([name=website])"))
    .filter((field) => !field.checkValidity()).map((field) => field.name);
}

export function ContactPreview({copy, formsCopy}: {copy: CopyGroup<"contact">; formsCopy: CopyGroup<"forms">}) {
  const available = useFormsAvailable();
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available) return;
    const form = event.currentTarget;
    const invalid = invalidContactFields(form);
    setInvalidFields(invalid);
    if (invalid.length) {
      form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${invalid[0]}"]`)?.focus();
      return;
    }
    const fields = new FormData(form);
    setSending(true);
    setStatus("");
    try {
      const response = await fetch(formEndpoint("/api/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site: "personal",
          name: fields.get("name"),
          email: fields.get("email"),
          subject: fields.get("subject"),
          message: fields.get("message"),
          website: fields.get("website"),
        }),
      });
      if (!response.ok) throw new Error("Delivery failed");
      form.reset();
      setInvalidFields([]);
      setStatus(copy.success);
    } catch {
      setStatus(copy.error);
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="contact-form" noValidate onInput={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onChange={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onSubmit={submit}>
      <PreviewFormsNotice available={available} copy={formsCopy} />
      <div className="contact-fields">
        <label>{copy.nameLabel}<input type="text" name="name" autoComplete="name" maxLength={100} required placeholder={copy.namePlaceholder} aria-invalid={invalidFields.includes("name")} /></label>
        <label>{copy.emailLabel}<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder={copy.emailPlaceholder} aria-invalid={invalidFields.includes("email")} /></label>
        <label className="field-wide">{copy.subjectLabel}<select name="subject" required defaultValue="" aria-invalid={invalidFields.includes("subject")}><option value="" disabled>{copy.subjectPlaceholder}</option><option value="dance">{copy.dance}</option><option value="choreography">{copy.choreography}</option><option value="modelling">{copy.modelling}</option><option value="brand_partnerships">{copy.brand_partnerships}</option><option value="other">{copy.other}</option></select></label>
        <label className="field-wide">{copy.messageLabel}<textarea name="message" rows={5} maxLength={2000} required placeholder={copy.messagePlaceholder} aria-invalid={invalidFields.includes("message")} /></label>
        <label className="contact-honeypot" aria-hidden="true">{formsCopy.honeypot}<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {invalidFields.length > 0 && <p className="contact-validation-error" role="alert">{copy.validation}</p>}
      <div className="contact-submit"><button type="submit" disabled={sending || !available}>{sending ? copy.sending : copy.send} <ArrowUpRight size={20} /></button><p role="status" aria-live="polite">{status}</p></div>
      <p className="form-privacy">{copy.privacyBefore} <a href="/privacy">{copy.privacyLink}</a>{copy.privacyAfter}</p>
    </form>
  );
}
