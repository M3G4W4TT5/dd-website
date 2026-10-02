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
| Approved PR/main integration | Passed | Owner approved corrective plan; PR34 merged as ff763f6 after all checks/image builds passed; main publication37014202335 and exact deployment37015381158 succeeded |
| Actual hosted release identity | Passed | Final owner status verifies all three ff763f6 published image references/revisions, healthy/zero restarts, current+attempt/config599be2db agree, no failed record; adapter64bc655a on readonly web/cron mounts; pinned Pretix processes RUNNING and primary be350a1/gates retained |
| Effective native adapter | Passed rendering; remaining subcases unverified | Verified adapter64bc655a/mounts/processes. Both fresh studio/workshop payment pages render controls/Stripe iframe with correct prefill/branding and functional billing toggles. Studio exact script CSP and all three theme hashes pass; event script matches reviewed hash and executes, raw event headers unavailable. Retry/saved/paid-page/payment acceptance pending |
| Effective event settings | Passed | Owner applied both reviewed native packages; all three policy/DK/colour settings and all14 email keys independently read back already match. Both ticket events disable modifications and unpaid/paid customer cancellation. No orders or mail sends |
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
| F4 | Studio/event payment form renders as real controls; Stripe mount/iframe; exact effective CSP; initial, existing-order and retry/saved-new-card behavior; consistent native confirmation/order branding | Unverified remaining subcases | Historical escaped-markup failure resolved after release: both fresh valid payment pages pass rendering/billing/iframe/prefill/branding. Studio exact payment CSP passes. Raw event headers, retry/saved/new and paid native pages remain unverified; owner payment acceptance next. No agent payment submitted |

## Results entries

For each scenario/subcase record: date/time, passed/failed/unverified,
device/browser, safe booking/order reference, observed behavior, delivered
notification/link/ticket result, and charge/refund status where applicable.
Attribute failures to application, Pretix, Stripe, mail routing or browser only
when supported by evidence; otherwise record the cause as unknown. Local tests,
HTTP 200, captures and provider acceptance cannot establish human acceptance.

F4 is recorded as a failed hosted rendering scenario. Other required human
results remain unverified; acceptance cannot be marked complete until all
required failures and checks are resolved.


## 2 October 2026 — hosted checkout rendering failure (acceptance blocked)

Owner reports studio and event payment forms displayed the complete Stripe form,
new billing controls and TTD script as visible source; Continue remained clickable.
Studio's escaped prefill was empty; event's escaped prefill contained email only.
This is a **failed hosted rendering scenario**, not payment acceptance. No GPT
purchase, payment, refund, cancellation or customer submission was performed.

Direct Chrome inspection of the existing studio OrderPaymentStart page confirmed
escaped markup/script, no `#stripe-card`, no billing controls and zero Stripe
iframes. The open Dance with DD event tab was on the preceding questions step;
its normal rendering does not resolve the reported payment failure. Both inspected
pages contain one supplied proportioned TTD logo and the correct palette, with no
native duplicate logo. Native button alignment and form styling remain unfinished.
Private action URLs/tokens and customer values are excluded from this evidence.

The broader queue stays blocked until **both actual hosted payment paths render
and operate correctly after an approved correction**. Local full-page checks and
HTTP status cannot clear this gate. Owner retains payment acceptance.


### Confirmed failure and local correction evidence

Both actual hosted payment paths were directly reproduced as failed on 2 October.
Owner diagnostics independently establish that studio's exact script hash and all
three theme hashes are permitted; autoescaping remains the rendering root cause.
Fresh application identity is 6014e46 with matching digests/runtime mounts, adapter
6f5090ee on web/cron, host config148e0d8d, 19 orders and preserved gates. See
`ttd-candidate/hosted-render-failure-2026-10-02.json` and the current corrective
section of TTD_CHECKOUT_REVIEW.md. Local full-page/runtime/browser results do not
clear F4. Corrective installed identity and both hosted corrected paths remain
unverified pending explicit release approval. Owner retains all payment actions.

### 2 October corrective installation and hosted rendering recheck

Owner approved PR/release plan; PR34/main checks passed and exact ff763f6
deployment succeeded. Owner checksum-verified and installed adapter64bc655a
under config599be2db, preserving the actual 6014e46 applications/primary/gates
at configuration-install time. Final release runtime/mount/CSP evidence pending.

Both original hosted payment routes now render real controls with Stripe iframe,
name/email/phone prefill presence and consistent green/purple branding. Desktop
and320/390px layouts have no overflow; billing toggles operate and are restored.
The event cart expired, so valid-cart operation remains pending owner recreation.
The historical failure stays recorded; F4 rendering subcase is observed passed,
other required F4 subcases remain unverified. Broad acceptance/Step6 remains
incomplete. No GPT payment/customer submission or authoritative data mutation.

### Final owner identity/CSP evidence

All three actual ff763f6 image references/revisions/current manifest and
config599be2db match the publication. Adapter64bc655a host/web/cron readonly mounts,
pinned image/processes, primary identity and sandbox/mail gates independently
verified. Actual theme hashes pass on all three indexes, no unsafe-inline.
Studio order expired, so exact new payment script-header hash was not probed.
Fresh studio/event payment pages requested before broader acceptance. F4's
historical failure remains documented; remaining subcases unverified.

