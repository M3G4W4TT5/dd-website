# Studio booking prices

The booking preview reads hourly prices and the full-day discount from the `TTD Studio` event series in pretix. No amount or percentage for the full day is stored in website code. The browser receives price data from `/api/availability`; `/api/quote` and `/api/preflight` fetch fresh pretix data before accepting a selection. The current flow checks availability and customer details; it does not create an order or take payment.

## Current local test setup

- Product `TTD Studio — studio hour`: DKK 250 per hour.
- Automatic discount `Full day studio: 14 hours, pay for 12`: active; limited to the studio-hour product; minimum 14 matching products; distinct event-series dates; 100% off the cheapest two matching products; all supported sales channels.
- A continuous 08:00–22:00 selection therefore quotes DKK 3,000. The discount rule is owned by pretix. If the hourly product price changes, the full-day total changes too.

The website recognizes this specific pretix rule shape and applies it only to a continuous 14-hour selection on one Copenhagen calendar day. A missing, extra, or unsupported active discount affecting the studio-hour product makes availability fail closed so the page cannot silently show an incorrect price.

Pretix's native condition counts products on distinct event-series dates; it does not establish that the selected hours are consecutive or on one calendar day. The website enforces those constraints for its own selection. Before enabling payment, the checkout must put exactly those 14 hourly positions into one pretix cart/order, verify pretix's calculated total and availability, and prevent direct shop paths from selling a differently composed discounted set. Pretix also states automatic discounts do not apply when changing an existing order, so rescheduling needs its own price policy.
