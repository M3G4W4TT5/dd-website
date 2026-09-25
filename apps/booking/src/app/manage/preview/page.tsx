import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ManageBookingPreview } from "@/components/ManageBookingPreview";
import { signPreviewBooking } from "@/lib/manage-preview-token";

export default async function ManageBookingPreviewPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const key = process.env.MANAGE_PREVIEW_SIGNING_KEY;
  if (!key || key.length < 32) throw new Error("MANAGE_PREVIEW_SIGNING_KEY is required for the local preview");
  const language = (await searchParams).lang === "en" ? "en" : "da";
  const first = DateTime.now().setZone("Europe/Copenhagen").plus({ days: 7 }).startOf("day").plus({ hours: 10 });
  const booking = {
    reference: "DEMO-BOOKING", firstHourIso: first.toISO()!, endIso: first.plus({ hours: 2 }).toISO()!,
    paidOre: 70_000, status: "paid" as const, refund: "none" as const,
  };
  const token = signPreviewBooking({
    firstHourIso: booking.firstHourIso, endIso: booking.endIso, expiresAt: Date.now() + 3_600_000,
  }, key);
  return <ManageBookingPreview language={language} initialBooking={booking} initialToken={token} serverNowIso={new Date().toISOString()} />;
}
