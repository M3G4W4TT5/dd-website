# Owner actions after implementation

This file tracks external setup and verification deliberately outside the local implementation run. Add actions as they arise. Do not move unfinished in-scope implementation here. An unchecked item below does not prevent local implementation completion, but applicable items do prevent hosting/testing/launch claims.

Keep every entry concrete: why it is needed, prerequisites, action and evidence that it is complete. Never include credentials, tokenized links, private subscriber exports or customer details. If an owner action becomes necessary to finish local implementation, record it as an active checkpoint in the implementation notes and request it during the run instead of deferring it here.

## Provider and domain setup

- [ ] F1. Confirm the final primary communications hostname when preparing its deployment. `forms.didde-mie.com` is provisional. Verify deployment URL configuration, DNS and HTTPS together; no DNS changes are part of the implementation run.
- [ ] F2. Review Purelymail's actual account sending restrictions. Use the sender scope tests below and the [operations guide](OPERATIONS.md). After separately authorizing changes, restrict contact/newsletter/booking users to the approved sender scopes and assess separately revocable process credentials. Verify both visible From and SMTP envelope authorization; multiple app passwords/tags do not themselves establish isolation. Test rejection of cross-identity sends as well as permitted sends.
- [ ] F3. Verify inbound booking/contact/newsletter mail and no-reply tagged routing, monitoring responsibility, bounce handling and direct replies. Verify actual delivered headers, Return-Path, SPF/DKIM/DMARC results and the inline contact logo using controlled test recipients. No external test mail has been sent by this handoff run.

## one.com VPS deployment, separate task

- [ ] F4. Provision the booking-only deployment from the implementation's documented configuration. Confirm sizing, OS/runtime, ingress/TLS, firewall, private database access, process identities, secret placement, health checks and supervision. The primary site and primary communications service must not be prerequisites.
- [ ] F5. Supply hosted secrets and run database provisioning/migrations with migration roles; run applications with restricted runtime roles. Verify negative cross-database/schema access and that no application uses a PostgreSQL superuser. Do not copy development env files wholesale.
- [ ] F6. Configure monitored private backups and perform a hosted isolated restore drill, with SMTP/payment integrations disabled in the restored environment. Record the operational recovery procedure and chosen retention policy.
- [ ] F7. Start a production build in payment-sandbox mode with a controlled recipient allowlist. Confirm HTTP/HTTPS origins, secure cookies, internal caller authentication, log redaction and protected previews. Production mode must not enable live payments or unrestricted mail.

## Pretix, Stripe and notification verification

- [ ] F8. Configure hosted Pretix SMTP/default organizer sender and contact address according to the sender matrix, inspect every enabled event override and preview EN/DA content. Verify actual From, Reply-To and envelope for each enabled message category. Establish one owner for rental change/cancellation/admin notifications; resolve any remaining draft copy before user testing.
- [ ] F9. Complete Stripe sandbox integration and configure authenticated hosted HTTPS webhooks. Verify the background queue is running and actual retry/replay behavior works; local fixtures are not proof of provider integration.
- [ ] F10. Run paid-sandbox rental/event purchases with controlled users: payment-pending versus paid mail, receipt versus rental confirmation, ticket delivery, recovery/redemption/session scope, one/multiple/full-day rental intervals, changes, cancellations and accurate refund states. Confirm exactly one provider refund and no duplicate business notification intent under retries. Include a recovery replacement after a consumed/expired 15-minute link, renewed marketing consent after unsubscribe/48-hour expiry, Strict Mode and production action pages, and delayed successive changes/refund transitions. Local regression/capture tests passed; these hosted/provider checks remain outstanding.
- [ ] F11. Exercise payment/refund failures, timeouts after successful operations, duplicate/reordered webhooks, mail failures/ambiguous delivery, 24-hour boundaries, Copenhagen DST and concurrent/stale booking requests. Verify all affected systems' actual state, not only browser responses.
- [ ] F12. Validate shared-room reservations/collision prevention, quotas, checkout policy and any outstanding phone-verification requirement already documented by the project. Inventory display and application advisory locks do not establish atomic cross-channel reservations. Keep release gates disabled until the applicable hosted checks pass.

## Later primary launch and final review

- [ ] F13. When the primary design is ready, deploy its independent static frontend and communications identity. Verify its contact, double-opt-in, unsubscribe and navigation end to end, with sender/data isolation from booking.
- [ ] F14. Review the completed architecture and evidence in the planned broader pre-launch security review. Complete deployment-specific legal/privacy/provider documentation and approve live-payment/public-release gates separately.
- [ ] F15. Before the first manual campaign, approve templates and verify current scoped active-list exports, unsubscribe pages/reply handling, suppression and safe recipient handling. No automated campaign engine is being introduced.

## Acceptance details and prerequisites

F2/F3 require separately authorized provider access and controlled recipients. Permit contact credentials only for contact header/envelope; newsletter only for newsletter; booking only for booking and noreply+booking. For every credential test both approved sender/envelope combinations and rejected cross-scope combinations, including base no-reply and another domain. Verify mixed header/envelope attempts are rejected too. Test independent process credential revocation where supported, without assuming multiple passwords mean separate sender scope. Record sanitized outcomes and delivered authentication headers; never paste credentials or recipient details.

F4/F5 use [OPERATIONS.md](OPERATIONS.md), `infra/compose.production.yaml`, process env examples, the explicit administrator `provision.ts` job and per-domain `migrate.ts`. Prerequisites are an approved VPS/HTTPS plan and private per-UID secret files outside the repository. Acceptance includes booking-only healthy startup, non-superuser runtime roles, negative cross-schema/database access, private route rejection and closed payment/mail release gates. The optional primary profile must remain unnecessary.

F6 requires a chosen backup schedule/retention and private storage, using `backup.py` and `restore.py`. Repeat the isolated checksum/content/sequence-state drill (called and uncalled sequences plus restored next values) with outgoing integrations disabled and record recovery timings. Local disposable-fixture evidence does not prove a hosted recovery.

F8 must review every enabled category in the [Pretix ownership inventory](OPERATIONS.md#pretix-message-inventory-and-ownership), including organizer/system messages without an event and schedules. Approve the EN/DA rental lifecycle drafts before user testing. Verify admin changes produce the worker-owned notice once and no competing native/manual message. Local event captures establish only local SMTP sink behavior.

F9–F12 require F4–F8 and separate authorization for provider/paid sandbox actions. Record actual order, payment/refund, quota, webhook and mail outcomes rather than treating successful HTTP or browser return as payment proof. Real hosted HTTPS session transport, DNS/TLS, provider sender policy and delivery/bounces remain outstanding. No in-scope implementation work has been deferred to this list.
