# TTD hosted human acceptance

Started 1 October 2026 (Europe/Copenhagen). **Acceptance incomplete. Owner authorized private VPS release with Step 6 review in situ.**
Starting local HEAD: `961ee6d`; baseline: `be350a1`. Corrected candidate identity
is recorded in TTD_STEP6_PREDEPLOY_REVIEW.md. This review does not replace final
hosted acceptance after approved installation.

The human performs all purchases, changes, cancellations, refunds and marketing
actions. GPT gives one scenario at a time, observes evidence and investigates.
Test inbox: `dev@memoryone.eu`. No private action URLs/tokens, credentials, card
details or raw customer records belong here. Record safe order references only.

## Readiness gate

| Check | Result | Evidence / remaining work |
| --- | --- | --- |
| Local corrections and verification | Passed locally | All approved corrections implemented; fresh tests/builds, browser checks and actual isolated pinned Pretix runtime passed; see TTD_CHECKOUT_REVIEW.md |
| Step 6 review in situ | Unverified | Owner superseded the earlier separate predeployment gate; perform the planned review on the corrected private VPS release, preserving TTD_STEP6_PREDEPLOY_REVIEW.md |
| Approved PR/main integration | Passed | Owner authorized release; PR29 merged as 3e72b830ff4d927f5237e4cafbb191b471326d67 after all CI checks/image builds passed |
| Actual hosted release identity | Passed | Owner status and independent manifest comparison: all three running revisions/digests match merge3e72b83, runtime mounts/startup match, current/successful attempt and host config148e0d8d agree; healthy, zero restarts; primary be350a1 preserved |
| Effective native adapter | Unverified | Owner installer PASS; both web/cron mounted hashes match 6f5090ee and pinned 2026.7.0 identity, supervised processes RUNNING. Actual response CSP/card behavior still unverified |
| Effective event settings | Unverified | Inspect all three sandbox events; DK/colours; both ticket events disable modifications and unpaid/paid customer cancellation |
| Access and release gates | Unverified | Freshly confirm both hosts protected, exact webhook exception only; preserve deployment/live-payment/unrestricted-mail gates |
| Stripe sandbox | Unverified | Confirm connected Total Entertainment sandbox, test-mode event/providers and effective payment methods; no secret values in evidence |
| Actual mail route | Unverified | Check application and native Pretix routes separately; approved inbox only, sender/envelope restrictions retained; capture is insufficient |

URLs: booking.didde-mie.com; checkout.didde-mie.com/control/; connected Total
Entertainment Stripe sandbox. Previous release/configuration evidence is not
proof of this release. Start human scenarios only when all readiness checks pass.

## Efficient scenario queue

Reuse orders for modifications/cancellation to minimize purchases. Start with
mobile; collect desktop regression evidence on the separate desktop booking.
Do not require a screenshot for every click: brief human observations plus
safe references and independent Pretix/Stripe checks are sufficient. Split a row
if only part passes; no required subcase may disappear into a broad pass.

