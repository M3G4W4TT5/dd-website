#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
# Stops only Pretix writers; preserves event configuration and all volumes.
docker compose stop pretix pretix-cron
python3 server/database/scripts/provision-local.py
# Dedicated migrator runs once; runtime AUTOMIGRATE is disabled.
docker compose --profile migration run --rm --no-deps pretix-migrate
# Recreate only these runtime services with restricted credentials and captured mail.
docker compose up -d mail-capture pretix pretix-cron
printf '%s\n' 'Local database transition applied; verify using scoped application roles.'
