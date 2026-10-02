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
