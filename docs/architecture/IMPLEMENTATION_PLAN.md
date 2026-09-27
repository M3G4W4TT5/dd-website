# DD/TTD server infrastructure: approved plan and completion checklist

Prepared: 27 September 2026. Baseline repository commit: `b31e32f`.
Implementation branch: `codex/server-infrastructure`.

## Purpose and intended outcome

Establish deliberate infrastructure and responsibility boundaries before a broader pre-launch security review. Extract reusable server mechanisms from frontend app directories, enforce runtime/credential/database isolation, and make the booking stack ready for later deployment on the one.com VPS.

This is an infrastructure implementation, not an exhaustive security audit or a redesign of either site. Preserve approved copy, bilingual behavior, visual design and booking business rules unless a requirement below specifically changes behavior.

The primary site is `didde-mie.com`, called `personal` in the repository. Booking is an additional service for studio rentals and event tickets, using the documented `booking.didde-mie.com` public origin. Pretix remains authoritative for orders, availability, payments and refunds. Neither app may import the other's source or read its environment files.

The owner explicitly clarified that everything is local development: no launch, real customers or production data exist. Use a clean development cutover. Existing links, sessions and fixtures may be invalidated or reset. Historical-data migration, backward-compatible emailed links, a legacy API observation period, dual running and formal production-cutover ceremonies are not required. Routine backup/restore tooling for future operation is still required; do not confuse that deliverable with preserving disposable local fixtures.

### Deployment and modes

- Implement development and production modes with explicit configuration validation.
- Development defaults to isolated fixture data and captured mail; preview workflows never deliver externally.
- Production mode controls build/runtime behavior, secure cookies, origin validation and deployment requirements. It does not imply live payments or unrestricted email.
- Payment environment, checkout/self-service release gates and delivery policy are separate settings. Hosted production builds must support Stripe sandbox and controlled-recipient mail testing.
- Build deployment configuration for booking, its communications/worker services, Pretix, PostgreSQL, Redis and the ingress proxy. The primary frontend and primary communications service must be optional and unnecessary for booking startup.
- Actual VPS setup, DNS, Stripe integration completion, provider changes and paid sandbox user testing are outside this implementation run. Document concrete owner actions and keep applicable launch gates disabled.

## Verified starting point; recheck before changing

The prior planning inspection established:

- Primary is static Astro with no server adapter. Its contact/signup/unsubscribe components call booking using `PUBLIC_BOOKING_URL`, also used for navigation. No primary import of booking source or direct loading of its env was found.
- Booking is Next.js. Contact, marketing and management recovery repeat SMTP configuration. The booking contact acknowledgement loads an inline asset via booking's `public/` directory and current working directory.
- Primary/contact/newsletter credentials currently reside in booking. `NOREPLY_SMTP_PASSWORD` is locally present but unused by code. Implemented paid rental confirmation and recovery mail use `booking@` instead of the agreed tagged no-reply From.
- Root Compose runs PostgreSQL 17.6, Redis 7.4.5, Pretix 2026.7.0 and Pretix cron; it does not yet deploy the application services. There was no `infra/` directory.
- A separate `marketing` database contains `marketing_subscriptions`, `marketing_action_tokens`, `manage_link_requests`, `manage_link_tokens`, `manage_sessions` and `manage_paid_emails`. All use `SUBSCRIPTIONS_DATABASE_URL`; recovery URLs also use `SUBSCRIPTIONS_PUBLIC_BASE`.
- Both lists share tables and one role with no RLS. The configured application role is `dd_marketing`; locally it lacks DML rights on `manage_sessions` and `manage_paid_emails`, which are owned by `pretix`.
- Local Pretix connects as PostgreSQL superuser `pretix`. Separate databases therefore do not currently isolate it.
- Local Pretix effective mail settings are localhost port 25, no SMTP authentication, `pretix@localhost` sender and no populated organizer contact address. No local orders, webhooks, outgoing-mail records or scheduled-mail rules were present. Events were unpublished/test-mode.
- The app requests `send_email:true` for rental changes. Installed Pretix's refund-with-cancellation path eventually uses `send_mail=False`; the app has no replacement cancellation notification.
- Management preview does not send mail and is development-only. Rental preflight can nevertheless request a real marketing confirmation when opted in; deployment-wide preview mail safety needs explicit enforcement.
- No external Purelymail account restrictions or hosted environment were verified. Repository/runtime inspection is not a delivery/payment test.

