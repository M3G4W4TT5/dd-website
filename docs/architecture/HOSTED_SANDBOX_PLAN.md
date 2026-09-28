# Private hosted booking and sandbox testing

Approved for implementation on 28 September 2026. The current execution checkpoint is [HOSTED_CURRENT_CHECKPOINT.md](HOSTED_CURRENT_CHECKPOINT.md). Live payments and public launch remain separate.

## Scope and preparation

- Deploy only booking, booking communications, its worker, Pretix, PostgreSQL, Redis and the necessary ingress. Exclude the personal site and primary communications service.
- Build production images off-server and deploy identified artifacts; do not build the application on the VPS.
- Start with fresh hosted application databases and credentials. Deliberately carry over useful Pretix organizer/event/product, schedule, quota, question and language configuration; do not copy development orders, sessions, tokens or obsolete credentials. Preserve useful configuration without indiscriminately recreating shared volumes.
- Use the existing owner login for private access. No tester roster or separate approval process for routine steps is required.

## Private access and application configurations

Protect both `booking.didde-mie.com` and `checkout.didde-mie.com` with Cloudflare Access. Enforce origin protection so direct requests cannot bypass Access, using an authenticated origin connection and Access-token validation appropriate to the chosen ingress. Do not add a second interactive Basic-auth layer. Keep private access enforced throughout smoke, payment and email testing; `PREVIEW=true` is not access control.

Every hosted configuration uses `DD_MODE=production`, HTTPS public origins and `PAYMENT_ENVIRONMENT=sandbox`. Keep `PAYMENT_RELEASE_ENABLED=false` and `MAIL_RELEASE_ENABLED=false`; do not install live payment credentials or enable unrestricted mail.

| Configuration | Application behavior | Delivery |
| --- | --- | --- |
| Initial smoke testing | `PREVIEW=true`; `PRETIX_EVENTS_CHECKOUT_ENABLED=false`; `BOOKING_SELF_SERVICE_ENABLED=false` | Application `.eml` capture and Pretix Mailpit capture; no external SMTP credentials |
| Private Stripe sandbox testing | `PREVIEW=false`; enable only checkout/self-service gates needed for the tests below after smoke checks pass | Capture only, with synthetic customer details and Stripe test cards |
| Controlled email testing | `PREVIEW=false`; retain only the sandbox gates needed for the agreed tests | Selected application senders use `MAIL_DELIVERY=controlled`, with `MAIL_RECIPIENT_ALLOWLIST=dev@memoryone.eu` and scoped SMTP credentials |

The controlled external recipient **dev@memoryone.eu is approved**. Pretix stays on Mailpit until its recipient restriction is verified; a test event alone does not restrict outbound recipients. Any Pretix external-mail test must enforce the same recipient restriction before connecting its external SMTP transport. Booking web never receives SMTP credentials.

`PREVIEW=true` suppresses marketing effects and rejects open write gates and external SMTP credentials. Turning it off for sandbox testing permits those explicitly configured behaviors while Access still protects the sites. Use synthetic opt-in fixtures when exercising marketing.

## Exact callback handling

### Stripe to Pretix

The sole public callback exception is **POST `https://checkout.didde-mie.com/_stripe/webhook/`**. The path was confirmed against pinned Pretix `2026.7.0`; confirm it again in its hosted Stripe settings before creating the Stripe endpoint. Never substitute a broad `/api/`, `/stripe/` or event-path wildcard.

Configure a path-specific Access exception and exact host/path/method checks at ingress. Preserve the raw body and Stripe headers; enforce a suitable body bound and rate limit. This callback must not encounter interactive Access or ingress Basic authentication. Browser payment return/3-D Secure pages remain Access-protected.

Pinned Pretix does not verify the Stripe signature itself: it treats callbacks as untrusted triggers and retrieves authoritative Stripe objects using its authenticated API connection. The deployment verifier checks the signed timestamp and raw body with the Stripe SDK before forwarding to Pretix; invalid signatures stop first. Keep Pretix's authoritative refetch.

Confirm a legitimate sandbox callback, rejected forged requests, repeated delivery and the resulting authoritative order/payment state. A browser return is not payment proof.

