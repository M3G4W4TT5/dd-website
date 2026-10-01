import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMailer } from "./index";
import { personalAutoReply, bookingAutoReply } from "../contact/templates";
import { personalMarketingEmail } from "../marketing/templates";

test("personal emails embed the DD asset and preserve action URLs through MIME rendering", async () => {
  const url = "https://didde-mie.com/marketing/confirm?lang=en#token=" + "a".repeat(43);
  for (const body of [personalAutoReply("<Visitor> Example", "fixture@example.com"), personalMarketingEmail("fixture@example.com", "confirm", url), personalMarketingEmail("fixture@example.com", "unsubscribe", url.replace("confirm", "unsubscribe"))]) {
    assert.equal(body.attachments[0].cid, "dd-flower-mark");
    assert.ok((await readFile(body.attachments[0].path)).length > 0);
    assert.match(body.html, /src="cid:dd-flower-mark"/);
    let raw = "";
    const send = createMailer({ mode: "development", delivery: "capture", allowlist: [] }, "primary", async (_, data) => { raw = data.toString(); });
    await send("marketing", body);
    assert.match(raw, /Content-ID: <dd-flower-mark>/);
    if (body.subject !== "Thank you for your message") {
      const actualUrl = body.text.split("\n\n").find((line) => line.startsWith("https://"))!;
      assert.ok(body.html.includes(`href="${actualUrl}"`));
      assert.ok(actualUrl.endsWith("#token=" + "a".repeat(43)));
      assert.match(body.text, /48 hours/);
    } else assert.match(body.html, /Hi &lt;Visitor&gt;,/);
  }
});

test("booking acknowledgement keeps its existing identity and logo", () => {
  const body = bookingAutoReply("Visitor", "fixture@example.com");
  assert.match(body.text, /We have received your message/);
  assert.equal(body.attachments[0].cid, "ttd-studio-mark");
  assert.ok(!body.html.includes("dd-flower-mark"));
});