Useful source paths: `apps/personal/astro.config.mjs`, both app env examples, primary contact/newsletter components, all booking `src/app/api/**/route.ts`, `src/lib/{contact-email,marketing,manage-recovery,manage-session,pretix-live-management}.ts`, `apps/booking/subscriptions.sql`, `apps/booking/scripts/`, root `compose.yaml`, and the existing mail/marketing/management documentation.

## Target architecture

```text
apps/personal/                    Static primary frontend
apps/booking/src/                 Booking UI and HTTP adapters
apps/booking/server/              Booking rules, Pretix, sessions, operations,
                                 notification templates and worker
server/mail/                     Shared SMTP, delivery primitives and assets
server/contact/                  Shared contact mechanisms and branded templates
server/marketing/                Subscription mechanisms and templates
server/database/migrations/      Marketing and booking-management migrations
server/database/scripts/         Provisioning, migration, backup/restore, operators
server/contracts/                Browser-safe shared API contracts
server/runtime/                  Fixed-identity communications service entry point
infra/                           Deployment, proxy, modes and operations
```

Use common workspace packages and explicit dependency boundaries; exact package names and a small appropriate Node HTTP framework are implementation choices. Do not build a universal arbitrary-email API, new campaign engine or additional message broker.

Run the same communications code under two distinct process identities. The site/list identity is fixed by validated process configuration, never selected freely by the caller. Contact and marketing for one site may run together. A small database-backed subscription delivery loop can run inside that long-lived communications process. Booking notifications use a separate worker, not detached work inside a Next request.

### Responsibility and secret matrix

| Process | Responsibility | Allowed access | Prohibited access |
| --- | --- | --- | --- |
| Primary static build/browser | UI and public forms | Public services URL and booking navigation URL | SMTP, DB, Pretix secrets |
| Booking browser/build output | UI and safe contracts | Public config | Server credentials |
| Primary communications | Primary contact/newsletter/actions | Contact and newsletter SMTP identities; primary marketing role; own payload key if required | Booking secrets/data; Pretix |
| Booking communications | Booking contact/marketing/actions | Booking correspondence SMTP; booking marketing role; internal-call verifier; own payload key if required | Primary secrets/data; management DB; Pretix |
| Booking web | Availability, checkout handoff, management, webhook intake | Availability token; read/write management tokens as needed; booking-web DB role; recovery hash key; webhook auth; scoped booking-marketing client credential | All SMTP credentials; primary secrets; marketing DB roles |
| Booking worker | Rental notifications, recovery mail, reconciliation | Booking-worker DB role; read-only Pretix token; booking transactional SMTP; payload key if required | Pretix write token; primary/marketing credentials |
| Pretix web/worker/cron | Orders, payments, tickets, native mail | Pretix runtime DB role; Pretix Redis; payment secrets; restricted booking transactional SMTP | Application DBs; primary SMTP |
| Migration jobs | DDL and grants | Relevant migration role, only during deployment | Persistent runtime use of owner/superuser credentials |
| Operator/backup tools | Scoped export/withdrawal, backup/restore | Explicit operator/backup identity | Default use of application superuser credentials |

Keep builds free of production secrets; use distinct secret mounts/env sources, non-root service identities, restricted files, appropriate networks and no Docker socket mounts. Do not mount both app env files or all secrets into every service. Redis remains Pretix-owned; numbered Redis DBs are not isolation boundaries. Standard container/process isolation is sufficient; no orchestration platform is needed.

### Database boundaries

Use one PostgreSQL instance with `pretix`, `marketing`, and `booking_management` databases. Inside `marketing`, use physically separate `primary_marketing` and `booking_marketing` schemas/tables, restricted by grants. A `list` discriminator alone is not isolation. Avoid RLS complexity for this two-list system.