References: [Pretix Stripe setup](https://docs.pretix.eu/guides/payment/stripe/), [upstream callback implementation](https://github.com/pretix/pretix/blob/master/src/pretix/plugins/stripe/views.py), [Cloudflare path policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/).

### Pretix to booking

Configure Pretix to POST to the credential-free internal target `http://proxy:8081/api/manage/pretix-webhook`. The unpublished proxy listener adds the existing dedicated Basic credential and forwards to `http://booking:3000/api/manage/pretix-webhook`. Pinned Pretix cannot attach that header itself, and a credential in its target URL would be retained in webhook-call diagnostics. Neither internal port is publicly published; deny the booking webhook at public ingress. No Access exception or Access service token is needed. Pretix requires its instance-wide `ALLOW_HTTP_TO_PRIVATE_NETWORKS=True` for this sandbox; reassess that setting before public launch.

Booking retains bounded authenticated intake, organizer/event checks, durable notification-ID deduplication and authoritative Pretix reads. Verify wrong credentials, legitimate delivery and retries. If services are later split across hosts, replace this private-network arrangement with authenticated HTTPS as a separately reviewed configuration.

All other browser pages and APIs, including recovery and marketing actions, remain Access-protected. Private service-to-service API calls use the service network and their own scoped credentials; do not broadly exempt public API routes.

## Get it running, then test

1. Start the private stack with payment/write gates closed and capture mail. Verify HTTPS, Access and direct-origin denial, scoped roles, health, supervision, secret placement and callback routing. Set and check basic CPU/memory/PID limits, connection budgets, disk headroom and bounded log rotation before hosted testing. Redact credentials, bodies, cookies and tokenized query strings from logs.
2. The owner deferred the initial backup and isolated restore check to step 10 of the remaining deployment sequence, together with operational recovery rehearsals. This check is no longer a prerequisite for the approved steps 1–9 or synthetic sandbox orders. Backup/restore verification, including content and sequence state with outgoing integrations disabled, remains required before launch.
3. Enable the agreed sandbox gates and run the tests below. Use synthetic details and Stripe test cards throughout.
4. Run controlled delivery to the approved email address, checking the relevant sender policies and delivered headers. Keep all other recipients blocked.
5. After the initial run, choose and configure recurring backups, destination, retention and failure reporting. Assess inexpensive AWS or available free options, including Cloudflare, without assuming pricing or suitability. Nightly backups and 14-day retention are proposals, not established requirements. Follow with the fuller recovery, upgrade/rollback, concurrency and DST rehearsal before launch.

## First sandbox run

- **Rental:** buy a booking, verify payment and EN/DA confirmation/recovery, move it to an eligible slot with the same price/duration, then cancel and verify exactly one full provider refund and accurate refund-status mail.
- **Events:** buy one dated-series ticket and one single-event ticket; verify authoritative payment state, confirmation and ticket delivery. Event administration remains Pretix-owned.
- **Failures:** exercise a declined card and a 3-D Secure challenge.
- **Reliability:** replay a webhook, repeat a cancellation request and restart the worker; verify no duplicate refund or business notification.
- **Restrictions:** check the 24-hour cutoff, unavailable slots and stale booking changes, including denied attempts leaving remote state unchanged.
- **Email:** inspect captured EN/DA messages and controlled messages delivered to `dev@memoryone.eu`, including sender, Reply-To, envelope/Return-Path, links, authentication headers and inline assets where applicable.

Record concise sanitized outcomes. More extensive failure/concurrency, DST, quota/cross-channel reservation and recovery checks in [OWNER_FOLLOW_UP.md](OWNER_FOLLOW_UP.md) remain required before launch; they need not all be completed in this first run.

## Temporary private capture

Hosted Mailpit is only a temporary sandbox capture service. Its SMTP listener is internal; its UI binds to loopback and is inspected through an authenticated SSH tunnel. Give it no public hostname, ingress route or external relay. It must never become a production delivery dependency.

Application `.eml` captures use restricted per-service directories outside Git and web roots. Inspect them through SSH/SFTP into a private local directory; do not expose them through the booking site. Both capture stores contain addresses and access links and must be treated as sensitive.

Set short age and size limits during initial setup and record the actual limits with log rotation settings. Keep raw captures only for the active test/debug window, then remove them from both hosted and downloaded capture stores. Retain sanitized results instead of raw messages where possible; do not include captures in routine backups by default. Remove Mailpit after capture testing, once the explicitly authorized delivery configuration is ready. There is no approved permanent capture-retention schedule.

## Approval and remaining choices

One approval may authorize this hosting/sandbox run, its necessary application gates, sandbox callback configuration and agreed test transactions. Do not ask again for ordinary steps already covered by that scope. Controlled email to `dev@memoryone.eu` is included; additional recipients, live payments and public launch remain separately controlled. Owner-run sudo still applies where necessary.

The backup provider, recurring frequency and long-term retention can be chosen after this sandbox run. No tester list or further sandbox transaction definition is needed. Current progress and the single owner checkpoint are tracked in [HOSTED_CURRENT_CHECKPOINT.md](HOSTED_CURRENT_CHECKPOINT.md).

Related: [operations](OPERATIONS.md), [owner follow-up](OWNER_FOLLOW_UP.md), [local implementation evidence](IMPLEMENTATION_NOTES.md).
