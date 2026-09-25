import { notFound } from "next/navigation";
import { MarketingAction } from "@/components/MarketingAction";

export const metadata = { robots: { index: false, follow: false } };

export default async function MarketingActionPage({ params, searchParams }: {
  params: Promise<{ purpose: string }>;
  searchParams: Promise<{ list?: string; token?: string; lang?: string }>;
}) {
  const { purpose } = await params;
  const { list, token, lang } = await searchParams;
  if ((purpose !== "confirm" && purpose !== "unsubscribe") ||
      (list !== "personal" && list !== "booking") ||
      !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  return <MarketingAction purpose={purpose} list={list} token={token} language={lang === "da" ? "da" : "en"} />;
}
