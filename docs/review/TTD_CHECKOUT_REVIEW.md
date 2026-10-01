# TTD checkout and mobile review

Prepared 1 October 2026. Local implementation only, based on PR28 (`be350a1`).
Branch: `codex/ttd-checkout-mobile`. No push, PR, deployment, hosted setting save,
customer order, payment, refund or email delivery was performed during this work.
The existing dirty checkout was left untouched.

## Changes ready for review

| Item | Local change | Commit |
| --- | --- | --- |
| 1. Phone | Shared studio/event field with a narrow country dropdown, green divider and phone input. Denmark defaults to `+45`. National and explicit international numbers use the existing server normalization. Other fields follow in their original order. | `8fc17d1` |
| 2. Pretix branding | Supplied TTD logo, green studio/purple event colours, square controls, spacing, readable focus states and mobile form sizing on native checkout, confirmation and order pages. Scoped to organizer `dd-studio`. | `f49a5ab` |
| 3. Card billing | Explicit, editable billing country and international postal code instead of Stripe's embedded postal field. Equivalent buyer name, email, phone and existing invoice country/postcode come from the Pretix order/cart session. | `fd9b7cf` |
| 4. Emails | Embedded TTD artwork for booking confirmations/access, changes, cancellations, refunds, marketing confirmation/unsubscription, and native Pretix payment/order/ticket messages. Existing plain copy, links and attachments are retained. | `7ccec6b` |
| 5. Mobile journeys | Separate studio, event-ticket and existing-booking modification steps; progress and explicit Continue/Back; retained selections and customer details. | `a9c71d8` |
| Mobile zoom | Mobile/coarse-touch layout remains active during viewport changes. Footer uses normal document flow on mobile; reveal measurements follow the visual viewport. Horizontal overflow is clipped without disabling browser zoom. | `1127586` |
| Footer gradient | Wider mobile gradient across the footer, using the existing colours and stops. Desktop ellipse/reveal remains. | `65fd93f` |

Follow-up commits complete card-only validation, phone-object serialization,
16px card text, the scoped settings package and clearer dropdown labels:
`04140b7`, `60f4b14`. Email review drafts share the actual delivery constructors.

The studio journey is entry → date → start → more hours → end if Yes → review →
customer details → existing payment handoff. **No means exactly one hour.** The
end-time choices use the existing availability/pricing function, including the
14-hour full-day rule. Continue from review rechecks the server quote.

The event journey is event/date → ticket type and quantity → review → customer
details → existing Pretix cart handoff. There is no new customer event management
flow. Modification starts with the existing booking date/time and retains the
existing same-duration, same-price and more-than-24-hours rules. Cancellation
and refund logic are unchanged. Desktop retains its existing booking interface.

## Payment investigation and field boundaries

Read-only hosted inspection found:

- Pretix is pinned to `2026.7.0`. Studio uses DKK, Europe/Copenhagen, English and
  Danish, with Danish as its default language. Workshop/recurring events default
  to English. All three events had an unset region.
- The studio and workshop Stripe provider uses merchant country `DK`, cards and
  wallet detection. MobilePay remains disabled. Studio also has its existing
  gift-card provider. No payment method was changed.
- The connected Stripe sandbox account is Danish with DKK as its default
  currency. Its AVS failure decline setting is disabled. This does not establish
  what every issuer or payment method will require.
- Studio asks for an invoice address but does not require it; its invoice name
  and company are not required. Workshop does not ask for an invoice address,
  but its invoice-name requirement is enabled. The recurring event's detailed
  invoice/Stripe settings were not independently rechecked.

The pinned Pretix integration creates the legacy Stripe Card Element and calls
`createPaymentMethod` for cards without buyer billing details. The postal widget
belongs to Stripe; no US-only five-digit Pretix validation was found. The exact
“ZIP” label/behaviour can depend on Stripe locale and card details; this work did
not replay a hosted payment to prove that particular trigger.