| Proposed role | Grants |
| --- | --- |
| `primary_marketing_runtime` | Required DML in primary schema only |
| `booking_marketing_runtime` | Required DML in booking schema only |
| `booking_web_runtime` | Necessary session/recovery/operation/webhook-intake/notification-intent access |
| `booking_worker_runtime` | Necessary notification/delivery/token/reconciliation access; no unrelated session access |
| `pretix_runtime` | Required Pretix DML/sequences, not cluster administration or application data |
| Per-domain migration roles | Relevant DDL/ownership; unavailable to running applications |
| Per-list operator roles | Scoped exports/withdrawals/cleanup |
| Backup/administrator roles | Explicit operational grants; never app runtime identities |

Runtime roles must not own tables, inherit migration roles, create databases/roles, bypass RLS or be superusers. Restrict CONNECT and authentication rules as well as schema/table privileges; control search paths and default privileges for future objects. Do not leave the old superuser credential in Pretix. Use separate Pretix migration execution with runtime `AUTOMIGRATE=skip`, verified against the installed image.

Give management a dedicated `BOOKING_DATABASE_URL`; remove misleading subscriptions configuration from its sessions, recovery and locks. All concurrent management writers must use one lock database. Locks do not prevent direct Pretix/admin changes or replace quota enforcement. Cleanly stop/reconfigure old local writers rather than operating two independent advisory-lock domains.

Contact does not need a durable inquiry/body store initially. Deliver to the monitored inbox synchronously, with bounded abuse controls and only minimal short-lived delivery/idempotency metadata where justified. Acknowledgement failure must not fail an already accepted inquiry.

### Routes and contracts

- Primary uses `PUBLIC_SERVICES_URL` for contact/marketing. Retain `PUBLIC_BOOKING_URL` only for booking navigation. Keep the service hostname configurable; `forms.didde-mie.com` is a provisional example, not a deployed hostname or DNS instruction.
- Booking contact/marketing browser routes go through same-origin proxy routing to booking communications. Existing path names may remain where useful; no legacy primary compatibility is required.
- Give marketing action-page URLs their own per-site configuration and use `BOOKING_PUBLIC_BASE_URL` for management links.
- New primary marketing action pages live on the static primary site and call primary communications; booking action pages live on booking and call booking communications. GET/render must never consume an action token.
- Shared public contracts: contact submission; subscription request; unsubscribe-link request; confirm/unsubscribe token consumption. Preserve current field validation, consent meaning, optional unchecked booking consent, languages, honeypot and generic membership responses.
- Private booking-to-marketing contract: booking-only subscription request with allowlisted source, explicit opt-in and idempotency key. Dedicated rotatable bearer authentication, private route/network and HTTPS across hosts. No export or arbitrary email capability.
- Booking enqueues typed booking notification intents; it does not call an arbitrary SMTP endpoint. Recipients and status are derived from validated input/authoritative orders, not a caller-supplied From/template/URL.
- CORS: exact allowed origins, no wildcard, `Vary: Origin`, no credentialed contact/marketing cross-origin calls. CORS is not authentication. Reject invalid origins/methods/content types/oversized bodies, including limits before unbounded body reads. Use trusted proxy IP handling, bounded restart-safe abuse controls, no-store responses and sanitized logs.
- Generic success for subscription/recovery membership, explicit validation errors, 429 with retry guidance, generic dependency errors, and explicit invalid/expired-token handling. Do not falsely report delivery or subscription activation after failure.
- Token pages use no-referrer/no indexing and no third-party tracking; scrub query tokens from proxy/application logs. Preserve host-only, HttpOnly, Secure-in-production, SameSite management sessions.

### Sender and ownership matrix

All addresses below use `@didde-mie.com`.

