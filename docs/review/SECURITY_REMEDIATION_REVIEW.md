# Security remediation review

Delivery scope: repository changes and one PR only. No deployment, final merge, hosted test or Security Cloud finding changes.

Source scan: wfr_c6fd90d599d04679eb7da78916337dd5f4752b28c57014f944acab43349c1705, completed 2 October 2026 15:48 CEST; scan commit `6014e460b9b9516fec6966a6a903ee1ca4f5a4d6`. Fetched baseline origin/main: `1293b342015007fdd35a49bb09b4082f45e4d636`. Native mail, CSP and host release changes are preserved. Repository conditions do not establish hosted exploitation.

## Environment and boundaries

The unrelated original checkout (assets, layout, docs, untracked favicon files and web_clips) is untouched. Work uses dd-platform-security-remediation. Docker daemon access is denied; no sudo/escalation is authorized. Disposable PostgreSQL 17.6 from @embedded-postgres/linux-x64@17.6.0-beta.15 runs only on local loopback port 55432 with synthetic data, separate from existing services. Container/image/network execution checks remain unverified. No owner credentials or VPS commands are requested during execution.

## 1. Recovery exhaustion — security_fix_recovery

Source: occ_e0bb3550ff268989e932bbd4; route charged recovery-total (100/hour) before independent email/queue work. Email rotation exhausted every client's allowance; retries charged again. Implementation in progress.

Authenticated ingress overwrites client identity and a private key header; web rejects forwarding headers without this separately authenticated path. Keys stay only in proxy and booking web. Exact ingress gateway trust remains required. Real IP parser canonicalizes mapped IPv4 and IPv6; /24 and /64 prefix budgets are conservative shared-network signals. Atomic admission transaction combines retry lookup, client/email budgets, queue/client outstanding caps and refillable emergency ceiling, rolling all reservations back on rejection. Email denials retain generic acceptance. Recovery polling uses a distinct loop and durable lease, protecting lifecycle polling.

Initial defaults (provisional, conservative assumptions for a single studio, not measured production capacity): 6/client/hour; 60/prefix/hour; 2 outstanding/client; 100 recovery queue; emergency burst 200, refill one/10s. Fixture concurrency and latency evidence will be recorded below. Unknown and known contacts have the same HTTP contract; encrypted payload, near-delivery single-use tokens remain.

Migration 002-management.sql is additive with explicit grants. Install migrations before application code; install matching private BOOKING_INGRESS_KEY and booking-ingress-header.conf before proxy/application replacement. Do not rerun provision/bootstrap on the populated host. Retain additive tables on rollback. Existing queued recovery rows count toward total queue, with no client attribution; review counts before rollout.

Recovery implementation: **implemented**; verification: **passed for local PostgreSQL/unit checks; unverified for disposable image/ingress execution**. Commit `710d6c0` plus the recovery verification commit on the same branch. Independent review identified permanent denial from ambiguous rows; corrected the executable queue count to queued/leased/sending. Ambiguous audit rows remain untouched and are never automatically resent. Fixture dates now anchor at 08:00 UTC to avoid a pre-existing midnight-crossing test failure without changing tested invariants.

Commands/results:
- `SECURITY_TEST_DATABASE_URL=postgresql://dd_fixture@127.0.0.1:55432/dd_security_fixture node --import tsx --test server/database/recovery-security.test.ts`: passed (2 tests; 100 concurrent rotating emails, independent client, 20 duplicate retries, prefix rotation, rollback, ambiguous retention and lifecycle polling). Burst completes in under one second in the disposable local fixture; this measures admission, not hosted SMTP/Pretix throughput.
- `node --import tsx server/database/scripts/verify-management.ts`: passed with synthetic scoped roles and mocked Pretix; single-use links, replacements, sessions, management concurrency/payment state, authoritative recipient and lifecycle transitions preserved.
- `npm run test:booking`: passed 74/74; `SECURITY_TEST_DATABASE_URL=… npm run test:server`: passed 23/23; `npm run typecheck:server`: passed across both apps and server packages.
- Docker ingress/image probes: unverified, daemon socket permission denied. Hosted origin restrictions, identity header stripping and gateway mapping: unverified, intentionally no VPS access.

Owner follow-up after review: run `security-ingress-config.py` against the existing private web env into a new private staging directory. Review without sharing contents; install web env as 10001:10001 mode 0400 and ingress header as root:10006 mode 0440, atomically; apply incremental management migration and install matching proxy/Compose sources. Do not expose booking ports or forward caller identity/key headers. Existing host helpers' source hash inventories require the integrated security upgrade, documented below, before use. An older app can ignore the additive ingress header/tables; do not drop them or delete unresolved delivery evidence on rollback.
