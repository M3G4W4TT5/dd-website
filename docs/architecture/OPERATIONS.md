# DD/TTD infrastructure operations

The [approved architecture/checklist](IMPLEMENTATION_PLAN.md) defines the boundaries. [Implementation evidence](IMPLEMENTATION_NOTES.md) records local verification; [owner actions](OWNER_FOLLOW_UP.md) govern deployment and launch. Nothing in this document authorizes VPS deployment, DNS/provider changes, external mail, live payments, push or merge.

## Processes and configuration

The static primary frontend calls its own fixed-identity communications process using `PUBLIC_SERVICES_URL`. `PUBLIC_BOOKING_URL` is navigation only. Booking browser forms use same-origin `/api/contact` and `/api/marketing`; the ingress or Next adapter forwards these to booking communications. Neither app imports the other's implementation or env file. Only `@dd/contracts` is browser-safe. Other workspace packages reject browser resolution.

Primary communications owns primary contact and newsletter mechanisms, its marketing role and payload key. Booking communications owns booking correspondence/marketing, its marketing role/key and dedicated internal verifier. Booking web owns availability, management/session APIs and webhook intake; it has no SMTP or marketing DB credential. Booking worker owns recovery, rental notifications and reconciliation with a read-only Pretix token. It has no session-table access or write API token. Pretix alone owns Redis, order/payment state, receipts, invoices and event tickets.

Use the env examples under `infra/`, `apps/booking/.env.local.example` and `apps/personal/.env.example`. `DD_MODE=development` requires capture with no SMTP passwords. `DD_MODE=production` requires explicit sandbox/live payment choice and HTTPS public origins. Production defaults to capture. `MAIL_DELIVERY=controlled` requires a recipient allowlist and scoped SMTP credentials; `enabled` additionally requires `MAIL_RELEASE_ENABLED=true`. Live payment requires its own release gate. Keep checkout and self-service gates disabled until owner checks pass. `PREVIEW=true` rejects external-mail secrets and open write gates and suppresses private marketing side effects.

Primary production static builds require explicit HTTPS `PUBLIC_SERVICES_URL` and `PUBLIC_BOOKING_URL`; these remain public configuration only.

Primary SMTP correspondence authenticates as contact; its marketing transport uses a separate newsletter credential (`MARKETING_SMTP_*`). Booking correspondence authenticates as booking. The worker and Pretix use separately revocable booking credentials where the provider supports them, with the exact tagged sender authorized. Application validation does not prove provider restrictions.

Local commands, from repository root, after private configuration is provisioned:

```bash
node --env-file=infra/local/primary-communications.env --import tsx server/runtime/main.ts primary
node --env-file=infra/local/booking-communications.env --import tsx server/runtime/main.ts booking
node --env-file=infra/local/booking-worker.env --import tsx apps/booking/server/worker.ts
npm run dev:booking
npm run dev:personal
```

The booking app reads only its scoped `.env.local`; communications and worker never load it. The local private files are ignored and mode 0600. Capture messages contain tokens/addresses and must remain private. They are RFC822 files under the configured capture directory; no external SMTP is contacted. Native Pretix uses loopback-only Mailpit at port 8025, SMTP service `mail-capture:1025`, without an external relay.

## Public and private API contracts

All public mutations are POST JSON, byte-bounded before full reads, with exact configured Origin. OPTIONS permits the configured public origins without cookies/credentialed CORS. Responses are no-store with no-referrer and `Vary: Origin`. Invalid method/origin/content type/body returns 405/403/415/413; malformed fields return 400, persisted abuse limits return 429 with Retry-After, dependencies return generic 503. Honeypots succeed without delivery. Membership requests do not disclose membership.