| Message | Owner | From | Reply-To | SMTP identity | Requested envelope |
| --- | --- | --- | --- | --- | --- |
| Primary inquiry | Primary communications | contact | Visitor | Contact | contact |
| Primary acknowledgement | Primary communications | contact | contact | Contact | contact |
| Booking inquiry | Booking communications | booking | Visitor | Booking | booking |
| Booking acknowledgement | Booking communications | booking | booking | Booking | booking |
| Primary subscription/unsubscribe-link | Primary communications | newsletter | newsletter | Newsletter | newsletter |
| Primary campaign | Manual operator | newsletter | newsletter | Newsletter | newsletter |
| Booking subscription/unsubscribe-link/promotions | Booking communications/manual campaign operator | booking | booking | Booking | booking |
| Placed order/payment pending | Pretix | noreply+booking | booking | Booking, Pretix credential | noreply+booking |
| Paid receipt/invoice/event tickets | Pretix | noreply+booking | booking | Booking, Pretix credential | noreply+booking |
| Rental confirmation/custom management link | Booking worker | noreply+booking | booking | Booking, worker credential | noreply+booking |
| Application access/recovery link | Booking worker | noreply+booking | booking | Booking, worker credential | noreply+booking |
| Rental change/cancellation/refund status | Booking worker | noreply+booking | booking | Booking, worker credential | noreply+booking |
| Event-ticket lifecycle notices | Pretix or explicitly assigned operator workflow | noreply+booking | booking | Booking | noreply+booking |
| Other enabled Pretix lifecycle mail | Pretix | noreply+booking | booking | Booking | noreply+booking |

Primary automated mail may use base `noreply@` if a real future need emerges; none is required by these flows. Do not introduce `noreply+personal@`, `personal@` or `dd@`.

Use separate SMTP users for contact, newsletter and booking. The booking identity may be explicitly authorized for booking and noreply+booking only; process credentials should be separately revocable where supported. Multiple app passwords for one user are not distinct sender scopes. Do not assume tagged addresses or mailbox passwords isolate send-as rights, and do not deploy the existing base no-reply password just because it exists.

Purelymail documents permissive same-account/domain sender defaults and explicit send-as restrictions for both header and envelope. Account-specific permissions and independent process credentials require provider verification later. No provider changes or external delivery are authorized by this run. Implement strict application sender policy now, use capture tests, and record exact positive/negative provider tests in the owner list.

No-reply remains monitored for bounces and direct replies; tagged mail routes to its base mailbox. Do not forge Return-Path headers. Explicitly set application SMTP envelopes and document verification of Pretix/provider envelope behavior. Distinguish SMTP acceptance from eventual delivery and bounces. Marketing hard bounces suppress further affected marketing delivery; transactional failures alert the operator without changing payment/order state. Provide a minimal operator mechanism/runbook rather than inventing an unverified Purelymail webhook API.

Pretix owns receipts/invoices/tickets; the app owns rental confirmation and custom management. These are deliberately distinct messages. Event ticket purchases do not receive rental confirmations. Never send a paid confirmation for a merely placed/pending order.

The worker owns rental changes and cancellations: suppress the corresponding Pretix change message after the replacement exists; implement the missing cancellation notice. Include admin-originated rental state transitions through reconciliation and document how operators avoid duplicate native/manual messages. Refund initiation, pending, failed and completed are different states. Do not claim refund completion on cancellation. Preserve approved EN/DA content; the existing documentation explicitly calls some templates drafts, so flag any unresolved copy approval without silently inventing promises.

Inventory all enabled Pretix messages: free orders, approval/denial, incomplete/failed payment, expiry/payment reminders, downloads, native recovery, waiting list, customer/security and scheduled mail. Unused features need not be enabled. Verify sender/Reply-To inheritance per event. The installed code conditionally supplies Reply-To for default organizer/system senders; a custom From alone is not proof of correct Reply-To.

Shared SMTP/rendering/assets belong in `server/mail`; branded contact templates in `server/contact`; subscription templates in `server/marketing`; rental templates remain booking-owned. Package assets independently of booking's public directory and process CWD. Keep campaigns manual; scoped export/withdrawal tooling remains necessary.

### Delivery and operation reliability

Use small PostgreSQL webhook inbox/outbox/delivery tables and supervised polling loops. Authenticate webhooks, persist/deduplicate `notification_id`, then acknowledge. Verify organizer/event and refetch Pretix before deriving recipient, status or notification.

Use unique business notification identities including organizer/event/order/kind/operation or transition identity. Order code alone is insufficient; state hashes alone can suppress legitimate repeated transitions. Coalesce multiple low-level Pretix events for one operation. Persist an operation intent before remote writes and reconcile after a timeout/crash before retrying a change/refund. Local DB rollback cannot undo Pretix/Stripe effects.

