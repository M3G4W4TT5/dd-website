# DD platform — local development

The studio booking site is the first implementation priority. The personal site is a separate Astro application with placeholder content. The current work stops before payment, SMS, calendar synchronization, Instagram connection, and SMTP. Public checkout remains unavailable until payment is implemented and tested.

The client specifications and implementation plan live one directory above this Git repository:

- `../SPECIFICATIONS.md`
- `../IMPLEMENTATION_PLAN.md`

## Local services

The isolated Docker Compose project runs pretix Community 2026.7.0, PostgreSQL, and Redis. It binds pretix only to `127.0.0.1:8345`. It configures no SMTP service or payment provider. The volumes hold development data and are never committed.

1. Copy `.env.example` to `.env` and replace the password with a long random value.
2. Run `docker compose up -d` (or `sudo docker compose up -d` where Docker access requires it).
3. Open `http://127.0.0.1:8345/control/` for the local pretix administrator interface.
4. Run `docker compose down` to stop the isolated stack. Do not add `-v` unless you intentionally want to delete its development data.

pretix's official [small-scale Docker guide](https://docs.pretix.eu/self-hosting/installation/docker_smallscale/) explains the first-login process. Change its initial administrator password before configuring any test data. Never use real customer data in this local instance.

The production domain, email address, calendar provider, hourly rate, policies, and final media are placeholders pending DD's decisions. This Compose file is for local evaluation only; it does not expose a public production service.
