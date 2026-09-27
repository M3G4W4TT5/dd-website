import { database, transaction, enqueue } from "@dd/database";
import type { ManagedBooking, Language } from "@dd/contracts";
import type { Pool } from "pg";
let pool: Pool | undefined;
export function bookingDb() {
  return (pool ??= database(process.env.BOOKING_DATABASE_URL ?? ""));
}
export function payloadKey() {
  const key = process.env.PAYLOAD_KEY;
  if (!key || !/^[0-9a-f]{64}$/.test(key))
    throw new Error("Booking payload key missing");
  return key;
}
export async function intakeWebhook(p: {
  notification_id: string | number;
  organizer: string;
  event: string;
  code: string;
  action: string;
}) {
  await bookingDb().query(
    "INSERT INTO webhook_inbox(notification_id,organizer,event,code,action) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
    [String(p.notification_id), p.organizer, p.event, p.code, p.action],
  );
}
export function transitionKinds(
  previous: ManagedBooking | null,
  next: ManagedBooking,
): ("paid" | "change" | "cancellation" | "refund")[] {
  if (!previous)
    return next.status === "paid"
      ? ["paid"]
      : [
          "cancellation",
          ...(next.refund !== "none" ? ["refund" as const] : []),
        ];
  const kinds: ("paid" | "change" | "cancellation" | "refund")[] = [];
  if (previous.status !== next.status)
    kinds.push(next.status === "paid" ? "paid" : "cancellation");
  else if (
    next.status === "paid" &&
    (previous.firstHourIso !== next.firstHourIso ||
      previous.endIso !== next.endIso)
  )
    kinds.push("change");
  if (next.refund !== previous.refund) kinds.push("refund");
  return kinds;
}
export async function observeOrder(
  code: string,
  read: () => Promise<ManagedBooking>,
) {
  return transaction(bookingDb(), async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `ttd-management:${code}`,
    ]);
    const next = await read();
    const found = await c.query<{ state: ManagedBooking; revision: string }>(
      "SELECT state,revision FROM order_snapshots WHERE order_code=$1 FOR UPDATE",
      [code],
    );
    const previous = found.rows[0]?.state ?? null;
    const revision = Number(found.rows[0]?.revision ?? 0) + 1;
    const kinds = transitionKinds(previous, next);
    if (!previous || kinds.length) {
      await c.query(
        "INSERT INTO order_snapshots(order_code,revision,state) VALUES($1,$2,$3) ON CONFLICT(order_code) DO UPDATE SET revision=$2,state=$3,updated_at=now()",
        [code, revision, next],
      );
      for (const kind of kinds) {
        const identity = `${process.env.PRETIX_ORGANIZER_SLUG}/${process.env.PRETIX_EVENT_SLUG}/${code}/${kind}/${revision}`;
        await enqueue(
          c,
          identity,
          kind,
          { code, observed: next, revision },
          payloadKey(),
        );
      }
    }
    const ops = await c.query<{
      id: string;
      kind: string;
      target: { firstHourIso?: string; endIso?: string };
    }>(
      "SELECT id,kind,target FROM operations WHERE order_code=$1 AND state IN ('prepared','submitted','ambiguous')",
      [code],
    );
    for (const op of ops.rows) {
      const matches =
        op.kind === "cancel"
          ? next.status === "cancelled" && next.refund !== "none"
          : next.status === "paid" &&
            next.firstHourIso === op.target.firstHourIso &&
            next.endIso === op.target.endIso;
      if (matches)
        await c.query("UPDATE operations SET state='verified' WHERE id=$1", [
          op.id,
        ]);
    }
    return next;
  });
}
export function lifecycleMessage(
  kind: "change" | "cancellation" | "refund",
  booking: ManagedBooking,
  email: string,
  language: Language,
) {
  const da = language === "da";
  const subject =
    kind === "change"
      ? da
        ? "Din TTD Studio-booking er ændret"
        : "Your TTD Studio booking has changed"
      : kind === "cancellation"
        ? da
          ? "Din TTD Studio-booking er afbestilt"
          : "Your TTD Studio booking is cancelled"
        : da
          ? "Refusionsstatus for din TTD Studio-booking"
          : "Refund status for your TTD Studio booking";
  const refund = {
    none: da ? "Ikke påbegyndt" : "Not started",
    pending: da ? "Afventer" : "Pending",
    done: da ? "Gennemført" : "Completed",
    failed: da ? "Kræver hjælp fra studiet" : "Studio follow-up needed",
  }[booking.refund];
  const intro =
    kind === "change"
      ? da
        ? "Din booking er flyttet til det nye tidsrum."
        : "Your booking has moved to the new interval."
      : kind === "cancellation"
        ? da
          ? "Bookingen er afbestilt. Refusionens status vises særskilt."
          : "The booking is cancelled. Refund progress is shown separately."
        : da
          ? "Refusionens aktuelle status vises herunder."
          : "The current refund status is shown below.";
  const text = [
    intro,
    "",
    `${da ? "Bookingreference" : "Booking reference"}: ${booking.reference}`,
    `${da ? "Tid i studiet" : "Studio time"}: ${booking.firstHourIso} – ${booking.endIso}`,
    `${da ? "Refusion" : "Refund"}: ${refund}`,
    "",
    "booking@didde-mie.com",
  ].join("\n");
  return { to: email, subject, text };
}

/** Coalesce superseded intervals/refund states, retaining the encrypted observed
 * transition for rendering. Recipient and locale remain authoritative at send. */
export function currentLifecycleMessage(
  kind: "change" | "cancellation" | "refund",
  observed: ManagedBooking,
  current: ManagedBooking,
  email: string,
  language: Language,
  revision: number,
  currentRevision: number,
) {
  if (kind !== "cancellation" && revision !== currentRevision) return null;
  if (observed.reference !== current.reference || observed.status !== current.status)
    return null;
  if (kind === "change" && (current.status !== "paid" ||
      observed.firstHourIso !== current.firstHourIso || observed.endIso !== current.endIso))
    return null;
  if (kind === "cancellation" && current.status !== "cancelled") return null;
  if (kind === "refund" && observed.refund !== current.refund) return null;
  return lifecycleMessage(kind, observed, email, language);
}
