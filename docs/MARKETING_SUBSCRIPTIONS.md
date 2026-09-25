# DD newsletter and TTD Studio email promotions

## Boundaries

The personal site signs people up for DD Production updates about Didde-Mie's work and dance videos. The booking site has a separate, initially unchecked option for TOTAL ENTERTAINMENT emails about TTD Studio offers, new events and discounts. A submitted form creates a pending request; only the recipient's confirmation activates it. Booking and transactional mail are separate.

The personal Astro site is static. Its signup and unsubscribe forms call the booking application's `/api/marketing` endpoint. The booking server therefore needs the `NEWSLETTER_SMTP_PASSWORD` and `CONTACT_SMTP_PASSWORD` even though those addresses belong to the personal site. Do not move those passwords into `apps/personal/.env.local`: static Astro cannot supply them to the server or keep them secret in a production build. Keep the personal sender's credentials separate from `BOOKING_SMTP_PASSWORD` and the booking confirmation sender.

## Current status and public launch checklist

As of 25 September 2026, the code is implemented locally and the separate local `marketing` database schema is applied. Both lists passed a live signup, confirmation and unsubscribe test using the two sender mailboxes; those test subscriptions are now unsubscribed. The implementation has **not been deployed**. The local confirmation links use `127.0.0.1` and are not suitable for public recipients.

Before public deployment:

1. Set `SUBSCRIPTIONS_PUBLIC_BASE` to the booking site's public **HTTPS origin** so confirmation and unsubscribe emails lead to a reachable page. Set `PUBLIC_BOOKING_URL` in the personal site's build environment to that same booking origin; the static personal forms send requests there.
2. Put `SUBSCRIPTIONS_DATABASE_URL`, `NEWSLETTER_SMTP_PASSWORD`, `BOOKING_SMTP_PASSWORD` and `CONTACT_SMTP_PASSWORD` in the booking server's secret store. Use the production marketing database, separate from Pretix. Set `CONTACT_PERSONAL_ORIGIN` and `CONTACT_BOOKING_ORIGIN` to the exact public site origins, and check the other production settings against `apps/booking/.env.local.example` and `apps/personal/.env.example`. Do not publish server secrets in the personal build or commit either local `.env.local` file.
3. Back up and restore-test the production marketing database. Confirm both public forms, the booking checkbox, confirmation links, unsubscribe pages and reply mailboxes end to end on the deployed HTTPS sites before inviting signups.
4. Finish the privacy policies' pending provider, transfer and deployment-specific details before launch. Keep marketing consent separate from booking terms and keep the TTD marketing checkbox initially unchecked.
5. Set up the DD newsletter and TTD Studio promotional-message templates together in the corresponding Purelymail Webmail accounts. Include the correct sender identity and unsubscribe page in each template, then send a test of each before the first campaign. Campaigns remain manual; no CMS or automated bulk sender is part of this implementation.

## Database setup

Use the existing PostgreSQL **service**, with a separate `marketing` database and a dedicated login role. Do not alter the `pretix` database or its volume. The Compose file publishes PostgreSQL to host loopback port 5433 for the locally running Next.js app; it does not publish it to the network.

1. On the host with `sudo docker` access, run the setup script from the repository root. It creates the dedicated role and database, applies `apps/booking/subscriptions.sql`, and writes a generated secret to the ignored booking `.env.local`. It does not recreate containers or volumes.

```sh
bash apps/booking/scripts/setup-marketing-db.sh
```

2. To expose the database only to the locally running Next.js app, apply the Compose port change (`127.0.0.1:5433`). `sudo docker compose up -d postgres` may briefly recreate the **container**, while keeping the named `pretix-postgres` data volume. Take a verified database backup and schedule this step so it does not interrupt active Pretix work. Do not remove or recreate the volume.
3. In production, put the connection URL in the deployment secret store and use the database's internal host/port. Set `SUBSCRIPTIONS_PUBLIC_BASE` to the public HTTPS origin of the booking app, which hosts the confirmation pages.
4. Back up and restore-test the `marketing` database alongside the existing Pretix database. Keep the databases logically separate.

The sender settings remain in `apps/booking/.env.local` and must be replicated as server secrets on deployment. The newsletter confirmation sender uses `newsletter@didde-mie.com`; TTD confirmation uses `booking@didde-mie.com`. Test sender authorization, inbox delivery, replies and failed delivery before publicly enabling the forms. No customer address or app password belongs in Git.

## Manual campaign workflow

Marketing campaigns are composed and sent manually in the corresponding Purelymail Webmail. There is no campaign CMS or automated bulk sender. Before each send, export only the active addresses for that list. The export tool writes a new private CSV with mode `0600`; it will not overwrite an existing file:

```sh
node --env-file=apps/booking/.env.local --import tsx apps/booking/scripts/marketing-admin.ts export personal /tmp/dd-active-2026-09.csv
node --env-file=apps/booking/.env.local --import tsx apps/booking/scripts/marketing-admin.ts export booking /tmp/ttd-active-2026-09.csv
```

Use the correct sender and list; do not copy addresses between the two businesses. In Webmail, put recipients in **BCC**, never To or CC. Each marketing message must identify the sender, state how to unsubscribe, and include the relevant public page:

- DD: `https://didde-mie.com/unsubscribe`
- TTD Studio: `https://ttd.didde-mie.com/unsubscribe`

Also accept unsubscribe requests sent by reply. Apply such a request promptly before the next export:

```sh
node --env-file=apps/booking/.env.local --import tsx apps/booking/scripts/marketing-admin.ts unsubscribe personal subscriber@example.com
node --env-file=apps/booking/.env.local --import tsx apps/booking/scripts/marketing-admin.ts unsubscribe booking subscriber@example.com
```

Delete each local CSV after composing the campaign. Do not reuse a prior export: a subscriber may have withdrawn consent since it was made. Create the Webmail message templates together with the owner after the signup implementation is verified, as requested.

The website unsubscribe form emails a confirmation link to the submitted address. Its response does not disclose whether the address is on the list. The link's final button stops future marketing for that list. A reply request can be handled directly with the command above. Booking confirmations and receipts continue independently.

Run `node --env-file=apps/booking/.env.local --import tsx apps/booking/scripts/marketing-admin.ts cleanup personal` periodically. The list argument is required by the CLI; cleanup covers both lists. It removes expired tokens and pending requests older than 30 days, without deleting active subscribers.
