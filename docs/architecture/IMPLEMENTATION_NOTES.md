# DD/TTD implementation notes

## Current checkpoint

- Status: S1–S5 implemented and focused verification passed; final integrated verification/cleanup in progress.
- Branch: `codex/server-infrastructure`.
- Baseline code commit: `b31e32f`.
- Next action: complete hygiene and production HTTP checks, run the documented complete suite, inspect final diffs and commit all remaining evidence.
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

## Decisions, discoveries and deviations

For each material item record: observation; reason; chosen action; affected checklist IDs; verification; owner follow-up if required. Document routine implementation choices without asking the owner to decide them. Do not use this section to silently waive agreed requirements.

- S0.1–S0.3: branch and baseline verified; only unrelated `web_clips/` was untracked. Node 24.20.0, npm 11.19.0; installed Next 16.3.6 guides read before edits. Existing listeners: booking 3000, Pretix 8345, PostgreSQL 5433. Docker access requires owner-run sudo.
- Owner read-only inventory completed: PostgreSQL 17.6, Redis 7.4.5, Pretix 2026.7.0; `pretix` is superuser, `dd_marketing` restricted. Databases `pretix` and `marketing`; all three configured events are test-mode/unpublished, zero orders. Container runs as uid 15371.
- Concrete layout: workspace packages `@dd/{contracts,mail,contact,marketing,database,runtime}`; native Node HTTP communications processes fixed to primary/booking; dedicated booking worker. No extra framework or broker required. Server package browser exports fail closed.
- Clean transition: create new marketing schemas and management DB, invalidate old app credentials/tokens by retiring old writers. Preserve Pretix event/product configuration and shared volumes. No fixtures have been reset yet.
- Delivery payloads use per-process AES-256-GCM keys; delivery state distinguishes leases from sends. Expired sending leases become ambiguous and cannot auto-resend. Stable Message-ID is correlation only.
- Development defaults to RFC822 capture via Nodemailer stream transport, without provider SMTP credentials. Marketing delivery runs in communications, never a detached request task.

## Owner-assisted command checkpoints

Record sanitized command/script, purpose, expected result, whether the owner replied `done`, and verification. Do not record passwords or full process environments. An unresolved checkpoint is a blocker, not completion.

- Read-only `sudo bash server/database/scripts/inspect-local.sh`: owner replied done and supplied sanitized output. Findings above verified from this inventory. No mutations.

## Final verification summary

Populate at completion with actual development/production-build/integration/permission/capture-mail results and explicit hosted/provider limitations. Link detailed reports where useful. Keep reports free of secrets and personal data.

Focused verification is recorded below; final suite pending.

### Active owner checkpoint: scoped development transition

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

Last passing focused command: `node --import tsx server/database/scripts/verify-management.ts`. Local running services: primary 3011, booking communications 3012, booking web 3000, worker 3013, primary preview 4321; production fixture services 3100/3112/3113, Pretix 8345 and Mailpit 8025. Next: final complete suite, production HTTP and secret/bundle/context hygiene; then final commits.
