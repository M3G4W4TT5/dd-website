import test from "node:test";
import assert from "node:assert/strict";
import { createMailer, type MailKind } from "./index";
import { ttdEmail } from "./ttd-branding";

test("TTD lifecycle and marketing messages preserve copy, URLs and attachments in MIME", async () => {
  for (const kind of ["paid", "change", "cancellation", "refund", "recovery", "marketing"] as MailKind[]) {
    const url = "https://booking.didde-mie.com/manage?lang=da#token=" + "a".repeat(43);
    const text = `<Buyer & Co>\n\n${url}\n\nExisting notification copy.`;
    let mail: any, raw = "";
    const send = createMailer({ mode: "development", delivery: "capture", allowlist: [] }, "booking", async (body, bytes) => { mail = body; raw = bytes.toString(); });
    await send(kind, { to: "fixture@example.test", subject: kind, text, attachments: [{ filename: "ticket.txt", content: "Ticket fixture" }] });
    assert.equal(mail.text, text);
    assert.equal(mail.subject, kind);
    assert.ok(mail.html.includes(`href="${url}"`));
    assert.match(mail.html, /&lt;Buyer &amp; Co&gt;/);
    assert.match(raw, /Content-ID: <ttd-booking-logo>/);
    assert.match(raw, /filename=ticket.txt/);
    assert.equal(mail.attachments.length, 2);
  }
});

test("existing HTML is not wrapped again and primary mail is unchanged", async () => {
  const original = { text: "Original", html: "<p>Existing HTML</p>" };
  assert.equal(ttdEmail(original), original);
  let mail: any;
  const send = createMailer({ mode: "development", delivery: "capture", allowlist: [] }, "primary", async body => { mail = body; });
  await send("marketing", { to: "fixture@example.test", text: "Existing primary copy" });
  assert.equal(mail.html, undefined);
  assert.equal(mail.attachments, undefined);
});