| ID | Scenario and required observations | Result | Evidence |
| --- | --- | --- | --- |
| S1 | Mobile one-hour studio: entry/date/start/No/review/details/payment; invalid details and consent; Back/Continue retains fields and selections; DK phone and billing/postcode; paid confirmation, correct total/details, delivered email and functional management link | Unverified | Not started |
| S2 | Mobile multi-hour studio: Yes/end; selected interval and authoritative price; foreign phone, billing country and alphanumeric postcode; retained details; paid confirmation and inbox delivery | Unverified | Not started |
| S3 | Desktop full-day studio: existing layout/interaction, authoritative full-day discount/total, details/payment/confirmation/email; desktop footer and navigation regression | Unverified | Not started |
| M1 | Mobile modification of S1: existing date/time/details shown, Back/Continue retention; same-date new start, fixed one-hour duration/price; old availability released/new interval occupied; updated details/notification; no extra charge/refund | Unverified | Not started |
| M2 | Mobile modification of S2: change date retaining duration/price; then change both date and start; retention/review/confirmation; old/new availability, notifications and payment consequences after each change | Unverified | Not started |
| M3 | Desktop full-day modification: valid alternate date, retained full-day duration/price/discount and details; notification and payment consequences; desktop regression | Unverified | Not started |
| M4 | Modification/cancellation boundaries: unavailable interval, price/duration mismatch where reachable, >24-hour eligibility and rejection at/inside 24-hour cutoff; existing booking/payment stays intact on rejection | Unverified | Needs eligible sandbox fixtures; do not change rules to manufacture a pass |
| C1 | Cancel eligible S1/S2/S3 as applicable: confirmation dialog, cancelled details, availability released, actual cancellation/refund notifications; matching Pretix refund and succeeded sandbox Stripe refund for each refundable order; no duplicate refund | Unverified | Record each order and refund outcome separately |
| E1 | Mobile ticket purchase: event/date/type/quantity/review/details retention; validation; sandbox card payment; confirmation, actual email and usable delivered/downloaded ticket; all functional order/ticket links | Unverified | Not started |
| E2 | Second supported event shape and desktop ticket regression: workshop versus dated-series selection; payment/confirmation/ticket delivery; record event/date and order | Unverified | Not started |
| E3 | Both ticket event types: paid and unpaid native order pages have no customer modification/cancellation action; mail copy agrees; no booking management flow offered | Unverified | Inspect real pages; do not cancel event tickets as a customer |
| N1 | Marketing signup to dev@memoryone.eu, actual delivered confirmation email, email-link confirmation/page; unsubscribe requested and completed through delivered email link; final unsubscribed state | Unverified | Human performs all subscription actions |
| F1 | Studio unavailable date and event sold out/not on sale: visible explanation and blocked checkout; server conflict if encountered; no unintended payment | Unverified | Needs actual sandbox state; no inventory mutation by GPT |
| F2 | Declined sandbox card then successful retry: readable error, retained order/details, one intended successful charge; SCA challenge if supported; relevant failure/success email delivery | Unverified | Human pays; reconcile Pretix and Stripe separately |
| F3 | Abandoned studio and event payments: unpaid state, reopen/expiry behavior, reservation availability released when applicable, no successful charge; functional pending/expired links and relevant mail | Unverified | Observe authoritative expiry; elapsed time alone is insufficient |
| B1 | Actual phone studio/event/modification: zoom out then back in, scroll top/bottom, portrait/landscape, keyboard opening; no footer jump, squeezed/right-shifted content or gradient compression, retained in-progress data | Unverified | Record phone/OS/browser; run during the three mobile journeys |
| B2 | Desktop regression: studio, events, modification, keyboard/focus, form validation, navigation and footer reveal; approved details heading/eyebrow replacement, larger desktop details labels and overview rows/facts/icons, removed studio-time eyebrow with aligned Overview heading, and raised contact form without heading row/arrow (also check contact mobile); remaining copy/rules preserved | Unverified | Record desktop browser and viewport |
| B3 | Mobile date cards substantially smaller; ideally a whole month fits one screen in studio/modification and applicable event calendars; readable availability/selection and usable touch targets; no-availability days red/disabled with Continue blocked; unavailable start hours red; same start/end time grid with invalid end boundaries grey/disabled | Unverified | Implemented and checked locally 1 October; final real-phone/hosted acceptance pending |
| B4 | Mobile studio customer details: larger readable field labels; “ENTER YOUR DETAILS” heading; no separate “YOUR DETAILS” eyebrow; Back/heading/form moved higher and much closer beneath the step indicator; approved removal of intro/divider/payment reminder with form directly beneath heading; remaining form copy and details retained; equivalent one-hour step also checked | Unverified | Implemented and checked locally 1 October; final real-phone/hosted acceptance pending |
| P1 | Card-method boundaries: explicit no-postcode case; saved/new-card retry, wallet or gift card where actually enabled/supported; invoice requirements and SCA remain authoritative | Unverified | Record supported methods explicitly; unsupported cases require evidence of non-applicability |

## Results entries

For each scenario/subcase record: date/time, passed/failed/unverified,
device/browser, safe booking/order reference, observed behavior, delivered
notification/link/ticket result, and charge/refund status where applicable.
Attribute failures to application, Pretix, Stripe, mail routing or browser only
when supported by evidence; otherwise record the cause as unknown. Local tests,
HTTP 200, captures and provider acceptance cannot establish human acceptance.

No human results recorded yet. Required failures and unverified cases remain
open; acceptance cannot be marked complete until they are resolved.
