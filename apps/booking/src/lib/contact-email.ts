import { join } from "node:path";

const personalMailbox = "contact@didde-mie.com";
const bookingMailbox = "booking@didde-mie.com";
type Site = "personal" | "booking";
const replyWindowMs = 60 * 60 * 1000;
const maxRepliesPerHour = 30;
const replyTimes: Record<Site, number[]> = { personal: [], booking: [] };
const lastReplyByAddress: Record<Site, Map<string, number>> = {
  personal: new Map(), booking: new Map(),
};

// Best-effort VPS process limit: one acknowledgement per address per hour,
// and a separate cap for each public form.
export function reserveContactAutoReply(site: Site, email: string, now = Date.now()) {
  const times = replyTimes[site];
  const addresses = lastReplyByAddress[site];
  while (times.length && times[0] <= now - replyWindowMs) times.shift();
  for (const [address, lastReply] of addresses) {
    if (lastReply <= now - replyWindowMs) addresses.delete(address);
  }
  const address = email.toLowerCase();
  if (addresses.has(address) || times.length >= maxRepliesPerHour) return false;
  times.push(now);
  addresses.set(address, now);
  return true;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

export function personalAutoReply(name: string, email: string) {
  const firstName = name.trim().split(/\s+/)[0];
  const greeting = `Hi ${firstName},`;
  const message = "Thank you for getting in touch. I've received your message and will get back to you soon.";
  return {
    from: { name: "Didde-Mie", address: personalMailbox },
    to: email,
    replyTo: personalMailbox,
    subject: "Thank you for your message",
    text: `${greeting}\n\n${message}\n\nBest,\nDidde-Mie\nDD.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#09090b;background:#ffffff">` +
      `<p style="margin:0 0 20px">${escapeHtml(greeting)}</p>` +
      `<p style="margin:0 0 20px">${message}</p>` +
      `<p style="margin:0 0 12px">Best,<br>Didde-Mie</p>` +
      `<div aria-label="DD." style="font-family:Arial,Helvetica,sans-serif;font-size:30px;font-weight:900;letter-spacing:-2px;line-height:1">` +
      `<span style="color:#09090b">DD</span><span style="color:#ffb3eb">.</span></div></div>`,
    headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" },
  };
}

export function bookingAutoReply(name: string, email: string) {
  const firstName = name.trim().split(/\s+/)[0];
  const greeting = `Hi ${firstName},`;
  const message = "Thank you for getting in touch. We have received your message and will get back to you soon.";
  return {
    from: { name: "TTD Studio", address: bookingMailbox },
    to: email,
    replyTo: bookingMailbox,
    subject: "Thank you for your message to TTD Studio",
    text: `${greeting}\n\n${message}\n\nBest,\nDidde-Mie & Toniah\nTTD Studio`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#09090b;background:#ffffff">` +
      `<p style="margin:0 0 20px">${escapeHtml(greeting)}</p>` +
      `<p style="margin:0 0 20px">${message}</p>` +
      `<p style="margin:0 0 12px">Best,<br>Didde-Mie &amp; Toniah</p>` +
      `<img src="cid:ttd-studio-mark" alt="TTD Studio" width="94" height="69" ` +
      `style="display:block;width:94px;height:69px;border:0" /></div>`,
    attachments: [{
      filename: "ttd-studio-mark.png",
      path: join(process.cwd(), "public", "branding", "ttd-email-mark.png"),
      cid: "ttd-studio-mark",
      contentType: "image/png",
      contentDisposition: "inline" as const,
    }],
    headers: { "Auto-Submitted": "auto-replied", "X-Auto-Response-Suppress": "All" },
  };
}
