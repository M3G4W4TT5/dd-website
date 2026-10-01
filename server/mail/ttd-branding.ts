import { fileURLToPath } from "node:url";
import type { SendMailOptions } from "nodemailer";
import { escapePersonalHtml as escapeHtml } from "./personal-branding";

/** Preserve plain copy and action tokens; attach artwork rather than remote-load it. */
export function ttdEmail(body: SendMailOptions): SendMailOptions {
  if (body.html || typeof body.text !== "string") return body;
  const paragraphs = body.text.split("\n\n").map(paragraph => {
    const content = paragraph.split(/(https?:\/\/[^\s<>]+)/g).map(part => {
      if (!/^https?:\/\//.test(part)) return escapeHtml(part).replace(/\n/g, "<br>");
      // URL punctuation in prose is not part of the action. Token fragments are.
      const url = part.replace(/[.,;!?)]+$/, "");
      return `<a href="${escapeHtml(url)}" style="color:#116E3A;text-decoration:underline">${escapeHtml(url)}</a>${escapeHtml(part.slice(url.length))}`;
    }).join("");
    return `<p style="margin:0 0 20px">${content}</p>`;
  }).join("");
  return {
    ...body,
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#DAF2E5;color:#116E3A;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6"><tr><td style="padding:24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto"><tr><td style="padding-bottom:24px"><img src="cid:ttd-booking-logo" alt="TTD Studio" width="180" height="79" style="display:block;width:180px;max-width:100%;height:auto;border:0"></td></tr><tr><td>${paragraphs}</td></tr></table></td></tr></table>`,
    attachments: [...(body.attachments ?? []), { filename: "ttd-booking-logo.png", path: fileURLToPath(new URL("./ttd-booking-logo.png", import.meta.url)), cid: "ttd-booking-logo", contentType: "image/png", contentDisposition: "inline" }],
  };
}
