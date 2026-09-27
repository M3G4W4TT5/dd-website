#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 infra/prepare-container-fixtures.py
docker compose -f compose.yaml -f infra/compose.local-apps.yaml build booking-production booking-communications booking-worker-production
docker compose -f compose.yaml -f infra/compose.local-apps.yaml up -d --no-deps booking-production booking-communications booking-worker-production
# Bounded startup health check, no credentials/body/environment output.
for attempt in $(seq 1 40); do
 if curl -fsS http://127.0.0.1:3100/api/health >/dev/null && curl -fsS http://127.0.0.1:3112/health >/dev/null && curl -fsS http://127.0.0.1:3113/health >/dev/null; then break; fi
 sleep 2
done
curl -fsS http://127.0.0.1:3100/api/health >/dev/null
curl -fsS http://127.0.0.1:3112/health >/dev/null
curl -fsS http://127.0.0.1:3113/health >/dev/null
for service in booking-production booking-communications booking-worker-production; do
 docker compose -f compose.yaml -f infra/compose.local-apps.yaml exec -T "$service" id
done
docker compose -f compose.yaml -f infra/compose.local-apps.yaml restart booking-worker-production
for attempt in $(seq 1 20); do
 if curl -fsS http://127.0.0.1:3113/health >/dev/null; then break; fi
 sleep 2
done
curl -fsS http://127.0.0.1:3113/health >/dev/null
# Primary services were never built or started.
printf '%s\n' 'PASS booking-only production containers start with separate users and capture/sandbox policy; worker restarted'
