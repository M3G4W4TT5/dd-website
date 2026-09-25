"use client";

import { useState } from "react";
import { ManageBookingPanel, type ManagedBooking } from "./ManageBookingPanel";
import type { AvailableInterval } from "./ReschedulePicker";
import { SiteFooter } from "./SiteFooter";
import { StaticSiteHeader } from "./StaticSiteHeader";

export function ManageBookingPreview({ language, initialBooking, initialToken, serverNowIso }: {
  language: "da" | "en";
  initialBooking: ManagedBooking;
  initialToken: string;
  serverNowIso: string;
}) {
  const [token, setToken] = useState(initialToken);
  async function previewChange(current: ManagedBooking, interval: AvailableInterval): Promise<ManagedBooking> {
    const response = await fetch("/api/manage/preview", {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
      body: JSON.stringify({ action: "change", token, interval }),
    });
    if (!response.ok) throw new Error("Availability or deadline changed");
    const result = (await response.json()) as AvailableInterval & { token: string };
    setToken(result.token);
    return { ...current, firstHourIso: result.firstHourIso, endIso: result.endIso };
  }
  return <>
    <div className="static-page-surface">
      <StaticSiteHeader language={language} languagePath="/manage/preview" hideManageLink />
      <main className="manage-main"><ManageBookingPanel language={language} initialBooking={initialBooking} serverNowIso={serverNowIso} preview onChangeBooking={previewChange} onCancel={async (current) => {
      const response = await fetch("/api/manage/preview", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ action: "cancel", token }),
      });
      if (!response.ok) throw new Error("Deadline reached");
      return { ...current, status: "cancelled", refund: "pending" };
    }} /></main>
    </div>
    <SiteFooter language={language} />
  </>;
}
