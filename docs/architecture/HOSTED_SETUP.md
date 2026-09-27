# Hosted sandbox setup

Continue after [CICD_SETUP.md](CICD_SETUP.md). Applications remain undeployed and
`DEPLOY_ENABLED=false`. The owner performs VPS sudo operations; the temporary
setup account remains unprivileged.

## Continuation checkpoint, 27 September 2026

The owner authorized the remaining steps 1–9: runtime credentials/configuration,
reviewed deployment changes, first CI/CD deployment, private hosted verification,
sandbox integration/transactions and controlled email testing. Initial
backup/restore is deferred to step 10 with operational rehearsals. Live payments,
public launch and handover remain later steps.

The hosted configuration import passed according to the owner's reported output:
3 unpublished test events, 4 products, 656 dates and 657 quotas; no orders or
credentials copied. Do not rerun bootstrap, initial Pretix setup or import.

After the local computer restart, current checks confirmed setup SSH access,
four active Cloudflare tunnel connections, mandatory per-host Access JWT
validation, both HTTPS origins redirecting unauthenticated requests to Access,
and GitHub `DEPLOY_ENABLED=false`. No open pull request was found. The existing
uncommitted setup changes are preserved; `web_clips/` remains outside deployment
changes. Local Docker was restarted by the owner; isolated verification subsequently passed.

The owner subsequently confirmed Docker and cloudflared active, with PostgreSQL,
Redis and Mailpit healthy and applications stopped. Setup SSH independently
confirmed four ready tunnel connections. Mailpit's loopback UI returned no HTTP
response; inspect its internal-only network/port publishing during step 2 before
claiming the SSH inspection path works.

Next: complete the deployment PR and CI review, install its final host files,
verify the exact published images with the readiness job, and deploy through
GitHub Actions. Applications remain stopped and readiness absent.

### Remaining step 1: scoped application credentials

`infra/setup-hosted-runtime.py` generates a fresh root-only credential registry
on the VPS and creates dedicated Pretix teams/tokens. Catalog availability can
read all organizer events/products/dates/quotas but cannot read orders or write.
Web and worker receive independently revocable read-only tokens restricted to
the rental event. A rental read/write token is generated for later sandbox tests
but remains only in the private registry, outside all application runtime files.
None of these teams has members, event-setting/product write permissions,
organizer administration or permission to create events.

The job verifies actual catalog/order API reads and rejected writes through
Pretix's API test client, checks unrelated-event denial, and refuses permission
drift. All token changes occur in a database transaction. It retains credentials
for a retry and refuses changed existing runtime files instead of replacing them.
No external API calls, orders, messages or applications are started.

An isolated check passed with the pinned Pretix image, a fresh ephemeral SQLite
database and network disabled: API scopes, repeat setup and rejection of changed
permissions. The development database was untouched. All three generated
configurations also passed the application's actual policy validators locally.
Hosted PostgreSQL verification and published-image validators run in the owner
job before it reports success; the isolated test alone does not establish that
hosted credentials are installed.

Three runtime files are written as mode 0400, owned by their respective image
UIDs 10001/10002/10003. Booking and worker share only the booking payload/signing
keys needed for their queue; communications uses a separate marketing encryption
key and scoped database identity. Internal webhook/bearer credentials are fresh.
Public origins are HTTPS; service URLs use the private network. Preview remains
enabled, capture/sandbox selected and payment/mail/checkout/self-service release
gates closed. Capture directories and resource/retention settings are completed
in step 2 before activation.

After the reviewed helper is staged, run in the **VPS dd-owner terminal**:

```bash
sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/setup-hosted-runtime.py /root/dd-deployment-setup/setup-hosted-runtime.py
sudo python3 /root/dd-deployment-setup/setup-hosted-runtime.py
```