- `/api/contact`: original site-specific fields and copy; inbox and sender are fixed by process. Inquiry delivery is synchronous; failed acknowledgement does not negate an accepted inquiry. No inquiry body is stored in the database.
- `/api/marketing`: `action: subscribe|unsubscribe`, email, language; fixed list rejects another supplied list. Subscription requires explicit consent where supplied by the booking forms. Activation requires double opt-in.
- `/api/marketing/action`: `purpose: confirm|unsubscribe`, token and fixed list. Tokens bind purpose and schema; hash-only storage, 48-hour expiry and single-use POST. GET/render never activates. Each site hosts its own action pages. Mail links carry tokens in fragments, clients remove them from location, and pages use no-referrer/no-index/no tracking.
- `/internal/booking-subscription`: booking communications only; bearer-authenticated, explicit `optIn:true`, allowlisted booking-details/event-signup source, idempotency key, email/language. No Origin/CORS authentication shortcut, arbitrary mail/template/export API or cross-list routing. HTTPS is required across hosts. The booking private network may use HTTP on the same host. Public ingress rejects `/internal/`. Booking opt-ins derive private idempotency from source and submission UUID, never address or event identity. Retries keep the same key; a new submission after withdrawal/confirmation expiry gets a fresh key. A confirmation within the existing 15-minute mail throttle is queued for that boundary rather than leaving a pending membership without a delivery.
- `/api/manage/pretix-webhook`: Basic-authenticated, size-bounded configured organizer/event/order trigger with provider notification ID. Persist and deduplicate before acknowledging; authoritative reads determine recipients/state. Subscribe to relevant paid/change/cancellation/refund actions on hosting; periodic reconciliation also discovers admin changes.
- `/api/manage/request-link`, `/api/manage/access`, `/api/manage/booking`: bounded same-origin requests and scoped management session. Recovery uses a submission UUID instead of an address/hour delivery identity, retaining the three-per-address/hour and global request limits. Browser submissions preserve `Idempotency-Key` across failures and renew it after acceptance or changed input; callers omitting the header make a new request each time. Recovery generates a 15-minute hash-only token near actual delivery; POST consumes it once and creates a one-hour host-only HttpOnly SameSite=Lax session with Secure in production. Session order codes are authoritative and restricted. No Pretix order secret reaches the browser.

Trust only explicitly configured proxy IPs. `TRUSTED_PROXY_IPS` is an exact allowlist, not arbitrary forwarded headers. Configure the fixed ingress address before hosted abuse-limit tests; otherwise the service safely counts the peer proxy as one client. The proxy logs `$uri`, never query strings, bodies, credentials or cookies. Preserve the same rule at the outer TLS ingress.

## Provisioning, migrations and grants

Use PostgreSQL 17 with databases `pretix`, `marketing`, `booking_management`. Runtime identities do not own tables, inherit migration roles, create databases/roles or bypass row security. Marketing has separate `primary_marketing` and `booking_marketing` schemas, restricted CONNECT/schema grants and fixed search paths. Management gives web and worker only their named tables. Future management tables require reviewed explicit runtime grants; future marketing/Pretix tables and sequences inherit their migration owner's defaults. Backup SELECT on tables and sequences applies to existing objects and defaults under each migration owner in all domains. Sequence SELECT allows state inspection for pg_dump; backup cannot call nextval/setval. `schema_migrations` is owner-only.

`server/database/scripts/provision.ts` is an explicit administrator job for a fresh hosted cluster or repeatable grants. Supply `PROVISION_DATABASE_URL` from a private operational env file and `PROVISION_DIRECTORY` pointing to the private secret directory. It creates scoped roles/databases/schemas, applies the initial application migrations and writes `roles.env` and the resumable private password registry, mode 0600. It does not start applications or configure providers. Review subsequent configuration per process rather than mounting `roles.env` into apps. Existing Pretix table ownership must already belong to `pretix_migrator`; the local transition includes that ownership transfer. Never run a new cluster's bootstrap role as Pretix runtime.

```bash
node --env-file=/private/operator/provision.env --import tsx server/database/scripts/provision.ts
node --env-file=/private/operator/primary-migration.env --import tsx server/database/scripts/migrate.ts primary
node --env-file=/private/operator/booking-migration.env --import tsx server/database/scripts/migrate.ts booking
node --env-file=/private/operator/management-migration.env --import tsx server/database/scripts/migrate.ts management
```

Each migration env contains only `MIGRATION_DATABASE_URL` for the matching migrator. Migration versions execute transactionally under a domain advisory lock. The scoped initial provision is resumable; do not remove volumes. Local `transition-local.sh` is specifically the owner-assisted existing-development cutover, not a hosted bootstrap command. It retires old application writers/credentials, preserves event/product configuration and runs Pretix migration separately. The old PostgreSQL bootstrap role cannot be demoted and is renamed `dd_bootstrap_admin` with NOLOGIN; no application receives it.

Pretix 2026.7.0 entrypoint was inspected: `AUTOMIGRATE=skip` prevents startup DDL. Use the same pinned image and `pretix-migrate` profile/job with `pretix_migrator` before starting runtime/cron with `pretix_runtime`. Re-run isolation checks after schema changes.

## Deployment preparation

`infra/Dockerfile` has separate booking standalone, communications, worker and optional static-primary targets. Production builds receive public config only. `.dockerignore` excludes all env files, private configs/captures, dependencies/build outputs, Git and unrelated clips. `infra/compose.production.yaml` uses distinct non-root users, read-only application filesystems, tmpfs, dropped capabilities, restart policies, bounded health checks and separate secret mounts. No Docker socket is mounted. PostgreSQL and Pretix Redis have internal networks; HTTP ingress alone is loopback-exposed. Optional primary profile is not a booking dependency.

