#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$repo_root"
env_file="apps/booking/.env.local"

if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file" >&2
  exit 1
fi
if grep -q '^SUBSCRIPTIONS_DATABASE_URL=.' "$env_file"; then
  echo "SUBSCRIPTIONS_DATABASE_URL is already set; refusing to replace it." >&2
  exit 1
fi
if ! command -v openssl >/dev/null; then
  echo "openssl is required to generate a database password." >&2
  exit 1
fi

sudo docker compose ps postgres
role_exists="$(sudo docker compose exec -T postgres psql -U pretix -d postgres -Atc "SELECT 1 FROM pg_roles WHERE rolname = 'dd_marketing'")"
if [[ "$role_exists" == "1" ]]; then
  echo "Role dd_marketing already exists. Stopping to avoid changing its credentials." >&2
  exit 1
fi
database_exists="$(sudo docker compose exec -T postgres psql -U pretix -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = 'marketing'")"
if [[ "$database_exists" == "1" ]]; then
  echo "Database marketing already exists. Stopping to avoid modifying it." >&2
  exit 1
fi
db_password="$(openssl rand -hex 32)"
printf "CREATE ROLE dd_marketing WITH LOGIN PASSWORD '%s';\n" "$db_password" |
  sudo docker compose exec -T postgres psql -U pretix -d postgres -v ON_ERROR_STOP=1
sudo docker compose exec -T postgres psql -U pretix -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE marketing OWNER dd_marketing"

{ printf 'SET ROLE dd_marketing;\n'; cat apps/booking/subscriptions.sql; } |
  sudo docker compose exec -T postgres psql -U pretix -d marketing -v ON_ERROR_STOP=1

chmod 600 "$env_file"
printf '\nSUBSCRIPTIONS_DATABASE_URL=postgresql://dd_marketing:%s@127.0.0.1:5433/marketing\n' "$db_password" >> "$env_file"
if ! grep -q '^SUBSCRIPTIONS_PUBLIC_BASE=' "$env_file"; then
  printf 'SUBSCRIPTIONS_PUBLIC_BASE=http://127.0.0.1:3000\n' >> "$env_file"
fi
unset db_password
echo "Marketing database schema applied. Local connection secret saved in ignored $env_file."
echo "PostgreSQL was not restarted. Host port 5433 becomes available after the Compose port change is applied."
