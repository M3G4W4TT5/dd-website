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
