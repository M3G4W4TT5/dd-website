"use client";

import { DateTime } from "luxon";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { canManageBooking, cancellationDeadline } from "@/lib/cancellation";
import { ReschedulePicker, type AvailableInterval } from "./ReschedulePicker";

type Language = "da" | "en";
export type ManagedBooking = {
  reference: string;
  firstHourIso: string;
  endIso: string;
  paidOre: number;
  status: "paid" | "cancelled";
  refund: "none" | "pending" | "done" | "failed";
};

const copy = {
  da: {
    preview: "DEMO · INGEN RIGTIG BOOKING ELLER REFUSION ÆNDRES",
    title: "Administrer din booking",
    reference: "Bookingreference",
    time: "Tid i studiet",
    paid: "Betalt",
    deadline: "Ændring og gratis afbestilling lukker",
    bookingStatus: "Booking",
    refundStatus: "Refusion",
    active: "Bekræftet",
    cancelled: "Afbestilt",
    none: "Ikke påbegyndt",
    pending: "Afventer",
    done: "Gennemført",
    failed: "Kræver hjælp fra studiet",
    late: "Der er 24 timer eller mindre til den første bookede time. Du kan ikke længere ændre eller afbestille her. Kontakt studiet, hvis du har brug for hjælp.",
    unavailable: "Online ændring og afbestilling er midlertidigt utilgængelig. Kontakt studiet for hjælp.",
    refundInProgress: "En refusion er registreret for denne booking. Kontakt studiet, hvis bookingens status ikke stemmer.",
    choose: "Hvad vil du gøre?",
    change: "Ændr dato eller tidspunkt",
    changeDescription: "Flyt din booking til et andet ledigt tidsrum af samme længde.",
    cancelDescription: "Få refusion efter bookingvilkårene.",
    changeTitle: "Vælg et nyt tidsrum",
    changeIntro: "Din nuværende booking beholdes, indtil ændringen er bekræftet.",
    confirmChange: "Bekræft nyt tidspunkt",
    changing: "Ændrer…",
    changed: "Din booking er flyttet til det nye tidsrum.",
    changeError: "Ændringen kunne ikke bekræftes. Åbn siden igen for at se den aktuelle booking, eller kontakt studiet.",
    backToChoices: "Tilbage til muligheder",
    cancel: "Afbestil din booking",
    contact: "Kontakt studiet",
    dialogTitle: "Afbestil din booking?",
    dialogBody: "Dine bookede timer frigives. Refusionen igangsættes til den oprindelige betalingsmetode; den kan tage tid at gennemføre.",
    amount: "Beløb til refusion",
    back: "Behold bookingen",
    working: "Afbestiller…",
    error: "Afbestillingen kunne ikke bekræftes. Åbn siden igen for at se booking- og refusionsstatus, eller kontakt studiet.",
    refundNote: "Bookingen er afbestilt. Refusionens status vises særskilt.",
  },
  en: {
    preview: "DEMO · NO REAL BOOKING OR REFUND IS CHANGED",
    title: "Manage your booking",
    reference: "Booking reference",
    time: "Studio time",
    paid: "Paid",
    deadline: "Changes and free cancellation close",
    bookingStatus: "Booking",
    refundStatus: "Refund",
    active: "Confirmed",
    cancelled: "Cancelled",
    none: "Not started",
    pending: "Pending",
    done: "Completed",
    failed: "Studio follow-up needed",
    late: "There are 24 hours or less until the first booked hour. You can no longer change or cancel here. Contact the studio if you need help.",
    unavailable: "Online changes and cancellation are temporarily unavailable. Contact the studio for help.",
    refundInProgress: "A refund is recorded for this booking. Contact the studio if the booking status looks incorrect.",
    choose: "What would you like to do?",
    change: "Change date or time",
    changeDescription: "Move your booking to another available interval of the same length.",
    cancelDescription: "Receive a refund under the booking terms.",
    changeTitle: "Choose a new interval",
    changeIntro: "Your current booking stays in place until the change is confirmed.",
    confirmChange: "Confirm new time",
    changing: "Changing…",
    changed: "Your booking has moved to the new interval.",
    changeError: "The change could not be confirmed. Reopen this page to check your booking, or contact the studio.",
    backToChoices: "Back to options",
    cancel: "Cancel your booking",
    contact: "Contact the studio",
    dialogTitle: "Cancel your booking?",
    dialogBody: "Your booked hours will be released. The refund will be initiated to the original payment method and may take time to complete.",
    amount: "Amount to refund",
    back: "Keep booking",
    working: "Cancelling…",
    error: "Cancellation could not be confirmed. Reopen this page to check the booking and refund status, or contact the studio.",
    refundNote: "The booking is cancelled. Refund progress is shown separately.",
  },
} as const;