Expected: `PASS: hosted API scopes and three per-service runtime files verified;
secrets not displayed.` Report only the status output. Diagnostics stay private
at `/var/lib/dd-hosted/provisioning/runtime-setup.log`; do not paste the registry,
runtime files or unreviewed logs. Keep readiness absent and deployment disabled.

The owner reported the complete runtime PASS output. Hosted API scopes and all
three per-UID runtime files passed the published-image policy validators. Step 1
is complete; write credentials remain withheld from applications.

### Remaining step 2: limits, logging and capture inspection

`infra/setup-hosted-limits.py` installs the reviewed configuration without
starting applications. It verifies the runtime checkpoint, preparation-only
service state and memory/disk headroom, preserves the prior non-secret Compose
and proxy files privately, and refuses unknown configuration changes. It checks
that Mailpit contains zero captures before replacing that temporary container;
otherwise it stops so existing captures can be preserved deliberately. No
database volume, role, runtime secret or Pretix configuration is replaced.

Mailpit joins a dedicated bridge for its loopback UI publishing while retaining
its internal Pretix SMTP network. Only `127.0.0.1:8025` is published; SMTP/POP
remain unpublished and no external relay or SMTP credentials are configured.
The job checks HTTP access, actual bindings, memory/PID limits and log rotation.
The existing SSH tunnel instructions above then provide private inspection.

| Service | Memory limit | CPU limit | PID limit |
| --- | ---: | ---: | ---: |
| PostgreSQL | 512 MiB | 0.75 | 128 |
| Redis | 128 MiB | 0.25 | 64 |
| Mailpit | 128 MiB | 0.25 | 64 |
| Pretix web/task | 1024 MiB | 1 | 192 |
| Pretix cron | 384 MiB | 0.5 | 64 |
| Booking | 512 MiB | 0.75 | 128 |
| Booking communications | 256 MiB | 0.5 | 128 |
| Booking worker | 256 MiB | 0.5 | 128 |
| Proxy | 64 MiB | 0.25 | 64 |

These are initial sandbox ceilings, not measured production requirements. The
VPS currently has about 3910 MiB RAM, 2 CPUs and 87 GiB free disk. Pretix runs
one gunicorn worker and one Celery worker process. The earlier PostgreSQL role
limits and four-connection application pools remain in effect. Docker service
logs rotate at three 10 MiB files; cloudflared retains its prior systemd limits.

Pretix's bundled nginx normally logs the full request URL. The reviewed override
logs only method and status. Public proxy logs record peer, host, method and
status and block unknown Host values. Both exclude paths as well as queries,
since Pretix order/download paths can contain secrets. Detailed nginx error records are disabled
because they can include full URLs. Django/Celery logging emits severity, logger
name and exception class only, excluding message bodies, arguments and exception
contents; it removes the image's unbounded application file handlers. Inspect
service health and private queue state for further diagnostics.

The shared capture adapter in the next CI images enforces 100 messages, 16 MiB
total and 1 MiB per message per service, removes messages older than 24 hours on
writes and every minute, and serializes concurrent writes. It uses mode-0700
directories and exclusive mode-0600 files and refuses symlinks. Communications
and worker each receive a separate `/capture` tmpfs owned by their UID, with a
32 MiB filesystem ceiling to allow overhead. Captures disappear on container
stop/replacement; they are outside Git, web roots and routine database backups.
The current published images do not yet contain this adapter: it takes effect
after the step 3 review/build and step 4 deployment.

Local verification passed capture retention/concurrency/privacy tests, all 11
server tests, policy typechecks, the deployment boundary tests, Compose parsing,
and disposable Mailpit UI/network and pinned-image nginx/Django/Celery checks.
All 37 booking tests and the booking/server production builds also passed.
Existing development containers and databases were not altered.

Run the staged files in the **VPS dd-owner terminal**:

