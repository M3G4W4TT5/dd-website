#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
for service in booking-production booking-communications booking-worker-production; do
 docker compose -f compose.yaml -f infra/compose.local-apps.yaml exec -T "$service" node --input-type=module < infra/verify-image-hygiene.mjs
done
# Source images must include the latest communications policy, not a stale build.
expected=$(sha256sum server/marketing/index.ts | cut -d ' ' -f1)
for service in booking-communications booking-worker-production; do
 docker compose -f compose.yaml -f infra/compose.local-apps.yaml exec -T "$service" node -e 'const fs=require("fs"),crypto=require("crypto");if(crypto.createHash("sha256").update(fs.readFileSync("server/marketing/index.ts")).digest("hex")!==process.argv[1])throw Error("Source image is stale; rebuild fixture containers");console.log("PASS current communications source in image")' "$expected"
done
