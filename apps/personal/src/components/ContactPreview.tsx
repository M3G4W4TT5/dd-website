import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

function invalidContactFields(form: HTMLFormElement): string[] {
  return Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(".contact-fields :is(input, select, textarea):not([name=website])"))
    .filter((field) => !field.checkValidity()).map((field) => field.name);
}

export function ContactPreview() {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [invalidFields, setInvalidFields] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      const bookingUrl = import.meta.env.PUBLIC_BOOKING_URL || "http://127.0.0.1:3000";
      const response = await fetch(new URL("/api/contact", bookingUrl), {
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
      setStatus("Your message has been sent. Thank you!");
    } catch {
      setStatus("Your message could not be sent. Please try again later.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="contact-form" noValidate onInput={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onChange={(event) => { if (invalidFields.length) setInvalidFields(invalidContactFields(event.currentTarget)); }} onSubmit={submit}>
      <p className="form-disclaimer">TELL DD ABOUT YOUR PROJECT</p>
      <div className="contact-fields">
        <label>YOUR NAME<input type="text" name="name" autoComplete="name" maxLength={100} required placeholder="Name" aria-invalid={invalidFields.includes("name")} /></label>
        <label>EMAIL ADDRESS<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="name@example.com" aria-invalid={invalidFields.includes("email")} /></label>
        <label className="field-wide">WHAT IS THIS ABOUT?<select name="subject" required defaultValue="" aria-invalid={invalidFields.includes("subject")}><option value="" disabled>Choose a topic</option><option value="dance">Dance / performance</option><option value="choreography">Choreography</option><option value="modelling">Modelling</option><option value="brand_partnerships">Brand partnerships</option><option value="other">Other</option></select></label>
        <label className="field-wide">YOUR MESSAGE<textarea name="message" rows={5} maxLength={2000} required placeholder="Tell DD about your inquiry…" aria-invalid={invalidFields.includes("message")} /></label>
        <label className="contact-honeypot" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {invalidFields.length > 0 && <p className="contact-validation-error" role="alert">Complete or correct the highlighted fields before sending.</p>}
      <div className="contact-submit"><button type="submit" disabled={sending}>{sending ? "Sending…" : "Send inquiry"} <ArrowUpRight size={20} /></button><p role="status" aria-live="polite">{status}</p></div>
      <p className="form-privacy">We use your details to reply. <a href="/privacy">Read the privacy policy</a>.</p>
    </form>
  );
}