Use leases, bounded exponential retries, attempt history, stable Message-IDs, permanent-failure and ambiguous-delivery states. SMTP cannot guarantee exactly-once delivery when acceptance succeeds but recording it fails. Ambiguous sends require reconciliation/operator handling rather than automatic duplicate delivery. A Message-ID is correlation, not recipient deduplication proof.

Generate short-lived access tokens near delivery, store redemption hashes, and if raw token-bearing retry payloads persist, encrypt them with scoped credentials and delete them after their retention window. Keep existing security semantics: double opt-in, purpose/list-bound single-use 48-hour marketing tokens, 15-minute recovery links and one-hour order-scoped sessions unless a documented implementation necessity requires a reviewed adjustment.

Preserve booking eligibility and authoritative rechecks: strictly more than 24 elapsed hours, Copenhagen/DST handling, same duration/price for moves, consecutive configured rental positions, one provider-backed full refund, gated writes and no demo data for mutations. Advisory locking is only one safeguard; concurrency/replay tests and future hosted validation remain required.

## Implementation checklist

All boxes below are implementation deliverables. Mark them done only with evidence in `IMPLEMENTATION_NOTES.md`. Actual external deployment/provider/paid-sandbox tests are tracked separately in `OWNER_FOLLOW_UP.md`; documenting a gate is not evidence that its external test passed. Do not add production preservation ceremonies to this checklist.

### 0. Establish the working baseline

- [x] S0.1 Read applicable instructions; verify the required branch, working tree, dependency/tool versions and existing service/port ownership. Keep unrelated work untouched.
- [x] S0.2 Revalidate the relevant route/config/database/Pretix findings without exposing secrets; record differences. Use owner-run commands for sudo.
- [x] S0.3 Record the concrete package/process layout and current work checkpoint; identify exactly which local fixtures, if any, will be reset.

### 1. Shared packages and ownership

- [x] S1.1 Add workspace packages/runtime entry points with dependency boundaries matching the plan; both apps remain independent of each other's source/env.
- [x] S1.2 Extract common mail transport, contact and marketing mechanisms; preserve current copy, field/consent semantics and language behavior.
- [x] S1.3 Move shared DB/operational tooling out of booking, package mail assets without CWD/public-directory dependence, and place server domain types outside UI-owned modules.
- [x] S1.4 Add explicit validated configuration contracts; server-only modules cannot enter browser bundles. Prove independent app/package builds.

### 2. Runtime modes, deployment configuration and isolation

- [x] S2.1 Implement development and production startup with independent payment/release/mail-delivery controls; missing production config fails safely.
- [x] S2.2 Development/preview mail is captured and production credentials are unavailable; provide explicit controlled-recipient sandbox delivery configuration without enabling it externally.
- [x] S2.3 Add production build/container/proxy/process configuration for the booking stack, worker and communications services. Primary services are optional; booking starts without them.
- [x] S2.4 Enforce separate service users/secrets/mounts/network exposure, bounded health checks and supervised worker shutdown/restart. Keep Redis owned by Pretix.
- [x] S2.5 Supply clean scoped env examples and root startup commands. Separate public URLs from server secrets and booking URLs from marketing URLs.

### 3. Databases and operator tooling

- [x] S3.1 Add reproducible versioned migrations/provisioning for management DB and the two marketing schemas, with separate owners/migrators and scoped runtime roles.
- [x] S3.2 Configure booking pools/session/recovery/operation locks against the management DB and each communications instance against only its schema. Apply the clean local development transition, with owner-run sudo as needed.
- [x] S3.3 Remove Pretix runtime superuser access and separate its migration execution; validate runtime access and migrations against the pinned image.
- [x] S3.4 Prove effective role isolation: intended reads/writes succeed; cross-list/cross-database access and runtime DDL/role escalation fail. Verify grants for newly migrated objects.
- [x] S3.5 Implement scoped per-list export/withdrawal/cleanup commands. Exports stay private/outside Git; cleanup cannot cross list boundaries inadvertently.
- [x] S3.6 Provide repeatable private backup/isolated restore tooling and validate it with disposable fixture databases and outgoing integrations disabled. No preservation requirement for old fixtures.

### 4. Contact and marketing APIs/frontends

