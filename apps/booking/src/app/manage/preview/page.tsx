import { notFound } from "next/navigation";
import { ManageBookingPreview } from "@/components/ManageBookingPreview";

export default async function ManageBookingPreviewPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const language = (await searchParams).lang === "en" ? "en" : "da";
  return <ManageBookingPreview language={language} />;
}
