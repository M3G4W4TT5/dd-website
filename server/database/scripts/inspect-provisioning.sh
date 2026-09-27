#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
for role in dd_local_admin pretix; do
  docker compose exec -T postgres psql -U "$role" -d pretix -X -c "SELECT current_user; SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname IN ('pretix','dd_local_admin','pretix_runtime','pretix_migrator') ORDER BY rolname;" || true
done
# Permit the task to read generated private configuration, without broad permission changes.
if [ -n "${SUDO_UID:-}" ]; then
  chown "$SUDO_UID:$SUDO_GID" infra/local
fi