- [x] S4.1 Run contact/marketing under fixed primary and booking identities; reject caller attempts to select another identity, inbox or sender.
- [x] S4.2 Implement safe public HTTP behavior: exact origins, bounded JSON bodies, trusted proxy headers, abuse limits, generic membership responses and stable error contracts.
- [x] S4.3 Replace primary form backend use of `PUBLIC_BOOKING_URL` with `PUBLIC_SERVICES_URL`, retaining actual booking navigation. Switch booking public contact/marketing to its communications service.
- [x] S4.4 Implement authenticated booking-only subscription calls from rental/event opt-in; preserve checkout behavior when optional marketing is unavailable and do not enqueue without consent.
- [x] S4.5 Place primary/booking marketing action UI on their respective sites; explicit POST token consumption, correct URL/language, no token logging/referrer leaks. Remove obsolete cross-app handlers rather than legacy compatibility.
- [x] S4.6 Test both sites' contact inquiry/acknowledgement using captured mail, including Reply-To, asset rendering and acknowledgement-only failure handling.
- [x] S4.7 Test each marketing list: pending signup, captured confirmation, activation, repeat/expired/wrong-list/wrong-purpose token rejection, unsubscribe-link/action, manual withdrawal and consent state.
- [x] S4.8 Enforce preview-wide no-delivery, including rental preflight marketing side effects; prove it with capture/negative tests.

### 5. Mail policy and notification reliability

- [x] S5.1 Implement the sender/Reply-To/envelope matrix centrally with typed permitted messages; booking web holds no SMTP credentials, and booking processes hold no primary credentials.
- [x] S5.2 Add durable inbox/outbox/attempt processing, authenticated webhook intake and deduplication using provider notification IDs plus business transition identity.
- [x] S5.3 Implement booking recovery and paid rental confirmation through the worker with authoritative Pretix reads, correct recipient/language, token lifetimes and scoped session behavior.
- [x] S5.4 Implement rental change, cancellation and appropriate refund-status notifications after verified state transitions; suppress competing Pretix notifications and document admin workflow ownership.
- [x] S5.5 Implement remote-operation reconciliation so ambiguous Pretix writes/refunds are verified before retry; ensure old/new lock domains cannot run as independent writers.
- [x] S5.6 Implement bounded retry/lease behavior, permanent-failure and ambiguous SMTP states, stable Message-IDs and sensitive payload retention/encryption as needed.
- [x] S5.7 Define enabled Pretix message ownership, self-hosted SMTP/default sender/Reply-To configuration and per-event inheritance checks; configure local capture where needed without enabling external sending.
- [x] S5.8 Provide actionable queue/failure visibility and bounce/direct-reply handling instructions, with a minimal marketing suppression mechanism. Record provider-specific unverified assumptions as owner gates.
- [x] S5.9 Test duplicate/reordered webhook handling, repeated mutations, worker restarts, expired leases, SMTP timeout/rejection and DB failure around acceptance. Assert no duplicate business intent and explicit ambiguous-delivery handling.
- [x] S5.10 Test EN/DA templates, sender/envelope/Reply-To, pending-versus-paid behavior, rental/event separation and refund-status accuracy with fixtures/capture, without claiming real delivery/payment proof.

### 6. Integrated verification and cleanup

- [x] S6.1 Run repository/app/package type checks, meaningful tests and production builds; fix relevant failures and inspect final diffs.
- [x] S6.2 Start and exercise the local integrated development stack, including both communications identities, booking web/worker, Pretix and scoped DB roles. Check form/action routing and intended failures.
- [x] S6.3 Exercise the production build/configuration locally against fixtures/capture: booking-only startup, worker persistence/restart, private routes, secure-mode behavior and fail-closed config. Record HTTPS-specific checks that require later hosting.
- [x] S6.4 Verify no production secrets in frontend bundles, committed files, images/build contexts, logs, screenshots or test fixtures; verify cross-app imports/env dependencies are absent.
- [x] S6.5 Recheck management authorization, single-use recovery, sessions, 24-hour/DST cutoff, price/duration restrictions and stale/concurrent operations using isolated tests. Keep hosted-only gates disabled.
- [x] S6.6 Retire obsolete handlers/scripts/env variables and unnecessary local app-held credentials once replacements pass. Do not revoke shared/provider credentials or modify unrelated state without explicit scope.
- [x] S6.7 Update operational docs: architecture/ownership, API contracts, deployment modes/startup, envs, migrations/permissions, backup/restore, mail/retries, operator actions and future launch gates. Correct stale existing docs.

