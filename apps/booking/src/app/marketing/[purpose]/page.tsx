import { notFound } from "next/navigation";
import { MarketingAction } from "@/components/MarketingAction";

export const metadata = { robots: { index: false, follow: false } };

export default async function MarketingActionPage({ params, searchParams }: {
  params: Promise<{ purpose: string }>;
  searchParams: Promise<{ list?: string; token?: string; lang?: string }>;
}) {
  const { purpose } = await params;
  const { lang } = await searchParams;
  if (purpose !== "confirm" && purpose !== "unsubscribe") notFound();
  return <MarketingAction purpose={purpose} list="booking" token="" language={lang === "da" ? "da" : "en"} />;
}
