# Marketing subscriptions and manual campaigns

DD and TTD use independent fixed-identity communications processes and physically separate marketing schemas. The primary static site calls `PUBLIC_SERVICES_URL`; booking uses same-origin form adapters. Booking web has no newsletter/contact SMTP credentials or marketing database role. [Operations](architecture/OPERATIONS.md) covers config, migrations and verification.

Signup records pending consent, source, wording version and language. A captured/sent confirmation link requires explicit POST activation before the address becomes active. Tokens are purpose/list-bound, single use and expire after 48 hours. GET/render never confirms. Unsubscribe requests return generic success; the explicit link action withdraws that list only. Booking consent remains optional and initially unchecked; unavailable optional marketing does not prevent checkout. Preview suppresses marketing side effects.

Primary messages use newsletter@didde-mie.com; booking promotions/subscription messages use booking@didde-mie.com. Inquiry/acknowledgement uses the corresponding contact/booking mailbox. Production controlled mail requires a recipient allowlist; provider policy and external delivery remain [owner checks](architecture/OWNER_FOLLOW_UP.md). Local verification uses capture, not external mail.

Run the shared operator tool with `OPERATOR_DATABASE_URL` for the matching primary/booking marketing operator. Choose the list explicitly. Exports include active members only, create a new mode-0600 file outside the repository, and never print addresses:

```bash
node --env-file=/private/operator/primary.env --import tsx server/database/scripts/operator.ts primary export /private/exports/dd-active.csv
node --env-file=/private/operator/booking.env --import tsx server/database/scripts/operator.ts booking export /private/exports/ttd-active.csv
node --env-file=/private/operator/primary.env --import tsx server/database/scripts/operator.ts primary cleanup
```

For reply-based withdrawal or a hard bounce, run `withdraw` or `suppress` instead of export, then enter the one address on standard input and finish with Ctrl-D. Do not put customer addresses in shell history. Both invalidate existing action tokens under the same per-address lock as public consumption. Cleanup is scoped to that schema and removes expired tokens and pending requests older than 30 days.

Campaigns remain manual. Approve copy and current active-list export first, send from the correct identity, use BCC rather than exposing recipients in To/CC, include the relevant site's `/unsubscribe` page and a monitored reply option. Honor withdrawals/suppressions before each campaign. Do not copy subscribers between DD and TTD. Marketing suppression does not stop necessary booking receipts/recovery. Verify provider/inbox/bounce handling and privacy details before inviting public signups.
