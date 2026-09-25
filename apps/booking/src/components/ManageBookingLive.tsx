"use client";

import { ManageBookingPanel, type ManagedBooking } from "./ManageBookingPanel";
import type { AvailableInterval } from "./ReschedulePicker";

export function ManageBookingLive({ language, initialBooking, serverNowIso, enabled }: {
  language: "da" | "en"; initialBooking: ManagedBooking; serverNowIso: string; enabled: boolean;
}) {
  async function mutate(action: "change" | "cancel", booking: ManagedBooking, interval?: AvailableInterval) {
    const response = await fetch("/api/manage/booking", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ action, code: booking.reference, ...(interval || {}) }),
    });
    if (!response.ok) throw new Error("Management operation failed");
    return (await response.json() as { booking: ManagedBooking }).booking;
  }
  return <ManageBookingPanel language={language} initialBooking={initialBooking} serverNowIso={serverNowIso}
    onChangeBooking={enabled ? (booking, interval) => mutate("change", booking, interval) : undefined}
    onCancel={enabled ? (booking) => mutate("cancel", booking) : undefined} />;
}
