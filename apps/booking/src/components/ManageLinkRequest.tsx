"use client";

import { submissionIdentity, submitWithIdentity } from "../lib/submission";

import { useRef, useState, type FormEvent } from "react";

export function ManageLinkRequest({ language }: { language: "da" | "en" }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const da = language === "da";
  const submission = useRef<ReturnType<typeof submissionIdentity> | null>(null);
  submission.current ??= submissionIdentity();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const response = await submitWithIdentity(submission.current!, "/api/manage/request-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.get("email"), language, website: values.get("website") }),
      });
      if (!response.ok) throw new Error("Request failed");
      form.reset();
      setStatus("sent");
    } catch { setStatus("error"); }
  }

  return <form className="manage-link-form" onSubmit={(event) => void submit(event)}>
    <label htmlFor="manage-email">{da ? "E-mailadresse" : "Email address"}</label>
    <input id="manage-email" name="email" type="email" autoComplete="email" maxLength={254} required />
    <div className="manage-honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <button className="button button-dark" type="submit" disabled={status === "sending"}>{status === "sending" ? (da ? "Sender…" : "Sending…") : (da ? "Få et nyt link" : "Get a new link")}</button>
    {status === "sent" && <p role="status">{da ? "Hvis adressen er knyttet til en booking, sender vi et link. Tjek også spam." : "If the address has a booking, we’ll send a link. Check spam too."}</p>}
    {status === "error" && <p role="alert">{da ? "Vi kunne ikke sende linket lige nu. Prøv igen senere." : "We could not send the link right now. Please try again later."}</p>}
  </form>;
}