function dateTime(iso: string, language: Language) {
  return DateTime.fromISO(iso, { setZone: true }).setZone("Europe/Copenhagen").setLocale(language)
    .toFormat(language === "da" ? "d. LLLL yyyy 'kl.' HH:mm" : "d LLLL yyyy, HH:mm");
}

function money(ore: number, language: Language) {
  return new Intl.NumberFormat(language === "da" ? "da-DK" : "en-DK", {
    style: "currency", currency: "DKK",
  }).format(ore / 100);
}

export function ManageBookingPanel({ initialBooking, serverNowIso, language, preview = false, onChangeBooking, onCancel }: {
  initialBooking: ManagedBooking;
  serverNowIso: string;
  language: Language;
  preview?: boolean;
  onChangeBooking?: (booking: ManagedBooking, interval: AvailableInterval) => Promise<ManagedBooking>;
  onCancel?: (booking: ManagedBooking) => Promise<ManagedBooking>;
}) {
  const t = copy[language];
  const [booking, setBooking] = useState(initialBooking);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [changeError, setChangeError] = useState(false);
  const [changed, setChanged] = useState(false);
  const [flow, setFlow] = useState<"change" | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<AvailableInterval | null>(null);
  const [changing, setChanging] = useState(false);
  const [nowIso, setNowIso] = useState(serverNowIso);
  const clockStart = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deadline = cancellationDeadline(booking.firstHourIso);
  const eligible = booking.status === "paid" && booking.refund === "none" && canManageBooking(booking.firstHourIso, nowIso);
  const currentServerTime = () => new Date(Date.parse(serverNowIso) + (clockStart.current === null ? 0 : performance.now() - clockStart.current)).toISOString();

  useEffect(() => {
    clockStart.current = performance.now();
    const update = () => setNowIso(new Date(Date.parse(serverNowIso) + performance.now() - clockStart.current!).toISOString());
    const timer = window.setInterval(update, 30_000);
    const cutoff = cancellationDeadline(booking.firstHourIso)?.toMillis();
    const remaining = cutoff === undefined ? 0 : cutoff - Date.parse(serverNowIso);
    const cutoffTimer = remaining > 0 && remaining <= 2_147_483_647
      ? window.setTimeout(update, remaining)
      : null;
    return () => {
      window.clearInterval(timer);
      if (cutoffTimer !== null) window.clearTimeout(cutoffTimer);
    };
  }, [booking.firstHourIso, serverNowIso]);

  useEffect(() => {
    if (!confirming) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      cancelButtonRef.current?.focus();
    };
  }, [confirming]);

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && !working) {
      setConfirming(false);
      return;
    }
    if (event.key !== "Tab") return;
    const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const first = buttons[0];
    const last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  async function confirmCancellation() {
    if (!eligible || !canManageBooking(booking.firstHourIso, currentServerTime()) || !onCancel || working) {
      setNowIso(currentServerTime());
      setConfirming(false);
      return;
    }
    setWorking(true);
    setError(false);
    try {
      const updated = await onCancel(booking);
      setBooking(updated);
      setConfirming(false);
    } catch {
      setError(true);
      setConfirming(false);
    } finally {
      setWorking(false);
    }
  }

  async function confirmChange() {
    if (!eligible || !canManageBooking(booking.firstHourIso, currentServerTime()) || !selectedInterval || !onChangeBooking || changing) {
      setNowIso(currentServerTime());
      return;
    }
    setChanging(true);
    setChangeError(false);
    try {
      const updated = await onChangeBooking(booking, selectedInterval);
      setBooking(updated);
      setFlow(null);
      setSelectedInterval(null);
      setChanged(true);
    } catch {
      setChangeError(true);
    } finally {
      setChanging(false);
    }
  }

  return <section className="manage-card" aria-labelledby="managed-booking-title">
    {preview && <p className="manage-preview">{t.preview}</p>}
    <div className="manage-card-heading"><span className="section-kicker">TTD STUDIO / BOOKING</span><h2 id="managed-booking-title">{t.title}</h2></div>
    <dl className="manage-facts">
      <div><dt>{t.reference}</dt><dd>{booking.reference}</dd></div>
      <div><dt>{t.time}</dt><dd>{dateTime(booking.firstHourIso, language)} — {dateTime(booking.endIso, language)}</dd></div>
      <div><dt>{t.paid}</dt><dd>{money(booking.paidOre, language)}</dd></div>
      <div><dt>{t.deadline}</dt><dd>{deadline ? dateTime(deadline.toISO()!, language) : "—"}</dd></div>
    </dl>
    {(booking.status === "cancelled" || booking.refund !== "none") && <div className="manage-statuses" aria-live="polite">
      <p><span>{t.bookingStatus}</span><strong>{booking.status === "paid" ? t.active : t.cancelled}</strong></p>
      <p><span>{t.refundStatus}</span><strong>{t[booking.refund]}</strong></p>
    </div>}
    {booking.status === "cancelled" ? <p className="manage-explanation">{t.refundNote}</p> : <>
      {changed && <p className="manage-success" role="status">{t.changed}</p>}
      {!eligible ? <p className="manage-explanation">{booking.refund === "none" ? t.late : t.refundInProgress}</p> : !onChangeBooking && !onCancel ? <p className="manage-explanation">{t.unavailable} <a className="text-link" href={`/contact?lang=${language}`}>{t.contact}</a></p> : flow === null ? <>
        <h3 className="manage-choice-heading">{t.choose}</h3>
        <div className="manage-choice-grid">
          {onChangeBooking && <button type="button" onClick={() => { const now = currentServerTime(); if (!canManageBooking(booking.firstHourIso, now)) { setNowIso(now); return; } setFlow("change"); setChanged(false); }}><strong>{t.change}</strong><span>{t.changeDescription}</span></button>}
          {onCancel && <button ref={cancelButtonRef} type="button" onClick={() => { const now = currentServerTime(); if (!canManageBooking(booking.firstHourIso, now)) { setNowIso(now); return; } setConfirming(true); setChanged(false); }}><strong>{t.cancel}</strong><span>{t.cancelDescription}</span></button>}
        </div>
      </> : <section className="manage-flow" aria-labelledby="change-booking-title">
        <h3 id="change-booking-title">{t.changeTitle}</h3>
        <p>{t.changeIntro}</p>
        <ReschedulePicker bookingStart={booking.firstHourIso} bookingEnd={booking.endIso} language={language} selected={selectedInterval} onSelect={setSelectedInterval} />
        {changeError && <p className="manage-error" role="alert">{t.changeError}</p>}
        <div className="manage-actions manage-flow-actions"><button type="button" className="manage-back-button" disabled={changing} onClick={() => { setFlow(null); setChangeError(false); }}><ArrowLeft size={18} strokeWidth={1.35} aria-hidden="true" />{t.backToChoices}</button><button type="button" className="button button-dark" disabled={!selectedInterval || changing} onClick={() => void confirmChange()}>{changing ? t.changing : t.confirmChange}</button></div>
      </section>}
      {!eligible && <a className="text-link" href={`/contact?lang=${language}`}>{t.contact}</a>}
    </>}
    {error && <p className="manage-error" role="alert">{t.error}</p>}
    {confirming && <div className="manage-dialog-backdrop"><div ref={dialogRef} className="manage-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title" aria-describedby="cancel-dialog-body" onKeyDown={handleDialogKeyDown}>
      <h3 id="cancel-dialog-title">{t.dialogTitle}</h3>
      <p id="cancel-dialog-body">{t.dialogBody}</p>
      <p className="manage-refund-amount"><span>{t.amount}</span><strong>{money(booking.paidOre, language)}</strong></p>
      <div className="manage-actions"><button type="button" className="button manage-keep-confirm" disabled={working} onClick={() => setConfirming(false)}>{t.back}</button><button type="button" className="button manage-cancel-confirm" disabled={working} onClick={() => void confirmCancellation()}>{working ? t.working : t.cancel}</button></div>
    </div></div>}
  </section>;
}
