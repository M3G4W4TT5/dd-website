"use client";

import { useState } from "react";

export function MarketingAction({ list, purpose, token, language }: { list: "personal" | "booking"; purpose: "confirm" | "unsubscribe"; token: string; language: "da" | "en" }) {
  const [state, setState] = useState<"ready" | "working" | "done" | "expired" | "error">("ready");
  const isPersonal = list === "personal";
  const da = language === "da" && !isPersonal;
  const title = purpose === "confirm" ? (da ? "Bekræft din tilmelding" : "Confirm your email signup") : (da ? "Afmeld e-mails" : "Unsubscribe from emails");
  async function submit() {
    setState("working");
    try {
      const response = await fetch("/api/marketing/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list, purpose, token }),
      });
      setState(response.ok ? "done" : response.status === 410 ? "expired" : "error");
    } catch { setState("error"); }
  }
  return <main className="marketing-page">
    <span>{isPersonal ? "DD PRODUCTION" : "TTD STUDIO"}</span>
    <h1>{title}</h1>
    <p>{purpose === "confirm"
      ? (da ? "Bekræft, at du vil modtage e-mails om TTD Studio-tilbud, nye events og rabatter." : `Confirm that you want ${isPersonal ? "DD's newsletter about her work and dance videos" : "TTD Studio emails about offers, new events and discounts"}.`)
      : (da ? "Stop e-mails om TTD Studio-tilbud, nye events og rabatter til denne adresse." : `Stop ${isPersonal ? "DD newsletter" : "TTD Studio promotional"} emails to this address.`)}</p>
    {state === "ready" && <button type="button" onClick={() => void submit()}>{purpose === "confirm" ? (da ? "Bekræft tilmelding" : "Confirm signup") : (da ? "Afmeld" : "Unsubscribe")}</button>}
    {state === "working" && <p role="status">{da ? "Arbejder…" : "Working…"}</p>}
    {state === "done" && <p role="status">{purpose === "confirm" ? (da ? "Din tilmelding er bekræftet." : "Your signup is confirmed.") : (da ? "Du er nu afmeldt." : "You have been unsubscribed.")}</p>}
    {state === "expired" && <p role="status">{da ? "Linket er udløbet eller er allerede brugt." : "This link has expired or has already been used."}</p>}
    {state === "error" && <p role="alert">{da ? "Vi kunne ikke gennemføre anmodningen. Prøv igen senere." : "We could not complete this request. Please try again later."}</p>}
    <a href={isPersonal ? "https://didde-mie.com" : "/"}>{da ? "Tilbage til TTD Studio" : `Back to ${isPersonal ? "DD" : "TTD Studio"}`}</a>
  </main>;
}