Fresh studio payment rendering/keyboard/toggle subcase observed passed, without
submitting payment. No JavaScript warning or visible source; secure iframe with
cardnumber/expiry/CVC, authoritative name/email/phone presence, correct branding.
Fresh workshop information step requires owner advance to payment. Exact fresh
payment CSP check pending. Do not mark full F4/payment/Step6 accepted yet.

### Fresh payment rendering gate cleared — owner payment acceptance next

Fresh studio and Street Dance Workshop payment pages directly observed with
real billing controls, secure Stripe iframe and authoritative prefill presence.
Neither expired. Studio exact response script/style/origin CSP passed in owner
helper, no unsafe-inline. Event executed adapter script fingerprint matches
reviewed source; raw event headers not exposed by observer. Billing toggles
operate and are restored; no agent payment/form submission. Rendering blocker
resolved; resume owner-led payment acceptance one scenario at a time. Keep F4's
remaining subcases, paid native confirmation/management and full Step6 unverified.
All original failure evidence remains retained. Do not turn this gate pass into
broad checkout/payment acceptance.


### Owner-paid studio and workshop observations — 2 October

Owner reports completing both sandbox purchases. Read-only Chrome inspection of
both native order pages confirms the displayed Paid state. Studio has one
proportioned green TTD logo; workshop has one proportioned purple TTD logo and
payment-received confirmation. Both desktop pages have no horizontal overflow.
Workshop also passes the observed 390px layout check. Fresh paid studio mobile
layout remains unverified. No agent purchased, changed, cancelled or refunded an
order, or downloaded tickets.

Workshop displays native PDF ticket download controls; their download/content
acceptance remains unverified. Studio displays the native buyer-information link.
No cancellation panel is shown on either inspected paid page. Workshop shows no
buyer-information or item-change links. These are presentation observations, not
proof of every authoritative modification/refund rule.

Owner reports receipt of the studio booking confirmation email and no event
ticket email. Studio receipt is owner-reported passed; event external email
receipt is currently failed. The first read-only mail diagnostic failed before
returning evidence because it used the wrong native log field; the helper was
corrected to action_type and a rerun requested. Event routing/capture cause stays
unverified until that result. No mail was sent/resend or settings changed.

Paid page presentation is observed passed for the inspected desktop paths and
workshop mobile viewport. S1/E1/F4 overall and Step6 remain incomplete: distinguish
these owner payments and native Paid displays from provider reconciliation, SCA,
retry/saved-card branches, ticket functionality and remaining human acceptance.


### Verified native mail capture after owner payments — 2 October

Owner's corrected read-only diagnostic confirms global Pretix mail routes to
Mailpit capture and neither studio nor workshop overrides SMTP. Both latest paid
orders have a confirmed Stripe payment and one native paid-mail log entry.
Mailpit contains one matching studio message and two matching workshop messages.
Evidence: `ttd-candidate/paid-mail-capture-2026-10-02.json`.

The workshop's missing external email is explained by the preserved capture
route. Native mail generation/capture is passed; external event ticket receipt
remains failed in this owner check and external delivery acceptance incomplete.
Message counts do not establish ticket attachment/content correctness. Studio
external confirmation receipt is owner-reported; this diagnostic establishes only
the separate native captured message, not the sending route of the received
confirmation. No mail was sent or resent and no SMTP/release gate was changed.
Any external native event-mail activation requires a separately reviewed plan
that preserves the approved mail restrictions. Checkout rendering correction and
paid native branding evidence do not make Step6 fully accepted.


Mail-route source trace: `apps/booking/server/worker.ts` sweeps only the configured
PRETIX_EVENT_SLUG and sends its paid confirmation through @dd/mail; controlled
SMTP enforces a recipient allowlist in `server/mail/index.ts`. Native Pretix's
separate SMTP defaults are mail-capture:1025 (`infra/setup-hosted-pretix.py`). The
reviewed Mailpit Compose service configures capture retention, with no relay.
This explains the distinct studio/custom and event/native delivery paths. A
sanitized owner probe has been staged to verify actual worker event scope,
Mailpit relay configuration, captured recipient matches and PDF metadata. Its
result is pending; source defaults alone are not running configuration proof.


### Event ticket destination confirmed — 2 October

Owner route diagnostic confirms two workshop messages addressed to the correct
order email in Mailpit. The message captured at 14:44:43 UTC (16:44:43 Copenhagen)
has one PDF attachment; the preceding message at 14:44:42 UTC has none. Mailpit
has no configured relay environment or relay command argument. Effective native
Pretix SMTP is capture and event custom SMTP is disabled. The ticket-bearing
message therefore reached the local capture service rather than external SMTP;
missing inbox receipt is a routing/activation gap, not missing generation or an
incorrect recipient. PDF contents and ticket validity remain unverified.
Evidence: `ttd-candidate/paid-mail-route-2026-10-02.json`.

The diagnostic's worker fields are inconclusive: it inspected Docker Config.Env,
whereas this deployment loads service settings from mounted runtime files. Null
mail values and false scope/allowlist booleans must not be interpreted as an
actual worker configuration failure. Owner studio inbox receipt remains reported
passed, with its exact sending route not established by this probe. No mail was
sent/resend and no capture, recipient, SMTP or release restrictions were changed.
External event ticket delivery needs a reviewed restricted-delivery correction
before activation; full mail acceptance and Step6 remain incomplete.


Native event-mail correction is prepared locally: see `TTD_NATIVE_MAIL_RELEASE.md`. Controlled Purelymail activation and external inbox/PDF acceptance remain pending; no mail was sent or settings activated during local preparation.
