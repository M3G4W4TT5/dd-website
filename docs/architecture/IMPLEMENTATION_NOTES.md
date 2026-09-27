# DD/TTD implementation notes

## Current checkpoint

- Status: implementation in progress; baseline validated, shared packages and scoped database provisioning under construction.
- Branch: `codex/server-infrastructure`.
- Baseline code commit: `b31e32f`.
- Next action: finish and verify the shared communications packages; apply owner-assisted scoped DB transition once the script and capture configuration pass review.
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

Not run: implementation has not started.

### Active owner checkpoint: scoped development transition

Prepared `server/database/scripts/transition-local.sh` and `provision-local.py`. The script stops only Pretix web/cron, creates the two marketing schemas and management DB with restricted runtime/migration/operator roles, retains events/products/volumes, retires `dd_marketing`, renames the old cluster superuser to an explicit local administrator with a fresh private credential, runs the pinned Pretix migration job separately, and restarts Pretix with `pretix_runtime`, `AUTOMIGRATE=skip` and local Mailpit capture. Secrets are generated into ignored mode-0600 files and never printed. Per-domain migrations are transactional; private generated credentials survive an interrupted provision for safe resumption. Application permission and capture checks follow after owner completion.

Status: awaiting owner execution; not considered passing or complete.