```bash
sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/setup-hosted-limits.py /root/dd-deployment-setup/setup-hosted-limits.py
sudo install -m 0644 -o root -g root -t /root/dd-deployment-setup/ /home/dd-setup/dd-deployment-setup/{compose.production.yaml,proxy.conf,pretix-nginx.conf,pretix-settings.py,pretix-task.conf}
sudo python3 /root/dd-deployment-setup/setup-hosted-limits.py
```

Expected: `PASS: hosted resource/log/capture configuration installed; Mailpit UI
responds on 127.0.0.1:8025 only.` Report status only; logs remain private at
`/var/lib/dd-hosted/provisioning/limits-setup.log`. Readiness and deployment stay
disabled. The updated `deploy.py` is staged for installation after step 3 review
and before readiness is enabled, without changing the CI identity or sudo scope.

The owner reported the complete limits PASS output: loopback capture UI verified,
SMTP/POP unpublished, existing volumes/credentials preserved, and applications
still stopped. Step 2 is complete. Step 3 review also added Mailpit to CI-deployed
services and Pretix's healthy dependencies, and omitted URL paths from ingress
logs because some Pretix order links contain path secrets. Install the final
reviewed configuration before enabling readiness; the earlier staged version
must not be activated unchanged.

## 1. Private HTTPS ingress

Cloudflare configuration was created and read back on 27 September 2026:

- Tunnel: `dd-hosted-sandbox`, ID `7c39829f-b117-4294-9424-bf422d88966f`, remotely managed.
- `studio.didde-mie.com` Access application: `3cbc23d4-0cc1-49d0-ac59-a374d68b7112`.
- `ttd-checkout.didde-mie.com` Access application: `49a3da94-87cc-4e2c-951b-36e035092d2c`.
- Each application permits only `dev@memoryone.eu`, using the existing one-time
  PIN provider and an eight-hour session. There are no bypass policies.
- Proxied CNAMEs point to this tunnel. Neither hostname had a previous record;
  existing mail DNS was preserved.
- Each tunnel route forwards to `http://127.0.0.1:8080` with the matching Host
  header and mandatory Access JWT validation for that application's audience.
  Team name is `memory-one`; unmatched hosts return 404.
- Unauthenticated HTTPS requests to both hostnames returned 302 to Access.
  Authenticated browser access and tunnel/origin behavior remain to be tested
  after the connector and applications run.

The tunnel makes an outbound authenticated connection. Keep provider inbound
rules limited to the already configured SSH rule; do not open 80, 443 or 8080.
No public callback exceptions are configured during initial smoke setup.

### Owner commands

The reviewed installer is staged at
`/home/dd-setup/dd-deployment-setup/install-tunnel.sh` on the VPS. It installs
Cloudflare's official APT package and a dedicated `dd-cloudflared.service`.
It prompts privately for the connector token, checks its account/tunnel identity,
and writes a root-only credential file outside Git. The service uses systemd
credentials and a dynamic unprivileged identity; the token is not a command-line
argument or an environment variable. The installer refuses an existing DD
installation or another active cloudflared service.

1. On your local computer, open the owner's VPS session:

   ```bash
   ssh -F /dev/null -i ~/.ssh/dd-vps-owner dd-owner@85.190.108.73
   ```

