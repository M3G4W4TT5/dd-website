# Native TTD event mail correction — controlled Purelymail delivery

## Verified problem

Owner-paid workshop mail, including one PDF attachment, was generated for the
correct order email and accepted by local Mailpit on 2 October 2026. Native
Pretix uses mail-capture:1025 with no relay; external event delivery therefore
never occurred. Studio confirmation uses the separate rental notification path.
See paid-mail-route-2026-10-02.json. The Docker Config.Env worker probe was
inconclusive because worker settings load from a mounted runtime file.

## Correction prepared locally

The pinned OutgoingMail.get_mail_backend boundary is wrapped only for organizer
`dd-studio` and events `dance-with-dd-dev` / `street-dance-workshop-dd-dev`.
Native Pretix still constructs HTML/CID, order links, ticket/invoice attachments,
filters, task status and retry handling. Final To/Cc/Bcc are inspected before
SMTP opens; controlled mail goes only to `dev@memoryone.eu`. A mixed or other
recipient set is captured in full, with no partial external send. Studio and
other organizers/events retain their original backend. Global Mailpit relay
remains disabled. No historical captured/SENT mail is automatically replayed.

Approved external transport is smtp.purelymail.com:465 with TLS and a dedicated
booking@didde-mie.com app credential. From/envelope is
TTD Studio <noreply+booking@didde-mie.com>, Reply-To booking@didde-mie.com.
Credentials reside only in the private mounted Pretix runtime config, never Git,
frontend, logs or URLs. The scoped backend retains Pretix's private-IP check.

No section means original behavior. Controlled delivery requires the exact
allowlist and release_enabled=false; live events remain captured in this mode.
Explicit future enabled/true supports customer delivery for these events, but
this release does not activate it. Invalid combinations fail at startup. Payment
release and testmode are untouched.

## Local checks

Pinned Pretix 2026.7.0, disposable SQLite, read-only filesystem, no network:
13 actual native mail task/MIME/routing/status checks pass: both events, studio
and unrelated organizer/event isolation, To/Cc/Bcc and final rewritten recipient
capture, native PDF attachment/private link preservation, no SENT-task replay,
closed live-event gate, explicitly gated production policy, permanent failure
and transient retry status. SMTP is mocked: this is no external delivery proof.
Five owner-helper tests pass for private backup, unchanged non-mail config,
permissions, identity/concurrent drift and inspection-only behavior. Checkout
adapter stub and CSP contract suites pass; all 36 full outer-page cases, six confirmation/management specimens, gift-card
isolation and unrelated organizer isolation pass again.

## Release sequence

1. Preserve previous review evidence and current ff763f6 applications/primary.
   Commit scoped correction and evidence, PR/check/merge. CI may publish app images,
   but this adapter-only release does not deploy them.
2. Owner runs the reviewed install-native-mail adapter-only action with current identity checks;
   retain sandbox/payment/mail gates and unrelated services. Verify adapter hash
   on host/web/cron and pinned Pretix identity.
3. Stage root-owned configure-ttd-native-mail.py. Owner runs inspection with exact
   installed commit/adapter hashes, then --apply and privately enters a dedicated
   Purelymail app password. The helper checks authentication/envelope acceptance
   without DATA; it sends no message. It backs up the private config and adds only
   the new controlled [ttd-mail] section, refusing existing/drifted configuration.
4. Run reload-native-mail to recreate only Pretix web/cron using existing reviewed
   Compose and pinned image;
   inspect mounted config and supervised processes. No proxy/booking restart.
5. Owner explicitly resends the existing workshop ticket through Pretix. Verify
   recipient inbox, PDF/content, branding, links, Reply-To, SPF/DKIM/DMARC and
   native status. No new purchase required. Keep acceptance incomplete until
   actual receipt. Inspect failures before any repeated resend.

Rollback: restore the helper's private runtime backup with original runtime file
ownership/mode, then recreate only Pretix web/cron. This restores capture without
altering authoritative orders or payments. Do not replay captured mail globally.
Production customer-recipient activation needs explicit launch approval and
verified delivery; this controlled release alone does not accept Step 6.

Installer regression verifies only Pretix web/cron are recreated, manifest application
revision/images are preserved, and running release drift stops before mutation.
Initial PR CI exposed the old installer adapter hash; it was updated before release.
