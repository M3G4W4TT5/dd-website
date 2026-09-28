# Booking-site private-sandbox acceptance

Prepared 28 September 2026 before implementation. This matrix separates local application and pinned Pretix checks from hosted browser, Pretix, Stripe and owner-confirmed evidence. Historical native Pretix purchases in `HOSTED_CURRENT_CHECKPOINT.md` are not counted as booking-site purchase acceptance. Use only synthetic buyers, sandbox cards and the approved `dev@memoryone.eu` recipient. Establish fresh provider and order counts before hosted tests; record only aggregate counts and redacted order references here.

| Journey or invariant | Local application and pinned Pretix | Hosted booking-site browser | Hosted Pretix and Stripe | Owner confirmation |
| --- | --- | --- | --- | --- |
| Consecutive multi-hour rental to paid order | Two-hour form endpoint created one pending order with exactly two selected positions and the quoted total. | Pending | Pending paid order and matching PaymentIntent | Pending |
| Exact 14-hour full day and discount | 14 selected positions, two positions assigned the verified Pretix discount, simulated and created total DKK 3,000; order removed. | Pending | Pending paid order, 14 positions, two discounts and matching PaymentIntent | Pending |
| Dated-series ticket through booking-site form | Eligibility and cart tests pass; local HTTP shop cannot serve the hosted HTTPS handoff. | Pending on a specifically room-verified date | Pending paid order and matching PaymentIntent | Pending room schedule attestation |
| Singular ticket through booking-site form | Eligibility and cart tests pass; local HTTP shop cannot serve the hosted HTTPS handoff. | Pending on a specifically room-verified event | Pending paid order and matching PaymentIntent | Pending room schedule attestation |
| Recovery, same-price change and cancellation of newly purchased rental | Existing local management tests pass; no new paid local order. | Pending | Pending authoritative position change, cancellation and one provider refund | Pending delivery observation |
| Second authenticated cancellation, including pending repeat if practical | Pending | Pending direct request with retained authenticated session, including an actual second request | Pending unchanged operation/refund counts | Pending |
| Two independent attempts for scarce rental interval | Concurrent two-hour submissions returned 200 and 409; one order held both positions, retry reused its handoff, no partial reservation. | Pending bounded hosted race | Pending one order/payment effect | Pending |
| Stale quote, unavailable interval, expiry and abandonment | Stale total returned 409 without an order; occupied interval returned 409; Pretix expiry released both positions, same-key retry returned 409; zero orders remained after local cleanup. | Pending | Pending held/expired order counts and released inventory | — |
| Event and rental room conflicts | Catalog and quote tests reject overlapping inventory and unverified rooms. | Pending | Pending independent quota/order review | Pending room attestation |
| Payment decline/retry, signed webhook and refund repeat | Local loopback cannot receive Stripe callbacks. | Pending | Pending fresh sandbox provider counts and webhook deliveries | Pending |
| Administration login and web sales channel | Source policies and isolated owner-helper tests pass; local organizer has the built-in web channel. | Pending login after source policy deployment | Pending one `web` channel after repeated prerequisite checks | Pending |

Local baseline for the targeted rental checks was **zero studio orders**. Each temporary pending order was expired and deleted; final local count was **zero**. The scoped local test tokens were revoked after the tests. Local checks establish order reservation and pricing, not payment.

## Hosted execution order

1. Capture a fresh sanitized owner status, Pretix order/refund counts and selected Stripe sandbox PaymentIntent/refund counts. Confirm Access, callback exception, sandbox/live gates, mail allowlist and exact deployed identities.
2. Review the one-room schedule and rental quotas for one future Dance with DD date and the singular workshop. Close every overlapping rental quota and attest only those checked occurrences with `ttd_room_verified=true`.
3. From the booking-site forms, purchase multi-hour and full-day rentals and both event types using sandbox payment. Read Pretix and Stripe separately before calling any order paid.
4. Recover the newly paid rental via the booking site, move it to an available same-price interval before cutoff, cancel it, and submit a second authenticated cancellation request. Compare Pretix operations and Stripe refund counts before and after.
5. Run one bounded two-client reservation race and stale/expiry/payment-failure checks. Test relevant room conflicts and a signed webhook retry. Record fresh aggregate counts and clean up synthetic orders through normal sandbox paths.
6. Recheck mounted configuration, current/successful release records, exact image digests, site health, admin login, `web` channel cardinality and restrictive gates. Document any failed evidence explicitly.