### 7. Complete the run

- [x] S7.1 Every implementation checkbox above has evidence, and notes contain final decisions, verification limitations and reproducible commands. No in-scope work is disguised as a later owner action.
- [x] S7.2 Owner follow-up list contains concrete remaining external/provider/VPS/sandbox/security-review actions, with prerequisites and acceptance evidence; no test is represented as passed merely because documented.
- [x] S7.3 All coherent steps are committed on `codex/server-infrastructure`; final status is clean for this task's files and unrelated `web_clips/` remains excluded. Nothing was pushed/merged/deployed.
- [x] S7.4 Final response reports branch/commit, completed behavior, actual test evidence, important limitations and links to all handoff/operations documents. Implementation completion is clearly distinguished from launch readiness.

## Sources and verification boundaries

These primary references informed the plan. Check version-specific behavior against installed packages before implementation; hosted documentation may describe a newer Pretix version.

- [Purelymail sender restrictions](https://support.purelymail.com/support/solutions/articles/159000433207-error-530-5-7-1-you-x-are-not-authorized-to-send-mail-as-y-)
- [Purelymail symbolic subaddressing](https://support.purelymail.com/support/solutions/articles/159000406702-symbolic-subaddressing)
- [Pretix self-hosted configuration](https://docs.pretix.eu/self-hosting/config/)
- [Pretix Docker deployment and migrations](https://docs.pretix.eu/self-hosting/installation/docker_smallscale/)
- [Pretix email settings](https://docs.pretix.eu/guides/email/)
- [Pretix order API](https://docs.pretix.eu/dev/api/resources/orders.html)
- [Pretix webhooks and retries](https://docs.pretix.eu/dev/api/webhooks.html)
- [PostgreSQL schemas and privileges](https://www.postgresql.org/docs/17/ddl-schemas.html)
- [PostgreSQL row security and bypass behavior](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)

No claim is made that Purelymail account policies, delivered headers, hosted HTTPS flows, payment/refund behavior or real webhook retries have already passed. Implement local evidence and explicit later gates.

## PR #1 review regression checklist (27 September 2026)

Fix branch: `codex/review-six-fixes`, based on PR #1 head `6c4dd9f`. These checks supplement the historical S0–S7 acceptance evidence above.

- [x] R1 Backup SELECT covers existing/future sequences in marketing (both schemas), management and Pretix. Scoped checks deny nextval/setval; owner-run actual restore drill verifies called/uncalled state and next values.
- [x] R2 Fragment extraction survives repeated effects without consuming the token. Focused replay test and development EN confirmation/DA unsubscribe browser controls pass with scrubbed URL.
- [x] R3 Recovery replacements use new submission identities after consumption/expiry; retries share identity and existing rate limits remain. Isolated management fixture passes.
- [x] R4 Private marketing retries use submission-specific keys; later opt-ins after unsubscribe/48-hour expiry create new confirmation intents. Both-list fixture asserts retry deduplication and deferred mail under the existing throttle.
- [x] R5 Delayed lifecycle intents retain observed state; superseded change/refund revisions coalesce. EN/DA tests and decrypted disposable queue checks verify repeated intervals and pending/completed refund behavior.
- [x] R6 Acknowledgement reservation/delivery failures preserve accepted inquiry success; inquiry delivery errors remain failures. Both site tests pass.
- [x] R7 Final production container/source verification, development/production action controls, HTTP capture-isolation rerun, docs and branch-only diff pass. Full suite passes 45 tests, no skips, all type checks/eight builds; owner image/source hashes and subsequent production checks pass.
- [x] R8 Fix branch pushed and [PR #2](https://github.com/M3G4W4TT5/dd-website/pull/2) created targeting `codex/server-infrastructure`, linking PR #1 with all findings/evidence/limitations. Only fix commits are in the diff; unrelated `web_clips/` remains excluded. Neither PR merged. Final documentation handoff commit follows `c364ff3`.
