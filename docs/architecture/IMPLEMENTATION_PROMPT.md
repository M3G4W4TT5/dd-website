# Implementation prompt: DD/TTD server infrastructure

Copy the prompt below into a fresh Codex task opened in this repository. Do not create a new worktree: use the prepared branch in the existing checkout.

---

Implement the approved DD/TTD architecture completely, across every step in `docs/architecture/IMPLEMENTATION_PLAN.md`, in one continuous implementation run.

Repository: `/home/megawatts/Projects/DD_website/dd-platform`
Required branch: `codex/server-infrastructure`

Start by reading applicable `AGENTS.md` instructions and these four handoff files:

1. `docs/architecture/IMPLEMENTATION_PLAN.md` — approved architecture, requirements and authoritative completion checklist.
2. `docs/architecture/IMPLEMENTATION_NOTES.md` — decisions, discoveries, evidence, checkpoints and resumable state.
3. `docs/architecture/OWNER_FOLLOW_UP.md` — work requiring the owner after implementation, particularly hosted/provider verification.
4. This prompt.

## Authorization and scope

The owner has approved the architecture and local implementation. Proceed with application changes, shared server packages, local configuration, scoped development database/role changes, deployment configuration, meaningful tests, operational documentation and regular local commits on the required branch. Do not ask for approval again for ordinary implementation decisions already covered by this plan.

This platform has never launched. All existing application/order/subscription/session data is development data. You may reset relevant development fixtures and invalidate links/tokens/sessions where useful. Do not build compatibility handlers, dual writes, customer-data preservation, live cutover machinery or historical-mail replay solely for existing local data. Useful Pretix event/product configuration need not be rebuilt unnecessarily. Do not remove unrelated state or indiscriminately recreate shared volumes.

The owner wants common, maintainable web infrastructure, not unnecessary services or custom security protocols. Resolve routine details yourself and explain material choices in the notes.

Do not deploy to the one.com VPS, change DNS, enable live payments, send external test mail, change external provider settings, create provider credentials, push the branch or merge it without separate explicit authorization. Hosting, Stripe completion and paid user testing come later. Prepare and document those steps now. The unfinished primary site will launch later; it must not be required to start the hosted booking stack.

## Work continuously

Complete every implementation step; do not stop at a plan, partial scaffold, individual milestone or a statement offering to continue. Keep working after each successful step and commit. Give concise progress updates during sustained work.

Stop only for a genuine unresolved failure/blocker or an action that explicitly needs the owner's authorization or intervention. Try reasonable fixes for routine failures first. Do not silently reduce scope, mark blocked work done, or move unfinished in-scope implementation to the owner follow-up list.

If context is compacted, resume from the checklist and notes. Keep a current checkpoint containing the last passing checks, current step, outstanding work, relevant commands and next action. Do not restart completed work unnecessarily.

## Privileged commands: owner runs sudo

If a necessary operation requires sudo, do not run sudo yourself and do not treat this as the end of the task. Prepare the actual command or reviewed repository script first. Give the owner a short explanation of its impact and exact copy-paste commands, including `cd /home/megawatts/Projects/DD_website/dd-platform` when relevant. Ask them to execute the commands and reply `done`, or report a sanitized error.

Commands must not print secrets, dump customer details, put literal passwords in shell history or output complete container environments. Prefer committed scripts with securely read credentials, targeted operations and explicit failure handling. Do not provide broad destructive cleanup commands. For a script, state which databases/services it changes.

Wait for `done` before dependent work. Continue independent work while waiting where possible. After `done`, verify the outcome read-only rather than assuming success, then immediately continue the implementation. If verification itself requires sudo, provide an exact sanitized verification command for the owner to run. An owner-assisted checkpoint is a pause within the run, not successful task completion.

Other unavoidable sandbox approval requirements still apply; do not bypass them.

## Pretix access

Local Pretix is running at `http://127.0.0.1:8345/control/events/` in the browser tab titled `Events :: DD studio local development`. Use the existing authenticated tab if available and needed; do not expose login credentials or access tokens. Discover the current tab by URL/title if the old reference is unavailable in this fresh task.

The owner originally referenced:

`plugin://browser@openai-bundled?mention=tab-v1&source=extension&browserId=6fe207f9-31e9-4669-8aff-bb2f73f10d6b&tabId=%5B%22f6e16713-4e96-4a28-93e4-cb6a8080c30a%22%2C%2230664462%22%5D&title=Events+%3A%3A+DD+studio+local+development&url=http%3A%2F%2F127.0.0.1%3A8345%2Fcontrol%2Fevents%2F`

Inspect the current environment before acting. The handoff baseline is evidence from 27 September 2026, not a guarantee of current state.

## Checklists, notes and commits

- The implementation checklist is authoritative. Mark an item `[x]` only after its acceptance criteria are satisfied; record concise evidence in the notes. A skipped test is not a passing test.
- Finish all implementation checkboxes before claiming completion. Hosted/provider tests deliberately appear as a separate owner follow-up list: implementation completion is not launch approval.
- Add owner actions to `OWNER_FOLLOW_UP.md` as soon as they arise, with the reason, concrete action, prerequisite and how to verify completion. Keep credentials and tokenized URLs out of it.
- Add unexpected findings, material decisions, deviations, sanitized failures and fixes to `IMPLEMENTATION_NOTES.md` as they arise.
- Inspect the working tree before edits and commits. Existing untracked `web_clips/` is unrelated; never stage it incidentally.
- Commit completed coherent steps regularly on `codex/server-infrastructure`, including their checklist/notes updates. Stage named paths, inspect the staged diff, run appropriate checks and use descriptive messages. Do not push or merge.
- Run focused tests during implementation, then the documented complete verification once the integrated system is ready. Re-run broader checks only when subsequent changes justify it.
- Do not spawn sub-agents unless the owner subsequently asks or applicable instructions require them.

## Final response

Report the completed architecture, branch and final commit, meaningful verification results and limitations. Link the checklist, implementation notes and remaining owner actions. State clearly that VPS deployment, provider sender-policy verification and hosted HTTPS paid-sandbox verification are outstanding where applicable. If genuinely blocked, state the precise remaining unchecked items and the minimum owner action required; do not claim completion.

Begin implementation now and continue through the entire checklist.
