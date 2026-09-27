#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for service in booking-production booking-communications booking-worker-production; do
 docker compose -f compose.yaml -f infra/compose.local-apps.yaml exec -T "$service" node --input-type=module < infra/verify-image-hygiene.mjs
done
