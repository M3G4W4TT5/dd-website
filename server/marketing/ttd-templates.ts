import type { Language } from "@dd/contracts";
/** Existing TTD marketing copy, shared by delivery and local review drafts. */
export function ttdMarketingEmail(email: string, purpose: "confirm" | "unsubscribe", url: string, language: Language) {
  if (purpose === "unsubscribe") return {
    to: email,
    subject: language === "da" ? "Bekræft afmelding" : "Confirm unsubscribe",
    text: language === "da" ? `Bekræft din afmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Du kan også svare på denne mail og bede om afmelding.` : `Confirm your unsubscribe here:\n${url}\n\nIf you did not request this, ignore this email. You can also reply to this message and ask to unsubscribe.`,
  };
  return {
    to: email,
    subject: language === "da" ? "Bekræft tilmelding til TTD Studio-mails" : "Confirm TTD Studio email signup",
    text: language === "da" ? `Du har bedt om at modtage tilbud, nye events og rabatter fra TTD Studio fra TOTAL ENTERTAINMENT. Bekræft din tilmelding her:\n${url}\n\nHvis du ikke har bedt om dette, kan du ignorere mailen. Linket udløber efter 48 timer. Du kan altid afmelde dig. Svar til denne adresse, hvis du har spørgsmål.` : `You asked to receive TTD Studio offers, new events and discounts from TOTAL ENTERTAINMENT. Confirm your signup here:\n${url}\n\nIf you did not request this, ignore this email. The link expires in 48 hours. You can unsubscribe at any time. Reply to this address with questions.`,
  };
}