On hosting, place process files outside the repository under `DD_SECRET_DIRECTORY`, mode 0400 and owned/readable by the corresponding UID: booking 10001, booking communications 10002, worker 10003, primary communications 10004; Pretix config must be readable by its image user 15371. Compose bind-backed secrets do not enforce UID/mode automatically. Never give every service the whole secret directory. Keep administrator/migrator/backup files inaccessible to application users. Provide separate `pretix-runtime.cfg` and `pretix-migration.cfg`; use the normal Pretix INI database, Redis and mail settings and keep SMTP capture/controlled until authorized.

The base proxy exposes studio and checkout vhosts at loopback 8080. Terminate real HTTPS on the host ingress, restrict forwarded headers, set Pretix external HTTPS URL/trusted proxy settings and secure firewall access. Optional primary communications and static frontend require a separately supplied vhost for the chosen hostname; the example is `infra/proxy.primary.conf.example`, and hostname/DNS approval remains F1/F13. Copy that file as an additional nginx include only when enabling the primary profile. Nothing requires the unfinished primary site to launch first.

The local overlay `infra/compose.local-apps.yaml` exercises production images on 3100/3112/3113 with existing development DBs and capture/sandbox config. The owner runs `sudo bash infra/verify-container-fixtures.sh`; this builds only those three services, verifies distinct UIDs and restarts the worker. It does not touch VPS, DNS or provider settings. After source changes affecting those images, rebuild the relevant targets for renewed container evidence.

## Pretix message inventory and ownership

All local events remain unpublished/test-mode. Native SMTP points only to Mailpit; three event default senders/contact values were checked through six EN/DA captures. No customer feature or payment flow was enabled for these infrastructure checks. The following inventory assigns responsibility whenever a category is enabled; F8 requires hosted per-event/settings/content verification before opening it.

| Category | Owner and behavior |
| --- | --- |
| Placed order/pending, free order and paid receipt/invoice | Pretix; tagged booking sender, monitored booking contact; pending copy must not claim payment |
| Event ticket/download notices | Pretix; never an app rental confirmation |
| Approval/denial, incomplete/failed payment, expiry/payment reminders | Pretix when enabled; inspect enabled event rules and keep state-specific wording |
| Waiting list, native recovery, customer/security notifications | Pretix when those features are enabled; inspect organizer/system inheritance and Reply-To, including messages without an event |
| Scheduled native mail | Pretix/operator; inventory schedules and disable competing rental lifecycle notices |
| Custom rental confirmation and access recovery | Booking worker; authoritative paid/rental checks and one-use management link |
| Rental change/cancellation/refund, including admin-originated transitions | Booking worker reconciliation; no parallel native/manual rental lifecycle notice |

Do not enable unused features just to test infrastructure. Global sender configuration alone is insufficient for Reply-To: events/organizers must supply the monitored contact and overrides must preserve the inherited default sender. Local event capture establishes the installed event-mail behavior; customer/system categories and provider envelopes remain hosted owner verification. Administrative control-account/security mail is operational; monitor its destination and do not treat it as customer rental mail.

## Delivery, reconciliation and operator recovery

Communications polls its subscription deliveries; booking worker polls webhook inbox, delivery intents and authoritative orders. Workers are supervised processes and drain on SIGTERM. Web requests never spawn detached SMTP. Identity uniquely records organizer/event/order/kind/observed revision, allowing legitimate repeated changes while suppressing duplicate notifications. Lifecycle payloads retain the observed booking and revision. The worker coalesces superseded change/refund revisions (including A → B → A) before sending and renders the retained transition; cancellation preserves its original refund state and is suppressed on reversal. Recipients and language are refetched authoritatively. Initial paid/access messages still validate the current paid order. Pending/event-ticket orders cannot generate rental confirmation. Admin changes are discovered by reconciliation; operators must not also send a native/manual rental change/cancellation notice. App changes request `send_email:false`; installed Pretix cancellation/refund uses its no-native-mail path. Hosted behavior still needs verification.

Delivery states are queued, leased, sending, sent, permanent and ambiguous. Six attempts with bounded backoff handle known pre-acceptance/4xx failures. 5xx rejection is permanent. DATA timeout/unknown acceptance is ambiguous; expired sending lease is ambiguous, while an expired pre-send lease is reclaimable. Stable Message-ID helps investigation and does not imply SMTP idempotency. A DB failure after SMTP acceptance leaves a sending lease that becomes ambiguous without automatic resend. Payloads are authenticated AES-GCM encrypted with a per-process key, removed on success, after 49 hours for terminal failures, or after queued expiry at 48 hours. Keep keys backed up privately or unresolved payloads cannot be read.

Remote operations persist an intent before a Pretix write. Submitted/ambiguous operations block another write until authoritative read confirms the target. A cancellation and refund initiation do not mean refund completion. Refund notices distinguish pending, done and failed. Session advisory locks and worker transaction locks use the same management DB/key. They serialize app writers; direct admin changes and Pretix quota enforcement remain external to that lock. Stale change/cancellation notices are suppressed when authoritative status reverses before delivery.

