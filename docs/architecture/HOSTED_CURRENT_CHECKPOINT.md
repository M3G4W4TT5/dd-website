# Hosted booking: current execution checkpoint

Updated 28 September 2026. This is the single continuation checkpoint for the consolidated private sandbox run. The older setup narratives in `HOSTED_SETUP.md` and `CICD_SETUP.md` record historical setup evidence, not current running state.

## Baseline and issue matrix

The implementation branch started from `2a7a9ee7690147aab396d3ca7e0bc75c4c7ccf8c` with only unrelated untracked `web_clips/`. The latest main image publication passed; automatic deployment was disabled. The two browser hosts redirected unauthenticated traffic to Cloudflare Access. The review checkpoint had HTTP 200 on booking root, health, Pretix-backed availability with 14 slots, and checkout root. HTTP success and the successful-release manifest do not identify the actual running images after the earlier failed deployment.

| Area | Status | Resolution or evidence required |
| --- | --- | --- |
| Full-day rental discount | Completed earlier | Retained; isolated pinned Pretix import and real availability returned 14 slots. Recheck hosted count and discount details in owner status. |
| Canonical Pretix Host and real HTTP transport | Completed earlier | Retained; real TCP tests cover Host, POST body, pagination, timeout and foreign origin rejection. |
| Administration link | Completed earlier | Retained; verify private HTTPS redirect after deployment. |
| Proxy after container replacement | Verified defect | Keep proxy restart after image replacement; recreate proxy and Pretix when their bind-mounted host files change. |
| Release identity after failed deployment | Verified defect | Record attempt/failure/running image IDs; successful manifest advances only after deep readiness. Compare all three on host. |
| Published-image replay and host config version | Missing capability | Replay one successful main digest run; require an exact reviewed non-secret host configuration hash. |
| Stripe and Pretix webhooks, payment, mail | Unverified integration | Signed callback, scoped private hook, provider state and controlled delivery require hosted acceptance. |
| Client IP at communications | Verified defect | Trust only the resolved internal proxy peer; pass Cloudflare's client IP through nginx, then rate-limit by that IP. |

An isolated Compose project (`dd-verify-20260928`) used separate volumes, ports and synthetic credentials. It ran pinned Pretix, PostgreSQL, Redis, Mailpit, proxy, booking, communications and worker. Its booking/checkout routes, Pretix availability, test-mode event visibility, signed/repeated/forged callback behavior, internal authenticated webhook and proxy routing after replacement were exercised. This is local evidence only.

## Release sequence

1. Finish the single PR, required checks and substantive review; merge normally. Let the merged main workflow publish the exact three image digests once, while `DEPLOY_ENABLED=false`.
2. Obtain the owner-run sanitized status with `infra/hosted-status.py`. Reconcile running image IDs/revisions, manifests, non-secret file hashes, service health/restarts, safe gates, Pretix event/test-mode/discount state, worker and resource pressure. Stop on unknown configuration or data drift.
3. Stage the reviewed release package as root-owned files on the VPS. The owner runs `infra/apply-hosted-release.py install`. It compares existing and target hashes, checks the ingress bridge trust range and private credential registry, creates the root-only proxy header secret, installs only seven non-secret files, recreates affected containers and verifies real Pretix-backed routes. No volume, database, credential or bootstrap/import script is replaced.
4. Add the exact Access public destination override `/_stripe/webhook/` to the existing checkout application, and a preceding tunnel ingress path regex `^/_stripe/webhook/$` with connector JWT validation disabled. Access destination overrides have no implicit subpath match. Keep mandatory JWT validation on both general browser routes. Nginx admits only POST to the exact path, limits the body/rate and verifies the Stripe signature before Pretix. Recheck browser Access, other paths and methods after the exception.
5. Manually dispatch `booking-images.yml` on merged `main` with the successful publication `release_run_id`. The workflow verifies that run's commit, event and success, downloads its published digest artifacts and deploys a manifest pinned to those digests and the installed host configuration version. Do not enable automatic deployment.
6. In the selected **Total Entertainment sandbox** (`acct_1UJLdcFklxURYE91`, test mode), create the exact HTTPS Stripe endpoint after the verifier is live. Keep its `whsec_` value private. Configure each of the three pinned Pretix test events with the sandbox Stripe keys; confirm the callback displayed by Pretix. The owner runs `apply-hosted-release.py activate-sandbox MERGED_COMMIT`, entering the endpoint signing secret on its hidden prompt. This enables only test-mode event visibility, scoped booking write access, checkout/self-service and capture mail. Live payment and unrestricted-mail gates stay closed.
7. Perform synthetic payment/refund, event, decline/3-D Secure, webhook replay/rejection, inventory/cutoff/stale-change, worker restart and captured EN/DA mail acceptance. Only after capture passes, the owner runs `apply-hosted-release.py controlled-mail MERGED_COMMIT`, entering the approved SMTP host/password privately. This restricts application delivery to `dev@memoryone.eu`; Pretix remains on Mailpit. Check delivered sender, Reply-To, links and authentication headers.
8. Run the sanitized owner status again and record actual image IDs/digests, config version, manifest state, Cloudflare policies, callback and gate state. Leave `DEPLOY_ENABLED=false` and both browser sites private.

The owner provides sudo, the Stripe endpoint secret and SMTP credentials only at the concrete checkpoint after PR review. No secret, raw order, payment data, tokenized URL, capture or customer detail belongs in CI output or the handoff. If a hosted test finds a new defect, identify the cause and report any required repair rather than treating an HTTP 200 as acceptance.

## Deferred step 10 and launch gates

The owner deferred initial backup/isolated restore and broader recovery rehearsals to step 10. Before public launch, also verify recurring backup destination/retention/failure reporting, sender restrictions including Pretix, cross-channel reservation/atomicity, concurrency and DST cases, operational rollback/restart, legal/privacy/provider documents, broader security review, and separately approved live-payment and unrestricted-mail gates.