The correction explicitly supplies editable billing country (DK default, or
existing invoice country) and a text postal-code field supporting Danish four
digits and international letters/spaces. A customer can explicitly indicate
that their billing address has no postal code. No invented postcode is sent.
Only the new-card submission validates these controls; saved cards, wallets,
gift cards and other methods retain upstream handling. The postal-or-no-postal
choice is our form policy, not a claim that Stripe universally requires a ZIP.

Customer details are read from the authoritative order or Pretix cart session
and escaped before rendering. Billing country is never inferred from a phone
country. Card number, expiry and CVC remain in Stripe's iframe. No secrets or
customer data are put into prefill URLs or browser storage. Existing invoice
requirements, issuer checks, SCA and Stripe error handling remain in place.

Sources: [pinned Pretix card integration](https://github.com/pretix/pretix/blob/v2026.7.0/src/pretix/plugins/stripe/static/pretixplugins/stripe/pretix-stripe.js),
[pinned Pretix region settings](https://github.com/pretix/pretix/blob/v2026.7.0/src/pretix/base/settings.py),
[Stripe Card Element options](https://github.com/stripe/stripe-js/blob/master/types/stripe-js/elements/card.d.ts),
[Stripe billing details](https://docs.stripe.com/api/payment_methods/create).

## Native Pretix limits and activation

The mounted `production_settings.py` adapter uses Pretix's presale HTML signals
and wraps its existing Stripe card renderer and HTML mail renderer. This keeps
the upstream checkout/order/payment engines and native messages intact. It does
not redesign Stripe's cross-origin iframe or wallet/SCA screens, ticket PDF
layouts, the control dashboard, or Pretix's own multi-step workflow.

This adapter is intentionally tied to the pinned Pretix version. A changed card
template fails visibly rather than silently skipping the correction. Its tests
verify the adapter contract with stubs; a full local Pretix container could not
be run because no Docker daemon was available. Actual native checkout rendering,
payment and CID email behaviour remain unverified until the approved hosted
release and human acceptance.

`infra/ttd-checkout-settings.json` contains the separate, reviewable native
settings patch. It sets DK region and matching primary colours on the three
known sandbox events. For the two ticket events, it disables native customer
order-data modification and unpaid/paid cancellation. This follows the requested
event policy; it leaves studio management rules and invoice requirements alone.
The workshop currently allows order-data modification; recurring events also
allow unpaid cancellation. Those hosted settings have **not** been changed yet.

`infra/configure-ttd-checkout.py` defaults to inspection only. Its explicit
`--apply` mode validates all three events are sandbox events before applying
only the five whitelisted settings. It must run inside the existing configured
Pretix container, with the adjacent JSON file, after approval. No new credentials
are needed. The existing owner release process must install the reviewed
`pretix-settings.py` on the host and restart the affected Pretix web/cron services.
The installer target checksum is updated; its historical installed checksums are
retained. A main-branch app update alone does not install this native adapter or
apply database settings. Existing deployment, Access, sandbox-payment and mail
gates remain in place.

## Email drafts

Open [the draft index](ttd-emails/index.html), or serve `docs/review` locally and
open `/ttd-emails/`. Regenerate with `npx tsx scripts/render-ttd-email-drafts.ts`.
Booking/lifecycle/marketing specimens use the actual message constructors with
synthetic details and nonfunctional tokens. Native event specimens use exact
read-only workshop template copy with unresolved Pretix placeholders; they are
branding specimens, not proof of final hosted layout or ticket attachments.

The green booking and purple event artwork retains the supplied logo geometry.
Local mail uses a CID attachment; Pretix retains its native CID conversion and
ticket/invoice attachment pipeline. Plain-text mail remains plain text.

Existing native event email copy says customers can change order details. That
wording conflicts with the requested no-modification event policy. It has been
preserved for your copy review; changing it requires a separate approved text
change. Existing marketing and lifecycle wording is also preserved exactly.

## Verification and remaining acceptance

| Evidence | Result |
| --- | --- |
| Booking automated suite | Passed: 71 tests, including existing quote, availability, checkout, phone and management rules |
| Server automated suite | Passed: 21 tests, including MIME preservation and primary-mail isolation |
| Pretix adapter/settings contract suite | Passed: 5 tests; DK/GB/no-postal cases, card-only validation, escaped prefill, phone serialization, scoped mail/theme and sandbox settings guard |
| Hosted installer mocked suite | Passed: 9 tests; these are local mocks, not hosted deployment evidence |
| All workspace typechecks | Passed |
| Booking production and server builds | Passed; production email artwork is included in the standalone trace |
| Local browser studio | Passed: one-hour No; two-hour Yes; quote → details; Back/Continue retains details and country |
| Local synthetic event/modification fixtures | Passed: ticket quantity/details retained; existing modification date and fixed duration retained; no final operation submitted |
| Responsive/zoom emulation | Passed: 320/390px without horizontal overflow; coarse-touch 980px retains mobile flow; scale 2 → 1 retains review; mobile footer relative and desktop footer fixed |
| Actual phone pinch/zoom | Unverified; browser emulation does not certify the reported real-device failure |
| Hosted checkout, SCA, payment, email delivery, tickets, cancellation and refunds | Unverified; reserved for hosted human acceptance |

Screenshots: [studio review](screenshots/mobile-studio-review.jpg),
[customer details and phone](screenshots/mobile-studio-details.jpg),
[mobile footer](screenshots/mobile-footer.jpg),
[booking email](screenshots/booking-email.jpg).

Step 6 has not started. After your approval, PR/main integration and the approved
hosted activation, I will prepare the final instructions and evidence log. You
will perform the complete hosted sandbox test, including actual email delivery
and sandbox refunds. Each human result will be recorded as passed, failed or
unverified with brief evidence. The local automated/browser checks above do not
replace that test.

## Independent continuation review — 1 October 2026

Reviewed HEAD `961ee6d` against `be350a1d320136abdc1592b350e5f32257f91a17`.
The implementation worktree was clean before review. The merge base is exactly
the requested PR28 baseline. All 65 changed files were accounted for; there are
no changes under `apps/personal`, Pages functions or personal email constructors.
The original checkout was not modified. Only review documents were edited in
this review; implementation corrections require approval.

### Findings and proposed corrections

1. **P1 — Pretix CSP blocks the injected payment adapter and theme.**
   `infra/pretix-settings.py:89`, `:120`, `:136`, `:227` emit inline style/script
   blocks without registering their hashes with the request CSP. Independently
   fetched Pretix v2026.7.0 `base/middleware.py:388–399` restricts script/style
   sources; `presale/context.py` simply concatenates signal output, and the
   Stripe response signal adds only the Stripe script origin. No automatic hash
   registration exists on these paths. With the default production CSP, the
   browser rejects the adapter, so the visible billing fields do not validate
   or reach Stripe, the native postal widget stays enabled and the injected
   styling is blocked. Stub contract tests never exercise response CSP.
   Proposed correction: use Pretix's `calculate_csp_hash` and
   `add_to_response_csp_via_request` for the exact emitted script/style contents,
   and move the new billing inline style attributes into the approved stylesheet.
   Keep the existing CSP protections. Add a meaningful CSP integration check,
   then verify actual hosted headers, console and card behavior before acceptance.
   Source: [pinned security middleware](https://github.com/pretix/pretix/blob/v2026.7.0/src/pretix/base/middleware.py).
   This is a source-confirmed incompatibility, not a claimed hosted reproduction.

2. **P2 — Native event messages promise unavailable modifications.**
   `docs/review/ttd-emails/native-event-templates.json:6`, `:14`, `:22`, `:54`
   and corresponding Danish messages promise order changes, while the settings
   package intentionally disables them. Customers would follow a promised
   action and find it unavailable. This was deliberately preserved previously.
   Proposed copy for approval: English “You can view the status of your order at”;
   Danish “Du kan se status på din bestilling på”. Preserve each existing order
   URL and all other copy. Inspect both ticket events' effective templates before
   applying this separately reviewed email-settings patch.

3. **P2 — Mobile event review omits the selected ticket type.**
   `apps/booking/src/components/EventSignupForm.tsx:141–146` shows event, date,
   quantity and price, while `:153` hides the ticket selector on the review and
   customer-details steps. With multiple types, customers cannot confirm which
   type they selected, especially when prices match. Proposed correction: show
   the existing localized selected ticket name in the mobile review summary.
   Preserve desktop summary and the existing ticket data and pricing rules.

4. **P2 — Opening mobile modification does not transfer focus.**
   `apps/booking/src/components/ManageBookingPanel.tsx:116` depends only on
   `mobile` and `changeStep`; opening the change flow at `:235` changes `flow`
   while `changeStep` is already `date`. The heading did not exist during the
   earlier effect, so opening this journey removes the focused action button
   without focusing or scrolling to the new heading. This makes the initial
   transition harder to follow with a keyboard/screen reader. Proposed correction:
   include the change-flow opening in the focus effect and run it only while
   that flow is open. Keep desktop behavior intact. Source review finding;
   dedicated interactive modification reproduction remains outstanding.

### Verified boundaries and fresh checks

- Quote/inventory/pricing/refund validation remains in the unchanged server
  paths. No means one hour; mobile end choices use the existing quote function.
  Studio details use the shared draft; event steps hide rather than unmount
  fields and retain a parent draft. Modification retains fixed duration and
  authoritative eligibility/price validation.
- TTD marketing extraction preserves the existing strings. Shared mail branding
  is limited to booking mail excluding inquiries; primary mail remains separate.
  The native mail wrapper preserves renderer inputs and the upstream CID pipeline.
  These are source/MIME checks, not delivery or inbox evidence.
- Settings inspection does not write settings (it takes transaction row locks).
  Apply validates all three sandbox events before writing only the five allowed
  keys. Existing invoice requirements/payment methods are not patched. Installer
  target checksum matches the adapter; native activation remains a separate step.
- Fresh checks passed: 71 booking tests, 21 server tests, 5 adapter/settings tests,
  9 mocked installer tests, all workspace typechecks, booking and server builds,
  and baseline diff whitespace check. Build-generated `next-env.d.ts` was restored
  to its committed contents; no implementation changes remain from verification.
- Ports 3038 and 3040 respond. 3038 is a production local demo preview
  (`/api/availability` reports `source=demo`); 3040 serves the email drafts.
  Their responses are not hosted evidence. A local mobile entry/date journey was
  inspected; the development-only management preview returns 404 on 3038.
- No new hosted configuration verification, push, PR, merge, deployment,
  purchase, customer management operation, subscription action or delivery test
  was performed. Hosted configuration must be freshly verified after approved
  installation and before Step 6.

Acceptance log: [TTD_HUMAN_ACCEPTANCE.md](TTD_HUMAN_ACCEPTANCE.md).

### Additional mobile requirements from owner

Date cards must be substantially smaller on mobile, ideally allowing a whole
month to fit on one screen. Apply this direction to studio booking and booking
modification date selection; verify event date selection where it uses a calendar.
Preserve readable date/availability/selection states and accessible touch targets.
Keep desktop behavior unchanged. Recorded for the correction pass; not implemented
in this review. Current studio and modification pickers show one week, so a full
month requires reviewing the calendar layout as well as reducing card size.

On the mobile studio customer-details step (Step 6 of 7 when more hours are
selected), make field labels such as “Name” and “Email” substantially larger
and easier to read. Replace “PREPARE YOUR BOOKING” with “ENTER YOUR DETAILS”
and remove the separate “YOUR DETAILS” eyebrow. Keep “Your Details” in the
step indicator. Place the new heading and the rest of the form higher, directly
under “← BACK”, and bring the entire Back/heading/form group much closer to
the step indicator. Retain the remaining form copy, field order, validation and
selection/detail persistence. Apply this to the equivalent details step in the
one-hour journey too; its step number differs. Preserve desktop behavior.
Recorded for the pending correction pass; not implemented in this review.


## Approved local corrections — fresh verification, 1 October 2026

This section supersedes earlier pending-correction and no-Docker limitations for
local verification only. The independent review and owner additions above are
preserved. Hosted installation and human acceptance remain unverified.

- CSP: exact emitted stylesheet/script contents are registered using pinned
  Pretix calculate_csp_hash/add_to_response_csp_via_request. Billing's new inline
  style attribute is now an approved stylesheet class. Existing CSP restrictions
  and native Stripe/session/payment handling remain intact. Meaningful tests cover
  actual emitted contents and response headers, including altered-content hashes
  and non-TTD exclusion. Real pinned native rendering verified all three events in
  EN/DA. Saved-card/wallet/gift-card/SCA completion still needs supported hosted
  scenarios; offline rendering does not prove payment execution.
- Event email policy: independently inspected 40 text fields per ticket event,
  compared both events, and confirmed Classic renderer for both. Seven affected
  message types per event: placement, paid, free, resend links, custom mail,
  approval-required placement and approved free order. The reviewed package changes
  28 localized text values total (14 setting keys) with only the exact approved
  English/Danish phrase. Paid approval payment instructions and all other copy,
  URLs/placeholders, signatures and attachment handling are preserved. Activation
  rejects unexpected drift, preserves other languages, is atomic/idempotent and
  remains separate from the policy settings patch. Neither was applied hosted.
- Mobile event summary: localized selected ticket name appears with quantity and
  price on review and details. Synthetic same-price ticket alternatives verified
  name distinction, quantity 3, total 1500 DKK and Danish “Anden billet”; Back/
  Continue retained ticket selection, name and populated email. Desktop continues
  its existing form/summary. No purchase was submitted.
- Modification focus: effect includes flow opening and is guarded by the open
  change flow and mobile mode. Keyboard opening/reopening with initial date step
  focuses and scrolls the heading; Date/Start/Review and Back transitions retain
  the selected date/time. Synthetic two-hour 700 DKK preview only; no modification
  or cancellation submitted. Screen-reader-facing heading focus/ARIA was inspected;
  actual screen-reader and real-phone acceptance remains required.
- Calendars: studio and modification use Monday-first full mobile months with
  padding, month limits, selected states and full accessible date labels. October
  has all 31 days; modification grid is 316 px tall at 390×844 with 44 px high
  cells. Width is about 39 px with spacing, remaining above the 24 px minimum
  target dimension at this viewport. Studio checks availability on selection;
  modification shows authoritative available-start counts with four concurrent
  day reads per batch, abort/cache handling retained. Desktop stays weekly.
  Applicable events were inspected: mobile events use the existing occurrence
  list; the desktop event calendar is hidden on mobile, so there is no mobile
  event date-card grid to shrink. No event selection/data rules were changed.
- Studio details: mobile heading is “Enter your details” / “Indtast dine
  oplysninger” (faithful Danish imperative). Removed the separate eyebrow;
  retained Your details / Dine oplysninger in progress. Labels are 17 px;
  progress-to-Back gap is 6 px, and form/heading sit higher. Both one-hour Step
  5/6 and multi-hour Step 6/7 inspected. Multi-hour example 10–12, 700 DKK;
  one-hour No example 10–11, 350 DKK. Back/Continue retains selections, fields
  and both consent states. Desktop retains original heading/eyebrow and 10 px
  labels. No server validation or booking/payment/refund rules changed.
- A real-runtime finding was reconciled: both settings activators originally
  queried scoped Event models without opening an organizer scope. Corrected both
  scripts and verified inspection/application/idempotence with actual Pretix ORM.

### Fresh verification

72 booking tests; 21 server tests; 5 adapter/settings tests; 1 emitted-content/CSP
response test; 3 email package tests; 9 mocked installer tests passed. All workspace
typechecks, booking production build and server builds passed. The mocked installer
status messages describe fixtures only, not a hosted installation.

Docker was started by the owner. Real native verification passed in
pretix/standalone:2026.7.0, image ID
`sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02`.
A new no-network, read-only container used temporary SQLite under /tmp and no
hosted credentials/volumes. Actual native StripeCC rendering + presale head +
SecurityMiddleware response CSP passed for studio and both ticket events in EN/DA.
Both settings activators passed with actual ORM. Native email drafts use actual
ClassicMailRenderer/Markdown/Django templates/CSS inlining/candidate branding and
both inspected event settings. No orders/payments or mail sends were created.
Native event-prefixed drafts retain unresolved placeholders and cannot establish
functional links, delivery or ticket/invoice attachment behavior.

Local visual evidence is in `ttd-candidate/`. Browser transport intermittently
reported detached/timeouts and viewport resets; observations were repeated on
fresh visible state. Local dev Fast Refresh required a full reload after structural
updates. These browser/dev limitations are distinct from hosted behavior. No
hosted purchase, modification, cancellation, refund or subscription action was
performed by GPT.

### Release hold and next context

The separate original Step 6 predeployment review is required BEFORE any push.
Preserve and use `TTD_STEP6_PREDEPLOY_REVIEW.md` for its findings and reconciliation.
No push, PR, deployment or native activation is authorized by this local pass.
After that review and correction verification, wait for explicit owner approval.
Final hosted acceptance of the corrected installed release remains a later phase.
See the Step 6 handoff for exact commit/build identity, status and preview URLs;
`infra/TTD_NATIVE_ACTIVATION.md` contains the separately held owner activation package.


## Additional owner mobile refinement — 1 October 2026

Candidate `da760d44a12b3f24ec92d7f50558771210051acc`, booking build `JgXXBXg-NuPa6sECrp_qJ`. This supersedes the earlier
select-to-check-only studio calendar and mobile details intro/reminder layout.
Visible-month availability is now loaded with at most four day reads per batch.
Known no-times days are red and disabled in studio; modification uses the count
of valid starts for the existing duration. Unknown/error days remain distinct
and disabled. Both mobile Date Continue guards require availability.

Unavailable start hours are red. The start/end grids show exactly the same
08:00–22:00 positions; closing time cannot be a start. Invalid end choices are
grey and disabled. Existing quoteInterval rules prevent crossing a booked hour;
10:00 start with 12:00–13:00 booked permits 12:00 end only. No means 10:00–11:00,
350 DKK; Yes with 12:00 end means 10:00–12:00, 700 DKK in the inspected example.

The mobile studio details intro sentence, divider and next-step payment reminder
are removed in EN/DA, with zero form top margin. Name follows Enter your details
(or Indtast dine oplysninger); 17 px labels and progress/back spacing retained.
Both duration branches use the compact form; Back/Continue retained the name and
both consents. Desktop original title, intro, reminder and 10 px labels retained.

Fresh 72 booking tests, booking typecheck and production build passed. Browser
checks verified all 31 October dates resolved, fully unavailable October 1 red
and disabled with Continue blocked; synthetic booked October 3 12:00 hour red;
matching start/end grid labels with only valid end boundary enabled; compact
English/Danish form; modification unavailable date disabled and heading focus.
Screenshots use new filenames in ttd-candidate; earlier evidence is preserved.
No purchases/modifications or hosted changes performed. The separate predeployment
review and explicit owner approval hold still applies.


## Owner desktop details and contact refinement — 1 October 2026

Candidate `f0beaa99b75675a4977ddaf2a4c7792b7d167d58`, build `FtUisR8hPDn6Q_UM4zRhK` supersedes the earlier desktop-heading
preservation requirement for the expressly approved replacements only.
Desktop studio details remove 04 / YOUR DETAILS (and Danish eyebrow), rename
Prepare your booking to Enter your details / Indtast dine oplysninger, and place
the heading at the former eyebrow position with zero top margin. Mobile heading
and compact form remain; desktop intro/reminder and all form behavior retained.

Contact desktop/mobile remove the 01 / SEND A MESSAGE heading row and the arrow
on its right (including Danish). Form top padding below divider reduced 28→16 px;
measured gap including border is 17 px at both 1440×1000 and 390×844. Submit
button arrow, remaining copy, field order, validation/privacy and server/mail
rules unchanged. Browser checked both languages, desktop/mobile field layout and
no mobile horizontal overflow. No contact message submitted.

Fresh booking typecheck and production build passed. Prior test evidence remains
separate; no new tests added for these copy/spacing edits. Fresh screenshots in
ttd-candidate use new filenames and preserve earlier evidence. Separate Step 6
review and explicit release approval remain pending; nothing pushed/activated.


## Owner desktop readability refinement — 1 October 2026

Candidate `36fba64a127f1983cd1d9436c40d27c2ae0f4709`, booking build `if-nibSY1tX8TWw1uy4jV`. Studio customer-details labels
are now 17 px on desktop as on mobile; optional helper text is 14 px. Overview
Date/Duration/Time rows and studio facts use 16 px text, Total price label 17 px,
and fact icons 22 px with stronger strokes. Removed Your studio time / Din tid
i studiet and reset Overview heading margin so it aligns vertically with facts.
At desktop widths below 1400 px facts stack beside the heading; the narrow
desktop summary reserves 360 px to avoid heading/fact overlap. No pricing,
availability, payment, server validation or field-order change.

Fresh booking typecheck and production build passed. Browser verified labels
17 px at 1440×1000, overview facts/rows 16 px and vertical centers aligned at
1440; 1024 and 821 desktop layouts fit, with no overflow/title overlap at 821
in EN/DA. Temporary viewport override restored. Screenshots in ttd-candidate:
`desktop-overview-readable.jpg`, `desktop-details-readable.jpg`. Prior test
evidence remains; tests were not rerun for this presentation-only refinement.
Separate Step 6 review and explicit owner release approval are still pending;
no hosted changes or human acceptance passes recorded.


## Owner authorizes private VPS release and in-situ review — 1 October 2026

Owner explicitly requested all local work committed/pushed and the candidate
deployed through normal PR/main/owner processes. The planned separate
predeployment review moves to the private hosted sandbox; earlier hold entries
remain as history. No completed review/acceptance is inferred. Fresh pre-push
72 booking, 21 server, 5 adapter/settings, 1 CSP response, 3 native email and
9 mocked installer tests passed. Automatic deployment remains disabled.
Native effective settings/templates must be inspected before application;
Access, restricted mail, sandbox payment and launch gates remain unchanged.


## Hosted pre-installation baseline — owner status received 2 October 2026

Owner checksum-verified the root-owned b285cbf package and ran its sanitized
status helper. Booking, communications and worker are healthy at c02936ab;
primary communications remains independently at PR28 be350a1. Host config is
076a1b0ea63269b1ec670b1ed46ec946967cb5bcd07953bc96a7d1c09f32e698.
Pretix web/cron use pinned 2026.7.0 image 5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02;
all three events are published test-mode. Booking roots, health and Pretix-backed
availability respond 200. Backup reported fresh (19.4 hours) with active timer;
supervised Pretix processes run. Sandbox/live-payment/unrestricted-mail gates
remain restricted; communications/worker are controlled and booking captures.
This is baseline evidence, not corrected-release or human acceptance.

Found before installation: the installer did not accept the running adapter
hash e1b875ac535b52a69f3be42f64c873de6294642ca889e930652b1a52c6cad983.
Independent git comparison confirms exact matching bytes at c02936ab and PR28
be350a1. Added only this identified baseline to the strict upgrade allowlist.
Two new real install-path tests verify upgrade/recreation and reject a modified
baseline before any host-file write or service command. All 11 mocked installer
tests pass. Candidate target hashes, runtime gates and application behavior are
unchanged. Do not run the old b285cbf installer; stage the corrected package.
Safe baseline evidence: ttd-candidate/vps-before-ttd-release.json.


## Hosted adapter installed — 2 October 2026

PR29 merged as 3e72b830ff4d927f5237e4cafbb191b471326d67 after all CI checks
and three image builds passed. Owner ran the checksum-verified corrected
a787c81 host package, independently compared byte-for-byte to merged main.
Installer PASS reports host configuration 148e0d8d70c75ea806d6a5c2734870a015269938102b82832dbb0728c560ba91
and preservation of application images. Independent owner commands found both
Pretix web/cron mounted adapter hashes equal the reviewed
6f5090eeb05be4460299bdec3fdcbc98604e2bb69eb0dfee965a1038779d4123.
Pinned Pretix image unchanged; web supervised processes RUNNING. Booking,
communications/worker remain healthy at c02936ab; primary remains independently
at be350a1. Roots/health/Pretix availability are 200, all 16 existing orders and
configuration cardinalities unchanged, backup fresh and sandbox/restricted-mail
gates preserved. Successful current application manifest still records the old
configuration as expected between adapter install and new image deployment;
config-install.json separately records the installed target.

Application publication/deployment, native settings/email activation, actual
response CSP/card behavior and final hosted human acceptance remain pending.
Safe evidence: ttd-candidate/vps-after-adapter-install.json.

Main publication 36933094466 succeeded for exact merge 3e72b830ff4d927f5237e4cafbb191b471326d67; validated three immutable artifact digests and host config148e0d8d against the installed owner status. Manual exact-digest deployment dispatched with release_run_id36933094466, while DEPLOY_ENABLED remains false. Running-release owner verification is still pending. Manifest: ttd-candidate/main-3e72b83-release.json.

Manual exact-digest deployment 36933697419 completed successfully for merge 3e72b830ff4d927f5237e4cafbb191b471326d67 and publication36933094466. The workflow validated the successful source publication and used all three immutable digests without rebuilding. Independent owner running-image/config/mount verification and native settings inspection remain required; CI success is not human acceptance.


## Running application release verified; native inspection permission issue — 2 October 2026

Owner status independently verifies all three running revisions/image references/
image IDs exactly match the published merge3e72b83 manifest, healthy with zero
restarts. Actual mounted runtime hashes and startup match host files. Current/
successful attempt manifests and installed host config148e0d8d agree; failed.json
is absent. Primary remains healthy on be350a1/digest45d721e8. Sandbox/payment/mail
gates and webhook restrictions remain preserved; Pretix order count16 and all
configuration cardinalities unchanged. Probes200, backup fresh, supervised
Pretix processes RUNNING. Evidence: ttd-candidate/vps-after-application-deploy.json.

Native inspection failed before script execution: docker cp preserved staged
root-only permissions and the unprivileged pinned-image user could not read
configure-ttd-checkout.py. Neither activator ran and no settings/templates
changed. Correct only the four temporary non-secret package files: root-owned,
Pretix group15371, directory0750/files0440. Then rerun read-only inspection.
This is a staging/instructions issue, not an application/payment failure.
Actual native policy/email and CSP/card/mail acceptance remain unverified.


## Native inherited email defaults correction — 2 October 2026

Owner policy inspection succeeded and reports only approved DK/colour/customer
policy deltas. No apply flag was used. Native email inspection failed before
any writes because default LazyI18nString.data is upstream LazyGettextProxy,
not the explicit dictionary seeded in the earlier local fixture. Independent
inspection of pinned 2026.7.0 confirms this representation. Corrected reader
resolves all supported native translations via localize(); explicit mappings
retain all their existing keys. EN/DA before/after drift validation remains
strict and both events validate atomically before writes. Only the originally
approved EN/DA phrase changes; non-EN/DA effective copy remains identical.
Inherited defaults become explicit snapshots on approved activation to retain
all supported translations. Setting keys, placeholders, artwork, signatures,
attachments, payments and application release identity are unchanged.

Five email tests pass, including inherited-default handling, extra-language
preservation, idempotence and late inherited drift rejecting all writes. A new
isolated no-network/read-only pinned Pretix runtime with ephemeral SQLite
passed real inherited-default inspection/apply/idempotence, checking every
supported language before and after; also passed explicit snapshots/extra
German copy/idempotence, actual native email constructors/settings in both
events, actual card/response CSP in all three events EN/DA and scoped checkout
settings activation. No orders/payments/mail sends. Separate 5 adapter/settings,
1 response-CSP and 11 mocked installer tests also pass. The earlier test
coverage limitation is preserved as review history; hosted inspection and
activation remain pending. Evidence: ttd-candidate/inherited-email-runtime.txt.
