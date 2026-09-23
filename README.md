# DD platform — local development

The studio booking site is the first implementation priority. The personal site is a separate Astro application with placeholder content. This implementation stops before payment, SMS, calendar synchronization, Instagram connection, and SMTP. Public checkout remains unavailable until payment is implemented and tested.

The client specifications and implementation plan live one directory above this Git repository:

- `../SPECIFICATIONS.md`
- `../IMPLEMENTATION_PLAN.md`
- `../DESIGN_REFERENCES.md`

## Local services

The isolated Docker Compose project runs pretix Community 2026.7.0, PostgreSQL, Redis, and a periodic pretix maintenance task. It binds pretix only to `127.0.0.1:8345`. It configures no SMTP service or payment provider. The volumes hold development data and are never committed.

1. Copy `.env.example` to `.env` and replace the password with a long random value.
2. Run `docker compose up -d` (or `sudo docker compose up -d` where Docker access requires it).
3. Open `http://127.0.0.1:8345/control/` for the local pretix administrator interface.
4. Run `docker compose down` to stop the isolated stack. Do not add `-v` unless you intentionally want to delete its development data.

pretix's official [small-scale Docker guide](https://docs.pretix.eu/self-hosting/installation/docker_smallscale/) explains the first-login process. Change its initial administrator password before exposing the instance to anyone else. On this development device the password has been rotated and stored in the ignored, mode-600 `.local-admin-password` file. Never use real customer data in this local instance.

## Booking preview

Requires Node 24 or later. Run `npm ci`, then `npm run dev:booking` and open `http://127.0.0.1:3000`. The booking UI is in Danish and English. It lets a visitor select a start time and consecutive one-hour slots, displays an indicative total, and checks current availability again on the server. A second local preflight validates the customer fields and checks availability once more. **Neither check stores customer details, holds slots, starts payment, or creates an order.**

Without a complete `apps/booking/.env.local`, the page shows labeled sample times and a sample DKK 300 hourly price. For real read-only inventory, copy `apps/booking/.env.local.example` to `apps/booking/.env.local`, then set the pretix organizer slug, event-series slug, product ID, and a restricted team API token. Create a token under the organizer's **Teams** page with only view permissions for the event's settings, dates, products, and quotas. Keep the token out of Git. The example `.env.local` is ignored by Git.

This device's local pretix instance has a test event series `dd-studio/studio`, product ID 1, and one-hour dates on 25–27 September 2026, 09:00–18:00 Copenhagen time. These are test fixtures, not DD-approved operating hours or prices. A zero-capacity quota blocks 25 September at 13:00 to exercise the unavailable-middle-hour case. The test data lives in Docker volumes, not the repository. To make a fresh instance, use the pretix administrator UI to create an event series, a non-admission hourly product, and one capacity-one quota for each one-hour date. A quota capacity of zero blocks an hour. Keep the event in test mode.

Run `npm run test:booking`, `npm run typecheck`, and `npm run build:booking` to check the booking code. A local Community API proof created one pending two-hour **test-mode** order, verified that both hours were held and that an overlapping two-hour order was atomically rejected, then deleted the order. No payment or email was sent. The temporary privileged API token was revoked after the proof. This establishes only the local inventory behavior, not a finished customer checkout.

## Personal preview

Run `npm run dev:personal` and open `http://127.0.0.1:4321` after installing dependencies. The page uses clearly labeled sample content and links to the local booking preview. Its contact and Instagram areas are UI placeholders until the excluded integrations are implemented and DD approves content and links.

The two sites have separate visual systems. DD's personal site takes its black, white, pink, oversized-type and responsive-image direction from Dance Festival Malta. The booking site takes its offset image grid, condensed type, section colors, and blur reveals from Lanterne Architectes, adapted to muted greens and earth tones. All current photos in `apps/*/public/concepts/` are generated **illustrative concepts**. They do not depict DD, a real credit, or her actual Copenhagen studio, and must be replaced by approved media before publication.

## Stop point

The chosen domain, studio email/calendar address, hourly rate, operating schedule, final cancellation terms, approved media, and external accounts are pending. Do not make the booking site publicly reachable or treat quoted times as reservations. Before production, finish order creation and paid checkout, customer order access and changes, calendar synchronization, Instagram connection, SMS, SMTP, and the acceptance scenarios in `../SPECIFICATIONS.md`.
