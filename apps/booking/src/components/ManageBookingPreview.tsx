"use client";

import { DateTime } from "luxon";
import { useState } from "react";
import { ManageBookingPanel, type ManagedBooking } from "./ManageBookingPanel";
import type { AvailableInterval } from "./ReschedulePicker";
import { quoteInterval, type Availability } from "@/lib/booking";
import { canManageBooking } from "@/lib/cancellation";
import { SiteFooter } from "./SiteFooter";
import { ManageLanguageSwitch } from "./ManageLanguageSwitch";

export function ManageBookingPreview({ language }: { language: "da" | "en" }) {
  const [booking] = useState<ManagedBooking>(() => {
    const first = DateTime.now().setZone("Europe/Copenhagen").plus({ days: 7 }).startOf("day").plus({ hours: 10 });
    return {
      reference: "DEMO-BOOKING", firstHourIso: first.toISO()!, endIso: first.plus({ hours: 2 }).toISO()!,
      paidOre: 70_000, status: "paid", refund: "none",
    };
  });
  async function previewChange(current: ManagedBooking, interval: AvailableInterval): Promise<ManagedBooking> {
    const date = DateTime.fromISO(interval.firstHourIso, { setZone: true }).setZone("Europe/Copenhagen").toISODate()!;
    const response = await fetch(`/api/availability?date=${encodeURIComponent(date)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Availability changed");
    const availability = (await response.json()) as Availability;
    const hours = (Date.parse(interval.endIso) - Date.parse(interval.firstHourIso)) / 3_600_000;
    const start = availability.slots.find((slot) => slot.start === interval.firstHourIso);
    const quote = start ? quoteInterval(availability, start.id, hours) : null;
    if (!quote || quote.end !== interval.endIso || !canManageBooking(current.firstHourIso, new Date().toISOString())) throw new Error("Availability or deadline changed");
    return { ...current, ...interval };
  }
  return <>
    <header className="legal-header"><a className="brand" href="/" aria-label="TTD Studio"><span className="brand-mark">TTD<br />STUDIO</span></a><ManageLanguageSwitch language={language} preview /></header>
    <main className="manage-main"><ManageBookingPanel language={language} initialBooking={booking} preview onChangeBooking={previewChange} onCancel={async (current) => {
      if (!canManageBooking(current.firstHourIso, new Date().toISOString())) throw new Error("Deadline reached");
      return { ...current, status: "cancelled", refund: "pending" };
    }} /></main>
    <SiteFooter language={language} links={[{ href: "/", label: "Booking" }]} />
  </>;
}
