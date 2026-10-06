"use client";

import { useEffect, useRef, useState } from "react";
import { ManageBookingLinks } from "./ManageBookingLinks";
import type { ManagedBookingSummary } from "../lib/managed-booking-summary";

export function ManageLinkAccess({ language }: { language: "da" | "en" }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "idle" | "opening" | "ready" | "expired" | "error">("loading");
  const [bookings, setBookings] = useState<ManagedBookingSummary[]>([]);
  const initialized = useRef(false);
  const da = language === "da";

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    window.history.replaceState(null, "", `/manage/access?lang=${language}`);
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) { setToken(value); setStatus("idle"); }
    else setStatus("expired");
  }, [language]);

  async function openLinks() {
    if (status === "opening") return;
    setStatus("opening");
    try {
      const response = await fetch("/api/manage/access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.status === 404) { setStatus("expired"); return; }
      if (!response.ok) throw new Error("Request failed");
      const data = await response.json() as { bookings: ManagedBookingSummary[] };
      setBookings(data.bookings);
      setStatus("ready");
    } catch { setStatus("error"); }
  }

  return <>
    <p className="manage-intro">{da ? "Åbn din booking med det nye link. Linket kan kun bruges én gang og udløber efter 15 minutter." : "Open your booking with the new link. This link works once and expires after 15 minutes."}</p>
    {status === "idle" || status === "opening" ? <button className="button button-dark" type="button" disabled={status === "opening"} onClick={() => void openLinks()}>{status === "opening" ? (da ? "Åbner…" : "Opening…") : (da ? "Åbn mine bookinger" : "Open my bookings")}</button> : null}
    {status === "ready" && <ManageBookingLinks bookings={bookings} language={language} />}
    {status === "expired" && <p role="alert">{da ? "Linket er udløbet eller er allerede brugt. Bed om et nyt link på administrer booking-siden." : "This link has expired or was already used. Request another on the manage booking page."}</p>}
    {status === "error" && <p role="alert">{da ? "Bookingerne kunne ikke åbnes lige nu. Prøv igen." : "Bookings could not be opened right now. Please try again."}</p>}
    {(status === "expired" || status === "error") && <a className="text-link" href={`/manage?lang=${language}`}>{da ? "Administrer booking" : "Manage booking"}</a>}
  </>;
}