2. In your local browser, open
   [Cloudflare Tunnels](https://dash.cloudflare.com/b259f8a4a84c2435819ed369102f3724/tunnels).
   Select `dd-hosted-sandbox`, then its connector installation/Overview page.
   Select Debian/Ubuntu, amd64. Copy only the token from the displayed install
   command, not the full command. Do not regenerate the tunnel or share its token
   in chat. The token is the long value after `service install` or `--token`.

3. In the VPS owner terminal, run:

   ```bash
   sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/install-tunnel.sh /root/dd-deployment-setup/install-tunnel.sh
   sudo bash /root/dd-deployment-setup/install-tunnel.sh
   ```

   When asked `Paste ONLY the dd-hosted-sandbox tunnel token (hidden)`, paste the
   token and press Enter. No characters should appear. This is the only private
   credential-entry step; do not paste the token into a shell command.

4. Check the connector in the same VPS terminal:

   ```bash
   sudo systemctl is-active dd-cloudflared.service
   sudo systemctl is-enabled dd-cloudflared.service
   cloudflared --version
   curl --fail --silent --show-error http://127.0.0.1:20245/ready
   ```

   Expected: `active`, `enabled`, a cloudflared version supporting `--token-file`,
   and HTTP success from `/ready`. If startup is still connecting, retry the
   final command. If it fails persistently, inspect privately:

   ```bash
   sudo journalctl -u dd-cloudflared.service -n 30 --no-pager
   ```

   Report the non-secret status/version output. Do not post credential files or
   unreviewed logs. An Access login can work before the application is deployed;
   an authenticated origin error is expected until the stack starts.

The owner installed cloudflared 2026.9.3 and reported `active`, `enabled`, and
`/ready` status 200 with four ready connections. The XFS CPUAccounting warnings
refer to unrelated operating-system maintenance units. Application-origin and
authenticated browser checks remain pending.

The connector has `MemoryMax=256M`, `CPUQuota=50%`, `TasksMax=128`, warning-level
journal output and a log rate limit of 100 messages per 30 seconds. Remaining
stack log retention/resource/capture limits are part of database/runtime setup.

References: [Cloudflare APT installation](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/),
[token-file run parameter](https://developers.cloudflare.com/tunnel/reference/run-parameters/#token-file),
[origin Access validation](https://developers.cloudflare.com/tunnel/reference/origin-parameters/#access).

## 2. Fresh database provisioning

The owner-run `infra/bootstrap-hosted-database.py` job uses the merged commit
`07110aeffffc649ab4d66dfcd34ae879f0802e65` communications image at digest
`sha256:a3d41b983fe2920e3b57f1edb4a9c5ba085de6c1c453381448196bba232e3ce6`.
An isolated local check with this published image passed: three fresh databases,
four restricted runtime roles, intended management table grants and denied
runtime schema creation. The owner reported the hosted bootstrap PASS output;
PostgreSQL remains healthy.

It starts only PostgreSQL, initializes `marketing`, `booking_management` and
`pretix`, and applies the existing application migrations. The shared provisioner
also creates empty primary marketing metadata; this job disables all three
primary scoped logins and never starts primary services. Pretix tables still
require their dedicated migration job.

The job refuses an existing hosted volume/admin credential without its own
bootstrap record. It can resume a recorded bootstrap; it never deletes volumes.
Generated credentials and role URLs stay under root-only
`/var/lib/dd-hosted/provisioning`. The admin password file is mode 0400 owned by
the pinned PostgreSQL image's numeric user, so that container can read its own
secret. A temporary superuser environment file is mounted only into the
provisioning job and removed afterward. Private diagnostic output is retained in
`/var/lib/dd-hosted/provisioning/bootstrap.log`; never paste it without review.

PostgreSQL receives a 512 MiB memory limit, 0.75 CPU, 128 PID limit,
60-connection cap, 64 MiB shared buffers, 2 MiB work memory and local log rotation
of three 10 MiB files. Runtime role connection limits are 8 each for booking web,
worker and marketing, 20 for Pretix, and 4 for backup. Operator/migrator roles are
limited to 2 connections each. Application pools currently cap at 4 each.

In the existing **VPS dd-owner terminal**, run these exact commands. The reviewed
files are staged under `/home/dd-setup/dd-deployment-setup`:

```bash
sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/bootstrap-hosted-database.py /root/dd-deployment-setup/bootstrap-hosted-database.py
sudo install -m 0644 -o root -g root /home/dd-setup/dd-deployment-setup/compose.production.yaml /root/dd-deployment-setup/compose.production.yaml
sudo python3 /root/dd-deployment-setup/bootstrap-hosted-database.py
```

Expected output begins `PASS: PostgreSQL healthy; 3 fresh databases; 4 restricted
runtime roles; max_connections=60.` Share that status, not the generated files.
No private key, token or password entry is required for this database step.

The owner reported that complete PASS output on 27 September 2026. PostgreSQL
is running; no application was started by the bootstrap.

## 3. Completed initial Pretix provisioning

### Pretix schema and internal capture

The owner-run `infra/setup-hosted-pretix.py` job generates a private Django
signing secret and two INI files, with separate migrator/runtime database roles.
Both files are mode 0400 owned by image UID 15371; each container receives only
its selected file. No SMTP password, Stripe key or development credential is
copied. Hosted checkout origin is `https://ttd-checkout.didde-mie.com`, currency
DKK, timezone Europe/Copenhagen, with EN/DA enabled.

The job starts Redis and internal Mailpit, then runs `migrate --noinput` with the
pinned Pretix 2026.7.0 image. It verifies table access and denied schema creation
through the runtime role, confirms no orders, and disables the default
`admin@localhost` account with an unusable password. Your owner account will be
created separately before the web service starts. The setup job refuses an
existing configuration that differs and stops if unexpected user/order state
exists, rather than altering it.

The isolated check with this pinned image passed: schema migration, runtime-role
access, denied runtime DDL, empty orders, disabled default administrator and
capture-only SMTP settings. No existing local development volume was modified;
the temporary test database, Redis container and Pretix data volume were removed.

Mailpit has no external relay and only an internal SMTP listener. Its UI binds
to `127.0.0.1:8025`. It retains at most 100 messages for 24 hours, accepts at most
1 MB per message, and stores its database in a 64 MiB temporary filesystem;
captures disappear on container replacement/restart. It has a 128 MiB memory
limit, 0.25 CPU, 64 PID limit and three 10 MiB local log files. Redis has a
128 MiB memory limit, 64 MiB maximum Redis data with `noeviction`, 0.25 CPU,
64 PID limit and the same log rotation. The migration job has a 768 MiB memory
limit, 1 CPU and 128 PID limit. These are initial private-sandbox limits.

In the **VPS dd-owner terminal**, run:

```bash
sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/setup-hosted-pretix.py /root/dd-deployment-setup/setup-hosted-pretix.py
sudo install -m 0644 -o root -g root /home/dd-setup/dd-deployment-setup/compose.production.yaml /root/dd-deployment-setup/compose.production.yaml
sudo python3 /root/dd-deployment-setup/setup-hosted-pretix.py
```

Expected: `PASS: Pretix migrations applied; runtime role reads schema and cannot
create tables; orders empty; default admin disabled.` Send only the status
output. Diagnostics, if needed, are private at
`/var/lib/dd-hosted/provisioning/pretix-setup.log`. The job does not start Pretix
web/worker or booking applications and does not activate CI deployment.

To inspect Mailpit later, run this in a separate **local** terminal and keep it
open:

```bash
ssh -F /dev/null -i ~/.ssh/dd-vps-owner -N -L 127.0.0.1:18025:127.0.0.1:8025 dd-owner@85.190.108.73
```

Open `http://127.0.0.1:18025` locally. Do not add a public Mailpit hostname or
open SMTP/UI ports in the provider firewall.

References: [Pretix configuration](https://docs.pretix.eu/self-hosting/config/),
[Pretix Docker installation](https://docs.pretix.eu/self-hosting/installation/docker_smallscale/),
[Mailpit runtime limits](https://mailpit.axllent.org/docs/configuration/runtime-options/).

The owner reported the complete migration PASS output on 27 September 2026:
runtime role verified, no orders, default admin disabled, Redis and Mailpit
running, and applications still stopped.

### Create the owner account

The pinned image's `createsuperuser` command supports email login and interactive
password entry. Run in the **VPS dd-owner terminal**:

```bash
printf '%s\n' 'DD_SECRET_DIRECTORY=/etc/dd-hosted/secrets' | sudo tee /etc/dd-hosted/compose.env > /dev/null
sudo chmod 0644 /etc/dd-hosted/compose.env
sudo docker compose --env-file /etc/dd-hosted/compose.env -f /etc/dd-hosted/compose.production.yaml run --rm --no-deps --entrypoint python3 pretix -m pretix createsuperuser --email admin@didde-mie.com
```

The Compose environment file contains only a non-secret directory path. Choose a
unique password at the hidden prompts; do not enter it into a shell command or
send it in chat. Expected output: `Superuser created successfully.` This creates
the Pretix owner identity, separate from the SSH/Linux owner and Cloudflare
Access login. It does not start the web service or activate deployment. After
creating the owner, do not rerun the initial migration setup job: it intentionally
requires fresh user state.

The owner reported successful creation of `admin@didde-mie.com`. This is the
permanent Pretix administrator identity; Cloudflare Access remains separately
configured for `dev@memoryone.eu`.

### Useful Pretix configuration transfer

Read-only local inventory found organizer `dd-studio` and three test-mode,
non-live events: rental series `studio` (2 products, 644 dates and quotas), series
`dance-with-dd-dev` (1 product, 12 dates and quotas), and single event
`street-dance-workshop-dd-dev` (1 product, 1 quota). None currently has a configured
question. Transfer the useful configuration deliberately, preserving product/date
relationships and capacity; do not import orders, sessions, tokens or old
credentials. Hosted owner/team permissions must reference the new owner identity.

The reviewed transfer allowlist contains organizer/event definitions, tax rules,
categories, products/variations, subevents and product/date overrides, quotas,
questions/options and explicitly named non-payment settings. Admin comments are
cleared. The exporter refuses media references, unknown plugins or relationships
to excluded objects rather than silently dropping them. No User, Team, Order,
OrderPosition, session, cart, API token, webhook or payment credential model is
included. All payment settings are excluded, including development Stripe keys.

The private export contains 1 organizer, 3 events, 2 tax rules, 1 category,
4 products, 656 subevents, 656 product/date overrides, 657 quotas, 1 organizer
setting and 109 event settings. Canonical record SHA256 is
`30f19c67dae97c8b15c691963a2ab22deff8d252a2cc02861b6060ca2ca77aab`.
Retained settings include booking capacity limits, buyer-only phone/detail
requirements, EN/DA content and configured invoice/ticket policies. All events
remain test-mode and unpublished. The export stays outside Git and must not be
added to public CI artifacts.

The importer uses the scoped migrator role for Django fixture insertion and
sequence reset. It requires the new active `admin@didde-mie.com` administrator
and an empty hosted organizer/event/order state. Import is transactional and
compares every retained field and relationship with the reviewed export, then
verifies event/quota reads through the restricted runtime role. It refuses a
second import into existing event state rather than overwriting it.

Isolated import verification passed using the pinned image and a fresh temporary
database. Every retained field and relationship matched; equivalent ISO timestamp
formats are compared as the same instant. The restricted runtime role read all
three events and 657 quotas, with zero orders. Temporary test containers, network,
volume and generated test credentials were removed. The owner reported that
the hosted import passed with all retained configuration and no orders copied.
The commands below record that completed operation; do not rerun the importer.

In the **VPS dd-owner terminal**, run the staged files:

```bash
sudo install -m 0700 -o root -g root /home/dd-setup/dd-deployment-setup/import-hosted-configuration.py /root/dd-deployment-setup/import-hosted-configuration.py
sudo install -m 0600 -o root -g root /home/dd-setup/dd-deployment-setup/transfer-pretix-configuration.py /root/dd-deployment-setup/transfer-pretix-configuration.py
sudo install -m 0600 -o root -g root /home/dd-setup/dd-deployment-setup/events.json /root/dd-deployment-setup/events.json
sudo python3 /root/dd-deployment-setup/import-hosted-configuration.py
```

Expected: `PASS: hosted configuration matches reviewed export; runtime reads 3
unpublished test events and 657 quotas; no orders imported.` Send only status
output; diagnostic logs are private at
`/var/lib/dd-hosted/provisioning/configuration-import.log`. If import has completed
but a later verification fails, inspect that state before any retry; the importer
intentionally does not adopt populated event state. No application starts here.

### Booking runtime configuration

Database provisioning, Pretix migrations, owner creation and configuration import
have completed. Continue with fresh application/API credentials generated
privately on the VPS; retain the existing hosted volume and scoped database roles.
Do not repeat the initial setup jobs, install Node or build applications on the
VPS.

Scoped runtime files, internal Mailpit, resource limits and log configuration
have passed owner-run setup. Application capture bounds take effect in the new
CI images. Before activation, verify the final reviewed host files, published
image revisions and runtime identities with `prepare-hosted-readiness.py`. Keep
payment, mail release and booking write gates closed.

## First CI deployment readiness

After the deployment PR merges and main publishes all three image digests, stage
its reviewed host files and a validated non-secret release manifest on the VPS.
The owner installs the final config and deployment command, then runs
`infra/prepare-hosted-readiness.py`. It compares installed files with the staged
source, verifies setup checkpoints and unchanged closed-gate runtime files,
checks healthy preparation services and private tunnel readiness, anonymously
pulls the exact release images and checks their revision labels. Disposable
per-UID checks validate configuration, database identity/denied DDL and private
capture writes through the new communications image. It creates the root-owned
readiness marker only after all checks pass and starts no applications.

Then enable `DEPLOY_ENABLED` and run the main GitHub Actions workflow. The CI
forced command accepts only an approved digest manifest. Runtime values,
captures, container logs and private databases never enter CI artifacts.
Authenticated browser, direct-origin, cookie and dependency checks follow the
first successful deployment; readiness alone is not hosted application proof.

## First deployment and smoke corrections

PR #4 merged as `909c6e7b116fac1cd7fbadea1d922746f08af6c0`. The owner
readiness check passed. GitHub Actions run `36353620658` then successfully
deployed the three published digest references using the restricted CI identity.
Booking database health and the Pretix proxy root both return HTTP 200. The
authenticated HTTPS booking page loads through Cloudflare Access. Its Access
cookies are Secure and HttpOnly. Public VPS ports 80, 443, 8080, 8025, 1025,
1110, 5432, 6379, 3000, 3012 and 3013 are blocked from the external test client.
Payment, mail release and booking write gates remain closed.

The first browser smoke check found an unavailable rental calendar and a
hardcoded local Administration link. The original configuration transfer omitted
the source rental discount: fourteen distinct hours pay for twelve. Availability
requires that rule and correctly refuses an incomplete price configuration.
`complete-hosted-rental-configuration.py` adds only that reviewed rule using the
scoped migrator, checks all its fields and product relationships, refuses an
unexpected existing discount or any order state, and verifies availability using
the real HTTP API and application parser. It preserves the imported events,
products, quotas, runtime secrets and volumes. It can adopt an exact matching
rule on a subsequent check. Do not repeat the original configuration importer.
The transfer model allowlist now includes Discount for subsequent exports.

The Administration link uses `/administration`, whose server route reads the
runtime Pretix shop origin and redirects to `/control/`. Production refuses a
missing or insecure origin; the local fallback is available only outside
production. This avoids freezing a local hostname into a hosted client bundle.

Repair verification passed in an isolated pinned Pretix container: absent rule
creation, exact-match adoption, scoped API reads and refusal of a mismatched
existing rule without replacement. Hosted repair and full calendar verification
remain pending the owner's command. These results do not yet attest sandbox
payments, external email delivery or completed hosted smoke testing.
