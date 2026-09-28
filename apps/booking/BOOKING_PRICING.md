# Studio booking prices

The booking preview reads hourly prices and the full-day discount from the `TTD Studio` event series in pretix. No amount or percentage for the full day is stored in website code. The browser receives price data from `/api/availability`; `/api/quote` and `/api/preflight` fetch fresh pretix data before accepting a selection. The booking form then sends the accepted quote to `/api/rental/checkout`, which rechecks every hour and price, creates one pending Pretix order as the reservation, verifies its positions, discount and total, and hands the customer to Pretix for sandbox payment. A redirect alone is never payment evidence.

## Current local test setup

- Product `TTD Studio — studio hour`: DKK 250 per hour.
- Automatic discount `Full day studio: 14 hours, pay for 12`: active; limited to the studio-hour product; minimum 14 matching products; distinct event-series dates; 100% off the cheapest two matching products; all supported sales channels.
- A continuous 08:00–22:00 selection therefore quotes DKK 3,000. The discount rule is owned by pretix. If the hourly product price changes, the full-day total changes too.

The website recognizes this specific pretix rule shape and applies it only to a continuous 14-hour selection on one Copenhagen calendar day. A missing, extra, or unsupported active discount affecting the studio-hour product makes availability fail closed so the page cannot silently show an incorrect price.

Pretix's native condition counts products on distinct event-series dates; it does not establish that the selected hours are consecutive or on one calendar day. The website enforces those constraints for its own selection. The checkout puts exactly those 14 hourly positions into one Pretix order and checks the resulting total and two discounted positions. The pinned Pretix 2026.7 order-create API currently discounts only one position when asked to apply this rule automatically, so the server explicitly assigns the verified rule to the final two positions at the rule's 100% discount, simulates the order, and verifies the created order again. A changed rule, amount or inventory fails closed. The checkout proxy blocks native rental shop/cart entry while allowing the validated order's payment pages. Pretix owns the 20-minute pending-order expiry and payment/refund state. Retries use a deterministic order code derived from the submission identity and recover the same pending order. Pretix also states automatic discounts do not apply when changing an existing order, so rescheduling retains the separate same-price policy.
