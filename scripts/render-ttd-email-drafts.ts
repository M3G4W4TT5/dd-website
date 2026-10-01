import { writeFileSync, mkdirSync, readFileSync, copyFileSync, readdirSync } from 'node:fs';
import { ttdEmail } from '../server/mail/ttd-branding.ts';
import { bookingAccessEmail } from '../apps/booking/server/manage-recovery.ts';
import { lifecycleMessage } from '../apps/booking/server/notifications.ts';
import { ttdMarketingEmail } from '../server/marketing/ttd-templates.ts';
import { escapePersonalHtml as escapeHtml } from '../server/mail/personal-branding.ts';
process.env.BOOKING_PUBLIC_BASE_URL='https://booking.didde-mie.com';
const out=new URL('../docs/review/ttd-emails', import.meta.url).pathname;
mkdirSync(out,{recursive:true});
copyFileSync(new URL('../server/mail/ttd-booking-logo.png', import.meta.url), `${out}/ttd-booking-logo.png`);
const booking={reference:'REVIEW',firstHourIso:'2026-10-05T08:00:00+02:00',endIso:'2026-10-05T10:00:00+02:00',paidOre:70000,status:'paid' as const,refund:'none' as const};
const token='REVIEW-NONFUNCTIONAL-TOKEN';
for(const lang of ['en','da'] as const) {
 const action=`https://booking.didde-mie.com/manage/access?lang=${lang}#token=${token}`;
 const messages=[['booking-confirmation',bookingAccessEmail('review@example.test',action,lang,true,booking)],['booking-recovery',bookingAccessEmail('review@example.test',action,lang,false)],...(['change','cancellation','refund'] as const).map(kind=>[kind,lifecycleMessage(kind,{...booking,...(kind==='refund'?{refund:'pending' as const}:{})},'review@example.test',lang)]),...(['confirm','unsubscribe'] as const).map(purpose=>['marketing-'+purpose,ttdMarketingEmail('review@example.test',purpose,`https://booking.didde-mie.com/marketing/${purpose}?lang=${lang}#token=${token}`,lang)])] as const;
 for(const [name,body] of messages) {
  const branded=ttdEmail(body);
  const html=String(branded.html).replace('cid:ttd-booking-logo','ttd-booking-logo.png');
  writeFileSync(`${out}/${name}-${lang}.html`,`<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(body.subject)}</title><body style="margin:0"><div style="font:14px Arial;padding:12px;background:white">LOCAL DRAFT · synthetic booking · links are nonfunctional · ${escapeHtml(body.subject)}</div>${html}</body></html>`);
 }
}

// Native specimens use the approved effective-settings snapshot and unresolved Pretix placeholders.
// The banner is the new adapter; hosted native layout/attachments remain unverified.
const native = JSON.parse(readFileSync(`${out}/native-event-templates.json`, 'utf8'));
for (const template of native.templates) {
 const lang = template.name.endsWith('_1') ? 'da' : 'en';
 const html = `<table role="presentation" width="100%" cellspacing="0" cellpadding="24" style="background:#EFE9FB;color:#7349CD"><tr><td align="center"><img alt="TTD Studio" width="180" height="79" style="display:block;width:180px;max-width:100%;height:auto;border:0" src="ttd-event-logo.png"></td></tr></table>`;
 const name = template.name.replace(/^mail_text_/, 'native-');
 writeFileSync(`${out}/${name}.html`, `<!doctype html><html lang="${lang}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title><body style="margin:0;background:#eeeeee;font:16px Arial;line-height:1.5"><div style="background:white;padding:12px">LOCAL NATIVE EMAIL SPECIMEN · approved copy from both inspected ticket events · unresolved placeholders · native hosted layout and ticket attachments require validation</div>${html}<div style="max-width:640px;background:white;margin:20px auto;padding:24px">${escapeHtml(template.value).replace(/\n/g,'<br>')}</div></body></html>`);
}

const links = readdirSync(out).filter(name => name.endsWith('.html') && name !== 'index.html').sort()
 .map(name => `<li><a href="${escapeHtml(name)}">${escapeHtml(name.replace('.html', '').replace(/-/g, ' '))}</a></li>`).join('');
writeFileSync(`${out}/index.html`, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TTD email review</title><body style="font:16px Arial;line-height:1.6;max-width:800px;margin:40px auto;padding:20px;color:#116E3A;background:#DAF2E5"><h1>TTD email drafts</h1><p>Local review only. Existing copy and action links are preserved. Booking fixtures use synthetic details and nonfunctional tokens. Event-prefixed native drafts use the actual pinned Pretix ClassicMailRenderer and inspected effective settings for each event. Unprefixed native files are simple copy specimens. Both retain unresolved placeholders; delivery, functional links and ticket attachments require hosted validation.</p><ul>${links}</ul></body></html>`);
