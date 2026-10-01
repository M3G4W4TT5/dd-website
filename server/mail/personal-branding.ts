import { fileURLToPath } from "node:url";

export function escapePersonalHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function personalEmail(text: string, action?: { url: string; label: string }) {
  const html = text.split("\n\n").map((paragraph) => {
    if (action && paragraph === action.url) return `<p style="margin:0 0 20px"><a href="${escapePersonalHtml(action.url)}" style="color:#09090b;text-decoration:underline">${escapePersonalHtml(action.label)}</a></p>`;
    return `<p style="margin:0 0 20px">${escapePersonalHtml(paragraph).replace(/\n/g, "<br>")}</p>`;
  }).join("");
  return {
    text,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#09090b;background:#ffffff;padding:24px">${html}<table role="presentation" cellspacing="0" cellpadding="16" style="background:#09090b"><tr><td><img src="cid:dd-flower-mark" alt="DD." width="180" height="81" style="display:block;width:180px;height:auto;border:0" /></td></tr></table></div>`,
    attachments: [{ filename: "dd-flower-v2.png", path: fileURLToPath(new URL("./dd-flower-v2.png", import.meta.url)), cid: "dd-flower-mark", contentType: "image/png", contentDisposition: "inline" as const }],
  };
}
