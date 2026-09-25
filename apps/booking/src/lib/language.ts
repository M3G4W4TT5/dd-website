import { cookies } from "next/headers";

export type Language = "da" | "en";

export async function pageLanguage(lang?: string): Promise<Language> {
  if (lang === "da" || lang === "en") return lang;
  return (await cookies()).get("ttd-language")?.value === "da" ? "da" : "en";
}
