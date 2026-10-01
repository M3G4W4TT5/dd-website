import { personalEmail } from "@dd/mail";

export function personalMarketingEmail(email: string, purpose: "confirm" | "unsubscribe", url: string) {
  const confirm = purpose === "confirm";
  const text = confirm
    ? `Hi,\n\nThank you for signing up for my newsletter. I’ll share updates on my work and dance videos.\n\nPlease confirm your signup here:\n\n${url}\n\nIf you didn’t request this, you can ignore this email. This link expires in 48 hours. You can unsubscribe at any time, and you’re welcome to reply to me with any questions.\n\nBest,\nDidde-Mie`
    : `Hi,\n\nI’ve received a request to unsubscribe this email address from my newsletter.\n\nPlease confirm that you’d like to unsubscribe here:\n\n${url}\n\nIf you didn’t request this, you can ignore this email and stay subscribed. This link expires in 48 hours. You can also reply to me and ask to unsubscribe.\n\nBest,\nDidde-Mie`;
  return { to: email, subject: confirm ? "Confirm your DD newsletter signup" : "Confirm unsubscribe", ...personalEmail(text, { url, label: confirm ? "Confirm my signup" : "Unsubscribe" }) };
}
