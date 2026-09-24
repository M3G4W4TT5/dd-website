import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

export function ContactPreview() {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
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
      setStatus("Your message has been sent. Thank you!");
    } catch {
      setStatus("Your message could not be sent. Please try again later.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <p className="form-disclaimer">TELL DD ABOUT YOUR PROJECT</p>
      <div className="contact-fields">
        <label>YOUR NAME<input type="text" name="name" autoComplete="name" maxLength={100} required placeholder="Name" /></label>
        <label>EMAIL ADDRESS<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="name@example.com" /></label>
        <label className="field-wide">WHAT IS THIS ABOUT?<select name="subject" required defaultValue=""><option value="" disabled>Choose a topic</option><option value="dance">Dance / performance</option><option value="choreography">Choreography</option><option value="modelling">Modelling</option><option value="brand_partnerships">Brand partnerships</option><option value="other">Other</option></select></label>
        <label className="field-wide">YOUR MESSAGE<textarea name="message" rows={5} maxLength={2000} required placeholder="Tell DD about your inquiry…" /></label>
        <label className="contact-honeypot" aria-hidden="true">Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="contact-submit"><button type="submit" disabled={sending}>{sending ? "Sending…" : "Send inquiry"} <ArrowUpRight size={20} /></button><p role="status" aria-live="polite">{status}</p></div>
      <p className="form-privacy">We use your details to reply. <a href="/privacy">Read the privacy policy</a>.</p>
    </form>
  );
}
