# DD/TTD implementation notes

## Current checkpoint

- Status: S0–S7 complete; all implementation acceptance checks passed. Implementation completion is not launch approval.
- Branch: `codex/server-infrastructure`.
- Baseline code commit: `b31e32f`.
- Final verified code commit: `a0f7fd3`; the final documentation handoff commit follows it in Git history.
- Outstanding local implementation: none. No owner-assisted local checkpoint is pending.
- Next action: owner reviews [OWNER_FOLLOW_UP.md](OWNER_FOLLOW_UP.md) and separately authorizes hosting/provider/paid-sandbox work when ready. Reproducible verification commands are in [OPERATIONS.md](OPERATIONS.md#complete-verification).
- Existing unrelated state: untracked `web_clips/`; exclude from commits.
- Approval: local architecture implementation and regular local step commits are authorized. External deployment/provider changes/live delivery/push/merge require separate authorization.
- Privileged work: the owner runs copy-paste sudo commands and replies `done`; verify then continue.

## Accepted decisions

1. Development-only clean cutover. Existing local data, links and sessions need not survive. No legacy compatibility or production migration ceremony.
2. Shared server packages with separate primary/booking communications identities; booking-specific rules/templates remain booking-owned.
3. One PostgreSQL instance, separate Pretix/marketing/management databases, separate marketing schemas/roles and migration identities.
4. Development capture mail and production runtime modes; sandbox/live payment and mail policy are independent controls.
5. Booking-only VPS deployment comes later; primary launch is independent and later still.
6. No arbitrary email API or automated campaign product. Existing approved copy and bilingual behavior remain in scope for preservation.
7. All implementation checklist items must pass; external follow-up checks are tracked separately and must not be represented as locally verified.

## Progress and evidence

Update this section after each coherent step. Include checklist IDs, changed responsibilities, commands, actual results, limitations and commit reference when available. Do not record secrets, addresses of test participants, raw bearer tokens or sensitive dumps. Append a commit reference in a later update if necessary; do not amend solely to insert a commit's own hash.

| Step/date | Checklist IDs | Outcome/evidence | Commit |
| --- | --- | --- | --- |
| 2026-09-27 preparation | Not implementation | Branch created from baseline; prompt, plan/checklist, notes and owner follow-up prepared | See Git history |
| 2026-09-27 extraction | S0–S1, S4–S5 foundations | Shared packages, scoped communications and durable booking worker extracted; focused tests/type checks passed | `fa084ac` |
| 2026-09-27 integrated implementation | S1–S5 | Scoped local database transition, reliability/isolation, operator tooling and independent deployment infrastructure verified; detailed evidence below | `1246d81` |
| 2026-09-27 final verification | S6.1–S6.7 | Complete suite and integrated fixtures passed; obsolete paths retired, bounded requests/refund reporting corrected, token lock ordering and final image source verified | `a0f7fd3` |
| 2026-09-27 handoff | S7.1–S7.4 | All implementation boxes complete, external gates reviewed, named-path commits and clean task status verified; final report includes branch/commit/evidence/limitations and handoff links | Final documentation commit in Git history |

## Decisions, discoveries and deviations

For each material item record: observation; reason; chosen action; affected checklist IDs; verification; owner follow-up if required. Document routine implementation choices without asking the owner to decide them. Do not use this section to silently waive agreed requirements.

- S0.1–S0.3: branch and baseline verified; only unrelated `web_clips/` was untracked. Node 24.20.0, npm 11.19.0; installed Next 16.3.6 guides read before edits. Existing listeners: booking 3000, Pretix 8345, PostgreSQL 5433. Docker access requires owner-run sudo.
- Owner read-only inventory completed: PostgreSQL 17.6, Redis 7.4.5, Pretix 2026.7.0; `pretix` is superuser, `dd_marketing` restricted. Databases `pretix` and `marketing`; all three configured events are test-mode/unpublished, zero orders. Container runs as uid 15371.
- Concrete layout: workspace packages `@dd/{contracts,mail,contact,marketing,database,runtime}`; native Node HTTP communications processes fixed to primary/booking; dedicated booking worker. No extra framework or broker required. Server package browser exports fail closed.
- Clean transition: create new marketing schemas and management DB, invalidate old app credentials/tokens by retiring old writers. Preserve Pretix event/product configuration and shared volumes. Old application writers were retired; scoped fixture records are created/cleaned by verification only.
- Delivery payloads use per-process AES-256-GCM keys; delivery state distinguishes leases from sends. Expired sending leases become ambiguous and cannot auto-resend. Stable Message-ID is correlation only.
- Development defaults to RFC822 capture via Nodemailer stream transport, without provider SMTP credentials. Marketing delivery runs in communications, never a detached request task.

## Owner-assisted command checkpoints

Record sanitized command/script, purpose, expected result, whether the owner replied `done`, and verification. Do not record passwords or full process environments. An unresolved checkpoint is a blocker, not completion.

- Read-only `sudo bash server/database/scripts/inspect-local.sh`: owner replied done and supplied sanitized output. Findings above verified from this inventory. No mutations.

## Final verification summary

Populate at completion with actual development/production-build/integration/permission/capture-mail results and explicit hosted/provider limitations. Link detailed reports where useful. Keep reports free of secrets and personal data.

Final suite passed on 27 September 2026: 7 shared tests + 35 booking tests (42 total, no skips), app/package type checks, Astro static and Next standalone production builds, and six independent workspace package builds. Detailed integration and owner-assisted evidence follows. Hosted/provider/paid-sandbox checks have not been run.

### Completed owner checkpoint: scoped development transition

Prepared `server/database/scripts/transition-local.sh` and `provision-local.py`. The script stops only Pretix web/cron, creates the two marketing schemas and management DB with restricted runtime/migration/operator roles, retains events/products/volumes, retires `dd_marketing`, renames the old cluster superuser to an explicit local administrator with a fresh private credential, runs the pinned Pretix migration job separately, and restarts Pretix with `pretix_runtime`, `AUTOMIGRATE=skip` and local Mailpit capture. Secrets are generated into ignored mode-0600 files and never printed. Per-domain migrations are transactional; private generated credentials survive an interrupted provision for safe resumption. Application permission and capture checks follow after owner completion.

Status: completed and verified below.

- Owner transition attempt 1: Pretix web/cron stopped as intended, provisioning stopped at the first role statement. Cause: `psql -Xq` returned formatted count output, causing a missing role to be classified as existing. Fixed all provisioning scalar queries to `-XqAt`. No role/data changes occurred before the failure; generated private credentials retained for resumption. Owner rerun requested.
- Checkpoint commit `fa084ac`: shared mechanisms and booking worker extraction. Passed shared infrastructure tests (6), booking tests (34), booking/runtime type checks. Next: owner DB transition, scoped integration tests and deployment verification.

- Owner transition attempt 2: roles, two marketing schemas and management migrations applied. Pretix ownership transfer stopped at a table-owned sequence. PostgreSQL requires the table owner to change first; fixed transfer ordering to process sequences after tables. Completed domain migrations are reused transactionally; no volume reset or schema rebuild. Sanitized exception handler added to avoid source-statement tracebacks.

- Owner transition attempt 3: all domain grants and Pretix ownership transfers succeeded, then PostgreSQL rejected renaming the current session user. Replaced renaming with creation of a fresh operational `dd_local_admin`, followed by demotion and NOLOGIN for legacy `pretix`. The old application credential becomes unusable; no service receives the administrator credential. Owner rerun requested, using saved private credentials.

- Read-only administrator inspection: `dd_local_admin` was created successfully and is a superuser; legacy `pretix` is the cluster bootstrap superuser. PostgreSQL does not allow removing the bootstrap role's superuser attribute. It will instead be renamed from the separate administrator session to `dd_bootstrap_admin` and set NOLOGIN. The application name/credential is retired, while the reserved bootstrap administrator remains locked. All Pretix processes use the separately granted non-owner, non-superuser `pretix_runtime`; migration jobs use `pretix_migrator`. This changes no event/order state.

### Scoped transition verified

Owner transition completed: pinned Pretix migrator reported no pending migrations; PostgreSQL/Redis/Pretix web/cron and Mailpit restarted with existing volumes. Read-only PostgreSQL verification confirmed that the old `pretix` role was the reserved bootstrap identity (OID 10), and the new runtime role is non-superuser. `verify-local.ts` passed effective grants, intended DML, cross-schema and cross-database denial, runtime DDL/role escalation denial, worker session denial and grants on new migration-owned tables. Both marketing lists passed pending/activation, token purpose/list/repeat/expiry rejection, unsubscribe/manual withdrawal, request deduplication and private capture tests. Queue tests passed restart/expired leases, bounded retry, permanent rejection, explicit SMTP ambiguity and DB failure after acceptance without automatic resend.

App `.env.local` now contains only booking-web configuration. Its retired credentials were moved to an ignored mode-0600 operator-only file; no runtime references it. Provider credentials were not revoked or changed. No event/product rebuild, order reset or volume deletion occurred.

### Shared processes, deployment and operational verification (S1–S5)

- Passed independent primary/booking builds, all app/package type checks, six shared infrastructure tests and 34 booking business-rule tests. Package assets are file-URL based; contracts are browser-safe and server browser entrypoints reject imports. Fixed process configuration enforces credential/list identities. Public body bounds apply before unbounded reads; both sites passed contact/confirmation HTTP capture, Origin/oversize/cross-list rejection and explicit action consumption. The private marketing route rejects missing auth and unchecked consent; preview/unchecked client paths make zero requests.
- Scoped development transition retired old writers; only marketing/management fixture records changed. `verify-local.ts` passed effective grants/default grants, both list token/consent flows and delivery fault injection. DB failure after acceptance leaves an ambiguous lease rather than causing automatic resend. Six-attempt bounds and encrypted payload retention are implemented.
- Owner ran `inspect-pretix-mail.py` and inspected installed AUTOMIGRATE: `skip` disables startup migrations. Native mail adds Reply-To only when the contact address is set with the inherited default sender. Owner ran the guarded capture configuration for all three test events. Mailpit API assertions passed six EN/DA messages: tagged From, booking Reply-To and tagged SMTP ReturnPath. No external mail or orders/payments created.
- Owner ran actual reusable backup/restore tooling through `backup-restore-drill.py`: scoped backup role, custom-format private dump/checksum, isolated restore with integrations disabled and content fingerprint passed; only disposable fixture DBs removed.
- Owner built/start-tested the standalone booking, communications and worker containers with UIDs 10001/10002/10003, restricted development DB roles, production mode and capture/sandbox policy. Booking started without primary services. Worker restart completed; subsequent read-only HTTP health checks on 3100/3112/3113 all passed. Startup polling initially saw a transient connection reset and recovered.
- `verify-management.ts` passed in a disposable management schema using mocked Pretix only: authoritative recipient/DA locale, pending/event exclusions, hash-only recovery, concurrent single-use redemption, order-scoped/expired sessions, private recovery deduplication, duplicate/reordered intake, concurrent cancellation after lost remote response, authoritative reconciliation without second refund write, repeated revision-based changes and distinct pending/done refund intents. Existing 34 tests cover price/duration, consecutive positions and 24-hour/Copenhagen DST policy.
- Native Node HTTP/polling processes avoid another framework/broker. Initial worker cleanup tried a web-only table; removed that access and verified healthy operation. Standalone TS entrypoints needed ESM package declarations for booking server/shared library files; type checks, builds and worker startup verified the fix. Astro preview had a stale historical lock; inspected the installed preview implementation and used its `--ignore-lock` foreground mode after verifying the port was free.
- Added reusable administrator provision, scoped migration/export/withdrawal/suppression/queue tools and manual ambiguous-operation resolution. Runtime never gets administrator/migrator/operator config. Scoped queue grants are applied locally through the explicit administrator job. Fresh hosted provisioning remains a prepared command, not deployment. Management future objects deliberately require named runtime grants; marketing/Pretix default grants and backup defaults are explicit.
- Added production secret mounts/networks/read-only/non-root targets and local fixture overlay. Builds exclude env files/private captures and use no production secrets. Application Secure cookie policy now follows DD_MODE; production origins/config are validated independently of payment/mail release. Existing confirmation copy is retained; newly added neutral lifecycle text distinguishes cancellation from refund completion and remains draft-review under F8.
- Operational documentation: `OPERATIONS.md`, marketing guide, management guide and existing email guide now describe the actual boundaries and commands. Provider scope/delivery, real HTTPS cookies and paid sandbox/refund/quota integration remain F1–F15 owner gates. They are not represented as local passes.

At this intermediate checkpoint, the focused management check passed and final integrated verification remained next. The final acceptance table below supersedes this checkpoint. Local service ports: primary 3011, booking communications 3012, booking web 3000, worker 3013, primary preview 4321; production fixtures 3100/3112/3113, Pretix 8345 and Mailpit 8025.

### Final integration and cleanup checkpoint

- Commit `1246d81` completes the coherent shared-process, scoped database, management/delivery and deployment implementation (following extraction commit `fa084ac`). The final cleanup/evidence commit follows verification.
- Actual scoped operator CLIs passed active-only mode-0600 exports outside Git, withdrawal, suppression, cleanup, queue resolution and operation rejection. Management operator cannot read sessions. Primary/booking/management migration CLIs ran idempotently; Python compilation, shell syntax and production Compose model checks passed. Future-object tests cover marketing defaults, explicit management opt-in grants/worker denial and Pretix runtime default table/sequence access with DDL denial.
- Production container and image scans passed for separate UIDs and no embedded runtime private values/env files. The final cleanup removes an unused native-secret eligibility endpoint, bounds remaining quote/preview request reads and corrects canceled/partial/replaced refund reporting. A completed partial refund does not claim full refund; a later successful full refund supersedes failed/canceled attempts. The [Pretix refund API](https://docs.pretix.eu/dev/api/resources/orders.html) documents canceled refunds; fixture tests cover canceled, replaced, partial and pending outcomes. Hosted payment behavior remains unverified.
- A concurrency test found inconsistent lock ordering between operator withdrawal and marketing consumption. Consumption now discovers the address, takes the shared advisory lock, then rechecks/locks the token before updating membership. Both lists pass concurrent withdrawal without deadlock/reactivation. An image copied before this fix returned 503 in the production race test; owner rebuild requested and source-hash checking added to the image script. This failure is not marked passing until the rebuilt container race check passes.
- Deleting the legacy route left generated Next validator types referencing it. The complete suite correctly failed with TS2307; installed Next CLI documentation recommends `next typegen && tsc --noEmit`. Booking typecheck now regenerates route types before checking, so a fresh checkout and route deletions use current definitions. No source compatibility handler was restored.
- Independent primary production build passed with explicit fixture HTTPS public URLs; missing `PUBLIC_SERVICES_URL` is rejected by its production build config. Booking remains independent. The optional primary container profile is prepared; no primary deployment was performed.
- Final isolated management adapter tests also pass same-duration/price restrictions, direct admin-stale recheck and concurrent changes with one remote write and native mail suppressed. All fixtures use a `.invalid` mock origin; no actual payment/refund/API write or external mail is exercised.

Final source-image rebuild completed. Owner image hygiene passed 436 booking files and 186 files in each source service, plus exact current communications source hashes. Read-only subsequent health checks passed; production concurrent withdrawal now returns the correct unavailable-token response (410) without deadlock/reactivation. This replaces the earlier failed/stale-image evidence. Final production verification was repeated successfully after the owner's final rebuild reply; launch/provider gates remain outstanding.

### Final acceptance evidence (S6.1–S6.7)

| Check | Actual result | Coverage/limit |
| --- | --- | --- |
| `npm run verify:infrastructure` | PASS; 42 tests, 0 skipped, all app/package type checks and eight builds | Final route type regeneration included; no deployment |
| `node --import tsx server/database/scripts/verify-local.ts` | PASS | Real scoped DML/negative grants/future objects; both list lifecycle/capture/concurrent withdrawal; isolated delivery retry/crash/ambiguity/DB-after-acceptance tests |
| `node --import tsx server/database/scripts/verify-management.ts` | PASS | Disposable schema and `.invalid` Pretix mock: recipient/locale, paid/rental gates, single-use/session authorization, stale/price/duration restrictions, concurrent changes and lost refund response, reconciliation/revision dedup |
| `node --import tsx server/database/scripts/verify-operators.ts` | PASS | Actual scoped CLIs: private active-only export, withdraw/suppress/cleanup, queue/operation resolution and denied session access |
| `node --import tsx server/database/scripts/verify-http.ts` | PASS | Both integrated development sites/services and worker; contact/capture, exact Origin/body/cross-list rejection, action GET non-consumption and POST/repeat behavior, internal auth/consent/private route |
| `node --import tsx server/database/scripts/verify-production.ts` | PASS on final rebuilt containers | Booking-only health/restart, private route and unauthenticated mutation rejection, HTTPS-origin enforcement, body/privacy headers, legacy route removal, final concurrent withdrawal; actual browser TLS/cookie transport remains hosted |
| `node --import tsx server/database/scripts/verify-hygiene.ts` | PASS | Known private values absent from task source and frontend output; no browser server markers/cross-app imports; private context exclusions |
| Owner `sudo bash infra/verify-container-fixtures.sh` | PASS | Pinned images, no primary dependency, UIDs 10001/10002/10003, sandbox/capture, worker restart and bounded health |
| Owner `sudo bash infra/verify-image-hygiene.sh` | PASS | Per-service runtime secret/env exclusion in shipped application files; corrected communications source hash verified |
| Owner `sudo python3 server/database/scripts/backup-restore-drill.py` | PASS | Actual scoped backup/restore tools, private custom dump/checksum, isolated fingerprint and integrations disabled; only fixture DBs removed |
| Native Pretix capture | PASS, six EN/DA messages | All three test events: tagged From/ReturnPath and booking Reply-To. No external SMTP, orders or payments |
| Migration CLIs / syntax / Compose | PASS | Three matching-role migration runs idempotent; Python compile, shell syntax, production Compose `config --no-interpolate --quiet` |
| Primary explicit production config/build | PASS | HTTPS fixture public URLs build; missing service URL rejected; no primary container/host deployment |

Remaining verification limitations are external by design: one.com VPS/TLS/DNS, Purelymail sender/header/envelope/bounce policy, real hosted HTTPS session behavior, Stripe sandbox purchases/refunds/webhooks, Pretix quotas/cross-channel reservations and draft copy/security/legal review. [OWNER_FOLLOW_UP.md](OWNER_FOLLOW_UP.md) gives prerequisites and acceptance evidence. Checkout/self-service/payment/mail release gates stay closed. No external mail, live payment, provider mutation, push, merge or VPS deployment occurred.

Successful tests remove their scoped membership/order-intent/schema/export/database fixtures. Final targeted cleanup removed two primary fixture memberships left by an earlier failed HTTP run (strict generated UUID/example.com pattern only); no booking memberships remained. Private capture messages and the owner-run private backup proof artifacts remain outside Git for inspection. Existing Pretix events/products and shared volumes remain. Local development and production capture stacks remain running for inspection. Final code/image tests pass; no failing or skipped check has been reclassified as passing.

### Completed handoff (S7.1–S7.4)

The checklist and evidence were reviewed together: every implementation item is complete, and F1–F15 contain only external hosting/provider/paid-sandbox and pre-launch owner work with prerequisites and acceptance details. [OPERATIONS.md](OPERATIONS.md) documents repeatable startup, verification and recovery commands. Coherent implementation commits are `fa084ac`, `1246d81` and `a0f7fd3`, followed by this final documentation handoff commit on `codex/server-infrastructure`. Task files are committed; unrelated `web_clips/` remains untracked and unstaged. No branch push, merge, VPS deployment, DNS/provider change, live payment or external mail occurred. The final report links the checklist, notes, operations and owner actions and explicitly distinguishes completed implementation from outstanding launch verification.

## PR #1 review fixes (27 September 2026)

- Base revalidated: latest `origin/codex/server-infrastructure` is reviewed commit `6c4dd9f`; fix branch `codex/review-six-fixes`. Only unrelated `web_clips/` was untracked and remains excluded.
- Findings 2–4 verified in source: Strict Mode replay cleared the scrubbed fragment token; recovery used an hourly address identity; private marketing callers used permanent address/source identities. Fixed with retained fragment state and per-submission UUIDs, preserved across failed retries and renewed on success or changed form input. Existing recovery address/global limits and marketing throttles remain active; missing-key callers represent a new request, not a retry.
- Focused booking tests pass (37), including fragment replay and submission retry/reset. Isolated management verification passes with mocked `.invalid` Pretix, single-use/expired links, replacement identities and retained address limits. Development browser shows the confirmation control after hydration with the fragment removed. No action token consumed by rendering.
- Pending local checkpoint: owner sequence grants/restore drill requested; await `done` before dependent effective-grant checks. Full suite, production browser and final PR remain in progress.
