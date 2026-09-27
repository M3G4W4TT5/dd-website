#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node_binary=${1:?Supply the absolute path to the installed Node binary}
test -x "$node_binary"
compose=(docker compose -f compose.yaml -f infra/compose.local-apps.yaml)
# Development and production capture consumers share the local booking schema.
# Pause only the competing production consumer so the HTTP test sees its mail
# in the development capture directory. Restore it even if an assertion fails.
trap '"${compose[@]}" start booking-communications' EXIT
"${compose[@]}" stop booking-communications
"$node_binary" --import tsx server/database/scripts/verify-http.ts
