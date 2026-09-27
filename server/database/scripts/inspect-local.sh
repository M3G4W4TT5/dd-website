#!/usr/bin/env bash
# Read-only inventory. No environments, credentials, order/customer records.
set -euo pipefail
cd "$(dirname "$0")/../../.."
docker compose ps --format json
docker compose exec -T postgres psql -U pretix -d pretix -X -v ON_ERROR_STOP=1 -c "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname !~ '^pg_' ORDER BY rolname; SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY datname;"
docker compose exec -T pretix sh -c 'id; command -v pretix; find / -maxdepth 3 -name "*entrypoint*" 2>/dev/null | head -10'
docker compose exec -T pretix python /pretix/src/manage.py shell -c '
from django_scopes import scopes_disabled
from pretix.base.models import Event, Order
with scopes_disabled():
 for e in Event.objects.all():
  print("event",e.slug,"testmode",e.testmode,"live",e.live,"orders",Order.objects.filter(event=e).count())
'
