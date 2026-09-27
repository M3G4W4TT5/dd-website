# DD/TTD implementation notes

## Current checkpoint

- Status: preparation complete; implementation has not started.
- Branch: `codex/server-infrastructure`.
- Baseline code commit: `b31e32f`.
- Next action: read the implementation prompt/plan and execute checklist step 0.
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

No implementation discoveries yet.

## Owner-assisted command checkpoints

Record sanitized command/script, purpose, expected result, whether the owner replied `done`, and verification. Do not record passwords or full process environments. An unresolved checkpoint is a blocker, not completion.

None yet.

## Final verification summary

Populate at completion with actual development/production-build/integration/permission/capture-mail results and explicit hosted/provider limitations. Link detailed reports where useful. Keep reports free of secrets and personal data.

Not run: implementation has not started.
