import { useState, type FormEvent } from "react";
import { ArrowUpRight } from "lucide-react";

export function ContactPreview() {
  const [reviewed, setReviewed] = useState(false);

  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewed(true);
  }

  return (
    <form className="contact-form" onSubmit={review}>
      <p className="form-disclaimer">TELL DD ABOUT YOUR PROJECT</p>
      <div className="contact-fields">
        <label>YOUR NAME<input type="text" name="name" autoComplete="name" maxLength={100} required placeholder="Name" /></label>
        <label>EMAIL ADDRESS<input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="name@example.com" /></label>
        <label className="field-wide">WHAT IS THIS ABOUT?<select name="subject" required defaultValue=""><option value="" disabled>Choose a topic</option><option value="dance">Dance / performance</option><option value="choreography">Choreography / movement</option><option value="modelling">Modelling / campaign</option><option value="other">Other</option></select></label>
        <label className="field-wide">YOUR MESSAGE<textarea name="message" rows={5} maxLength={2000} required placeholder="Tell DD about your inquiry…" /></label>
      </div>
      <div className="contact-submit"><button type="submit">Review inquiry <ArrowUpRight size={20} /></button><p role="status">{reviewed ? "Fields checked. Contact DD through the links above." : ""}</p></div>
    </form>
  );
}