Run queue tools with `QUEUE_DATABASE_URL` for `<site>_marketing_operator` plus `QUEUE_SCHEMA=<site>_marketing`, or `booking_management_operator` without QUEUE_SCHEMA. They print states, counts, delivery/operation IDs and times, without decrypted payloads or addresses.

```bash
node --env-file=/private/operator/queue.env --import tsx server/database/scripts/queue.ts status
node --env-file=/private/operator/queue.env --import tsx server/database/scripts/queue.ts operations
node --env-file=/private/operator/queue.env --import tsx server/database/scripts/queue.ts resolve-sent DELIVERY_ID
node --env-file=/private/operator/queue.env --import tsx server/database/scripts/queue.ts resolve-unsent DELIVERY_ID
node --env-file=/private/operator/queue.env --import tsx server/database/scripts/queue.ts operation-rejected OPERATION_UUID
```

For ambiguous SMTP, check provider acceptance/bounce evidence using the stable Message-ID before resolution. Mark sent only with acceptance evidence; mark unsent only with positive evidence that sending did not happen. Unknown evidence remains ambiguous. For an ambiguous remote operation, inspect authoritative Pretix positions/status/refund and provider state. Let reconciliation mark a matching target verified. Mark rejected only after proving the operation was not performed; then any new customer action must pass current rules again. Never retry a refund merely because its response was lost. Alert on failed inbox entries, permanent/ambiguous deliveries, unresolved operations and failed health checks. Operator resolution is a reviewed manual action, not automated payment recovery.

Monitor no-reply bounce/direct replies and booking inbox. Transactional mail failures do not change payment/order state; investigate and contact the customer through the approved monitored workflow. Marketing hard bounce requires suppression in the affected schema before further mail/campaigns. No unverified provider webhook API is assumed. [Marketing operations](../MARKETING_SUBSCRIPTIONS.md) explains private exports, withdrawals and suppression.

## Backup and isolated restore

`backup.py` accepts an explicit database allowlist (marketing, booking_management, pretix) and `BACKUP_DATABASE_URL` for `dd_backup`. Supply a new private output directory outside Git. It writes a custom-format dump, SHA-256 manifest and mode-0600 files using a private temporary pgpass; no password is passed in argv or printed. Host PostgreSQL client tools are preferred; Docker fallback requires owner-run sudo. Monitor backup failures and decide hosted retention under F6.

```bash
python3 server/database/scripts/backup.py marketing /private/backups/marketing-YYYYMMDD
python3 server/database/scripts/restore.py /private/backups/marketing-YYYYMMDD dd_restore_marketing_check
```

Load private backup/restore envs using the operational scheduler or secure shell environment. Restore requires `RESTORE_DATABASE_URL` for the administrator, `RESTORE_INTEGRATIONS=disabled`, a new `dd_restore_*` database and valid checksum. It restores without owner/ACL replay, revokes PUBLIC CONNECT and starts no outgoing services. Inspect fingerprints using explicit temporary access, then remove only that restore database. The owner-run `backup-restore-drill.py` exercises actual scoped tools using two disposable fixture databases, verifies restored content, called/uncalled sequence state and next values, and cleans up only those fixtures. `verify-backup-sequences.ts` additionally checks effective existing/future SELECT in all four domain schemas and denied nextval/setval using ignored scoped local configuration. Existing development grants can be repaired with the administrator-only `backup-sequence-grants.sql`; it changes only backup sequence grants.

## Complete verification

```bash
npm run verify:infrastructure
node --import tsx server/database/scripts/verify-backup-sequences.ts
node --import tsx server/database/scripts/verify-local.ts
node --import tsx server/database/scripts/verify-management.ts
node --import tsx server/database/scripts/verify-operators.ts
node --import tsx server/database/scripts/verify-http.ts
node --import tsx server/database/scripts/verify-production.ts
node --import tsx server/database/scripts/verify-hygiene.ts
```

DB tests require the ignored scoped local env files. When development and production communications fixtures share the local booking schema, run the development capture test through `sudo bash infra/verify-http-fixtures.sh "$(command -v node)"`; it temporarily stops only the competing production communications container and restarts it on exit. Otherwise either consumer may claim the test delivery into its own private capture sink. HTTP tests require both communications processes, booking at 3000 and primary preview at 4321. Production HTTP checks require the owner-built local overlay. Fixture scripts never contact a real payment/mail provider. Owner-run container and backup commands are additional checks, not skipped-test substitutes. Hosted HTTPS, provider scope/delivery, actual webhook retries, paid Stripe/refund/quota behavior and launch approval remain explicitly outstanding.
