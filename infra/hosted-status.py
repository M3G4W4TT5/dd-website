#!/usr/bin/python3
"""Read-only, sanitized owner status for the existing private hosted installation."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path("/etc/dd-hosted")
STATE = Path("/var/lib/dd-hosted")
CONFIGS = ("compose.production.yaml", "compose.hosted.yaml", "proxy.conf",
           "pretix-nginx.conf", "pretix-settings.py", "pretix-task.conf", "pretix-webhook-relay.conf")
GATES = ("DD_MODE", "PREVIEW", "PAYMENT_ENVIRONMENT", "PAYMENT_RELEASE_ENABLED",
         "MAIL_DELIVERY", "MAIL_RELEASE_ENABLED", "PRETIX_EVENTS_CHECKOUT_ENABLED",
         "BOOKING_SELF_SERVICE_ENABLED")
SAFE_VALUES = {
    'DD_MODE': ('production',), 'PREVIEW': ('true', 'false'),
    'PAYMENT_ENVIRONMENT': ('sandbox',), 'PAYMENT_RELEASE_ENABLED': ('true', 'false'),
    'MAIL_DELIVERY': ('capture', 'controlled', 'enabled'),
    'MAIL_RELEASE_ENABLED': ('true', 'false'),
    'PRETIX_EVENTS_CHECKOUT_ENABLED': ('true', 'false'),
    'BOOKING_SELF_SERVICE_ENABLED': ('true', 'false'),
}


def command(*args):
    result = subprocess.run(args, text=True, capture_output=True, timeout=25, check=True)
    return result.stdout.strip()


def manifest(name):
    path = STATE / name
    if not path.is_file():
        return None
    data = json.loads(path.read_text())
    return {"commit": data.get("commit") or data.get("manifest", {}).get("commit"),
            "config_version": data.get("config_version") or data.get("manifest", {}).get("config_version"),
            "phase": data.get("phase"), "status": data.get("status"), "category": data.get("category"),
            "operation": data.get("operation"), "diagnostic": data.get("diagnostic"),
            "running_revisions": data.get("running_revisions"), "recorded_revision": data.get("recorded_revision"),
            "release_record_stale": data.get("release_record_stale")}


def mounted_runtime(service, filename):
    script = "const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('/run/secrets/runtime')).digest('hex'))"
    try:
        mounted_hash = command('docker', 'exec', 'dd-hosted-' + service + '-1', 'node', '-e', script)
        host_hash = hashlib.sha256((ROOT / 'secrets' / filename).read_bytes()).hexdigest()
        return mounted_hash == host_hash
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False


def probe(host, path):
    request = urllib.request.Request('http://127.0.0.1:8080' + path, headers={'Host': host})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read(524289)
            if len(body) > 524288:
                return {'status': response.status, 'category': 'oversized'}
            if path == '/api/availability' and response.status == 200:
                data = json.loads(body)
                return {'status': 200, 'source': data.get('source'), 'slots': len(data.get('slots', []))}
            return {'status': response.status}
    except urllib.error.HTTPError as error:
        return {'status': error.code}
    except (OSError, ValueError, json.JSONDecodeError):
        return {'status': 'probe_failed'}


def unit_status(name):
    try:
        active = subprocess.run(['systemctl', 'is-active', name], text=True,
                                capture_output=True, timeout=5, check=False)
        return active.stdout.strip() if active.stdout.strip() in ('active', 'inactive', 'failed') else 'unavailable'
    except (OSError, subprocess.TimeoutExpired):
        return 'unavailable'


def backup_status():
    latest = STATE / 'step10-backups/latest.json'
    result = {'timer': unit_status('dd-hosted-backup.timer'),
              'last_service': unit_status('dd-hosted-backup.service'),
              'completed_at': None, 'age_hours': None, 'fresh': False}
    if latest.is_file() and not latest.is_symlink():
        try:
            data = json.loads(latest.read_text())
            completed = datetime.fromisoformat(data['completed_at'])
            if completed.tzinfo is None:
                raise ValueError('Backup completion lacks timezone')
            age = (datetime.now(timezone.utc) - completed).total_seconds() / 3600
            if data.get('isolated_restore') is True and data.get('databases') == list(('marketing', 'booking_management', 'pretix')):
                result.update(completed_at=completed.astimezone(timezone.utc).isoformat(), age_hours=round(age, 1),
                              fresh=0 <= age <= 36)
        except (ValueError, KeyError, TypeError):
            pass
    return result


def main():
    if os.geteuid() != 0:
        raise ValueError("Run as dd-owner through sudo")
    result = {"config_hashes": {}, "release": {}, "containers": {}, "gates": {}, "pretix": {}}
    for name in (*CONFIGS, "deploy.py"):
        path = Path("/usr/local/sbin/dd-deploy") if name == "deploy.py" else ROOT / name
        result["config_hashes"][name] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None
    version = hashlib.sha256()
    for name in (*CONFIGS, "deploy.py"):
        path = Path("/usr/local/sbin/dd-deploy") if name == "deploy.py" else ROOT / name
        version.update(name.encode() + b"\0")
        version.update(path.read_bytes())
        version.update(b"\0")
    result["host_config_version"] = version.hexdigest()
    for name in ("current.json", "previous.json", "attempt.json", "failed.json",
                 "config-install.json", "sandbox-gates.json", "mail-gates.json", "webhook-rotation.json", "webhook-relay-rotation.json"):
        result["release"][name] = manifest(name)
    ids = command("docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=dd-hosted").splitlines()
    for cid in ids:
        data = json.loads(command("docker", "inspect", cid))[0]
        service = data["Config"]["Labels"].get("com.docker.compose.service", "unknown")
        image_id = data["Image"]
        image = json.loads(command("docker", "image", "inspect", image_id))[0]
        result["containers"][service] = {
            "state": data["State"]["Status"], "health": data["State"].get("Health", {}).get("Status"),
            "restarts": data["RestartCount"], "image_id": image_id,
            "image_reference": data["Config"]["Image"],
            "revision": image["Config"].get("Labels", {}).get("org.opencontainers.image.revision"),
            "runtime_file_startup": '--env-file=/run/secrets/runtime' in (data['Config'].get('Cmd') or []),
        }
    stats = command("docker", "stats", "--no-stream", "--format", "{{json .}}", *ids) if ids else ""
    result["resource_pressure"] = [
        {key: row.get(key) for key in ("Name", "CPUPerc", "MemUsage", "MemPerc", "PIDs")}
        for row in (json.loads(line) for line in stats.splitlines())
    ]
    for service, filename in (("booking", "booking-web.env"),
                              ("communications", "booking-communications.env"),
                              ("worker", "booking-worker.env")):
        path = ROOT / "secrets" / filename
        values = dict(line.split("=", 1) for line in path.read_text().splitlines() if "=" in line)
        result["gates"][service] = {key: ('not_applicable' if key not in values else
                                         values[key] if values[key] in SAFE_VALUES[key] else 'unexpected')
                                     for key in GATES}
        result["gates"][service]["stripe_signing_secret_present"] = bool(values.get("STRIPE_WEBHOOK_SIGNING_SECRET"))
        result["gates"][service]["scoped_write_token_present"] = bool(values.get("PRETIX_MANAGE_WRITE_API_TOKEN"))
        container_service = {'booking': 'booking', 'communications': 'booking-communications',
                             'worker': 'booking-worker'}[service]
        result["gates"][service]["mounted_runtime_matches_host"] = mounted_runtime(container_service, filename)
        details = result['containers'].get(container_service, {})
        result["gates"][service]["startup_uses_runtime_file"] = details.get('runtime_file_startup', False)
    header = ROOT / 'secrets' / 'pretix-webhook-header.conf'
    if header.exists():
        metadata = header.stat()
        result['webhook_header'] = {'mode': oct(metadata.st_mode & 0o777), 'uid': metadata.st_uid,
                                    'gid': metadata.st_gid}
        try:
            denied = subprocess.run(['runuser', '-u', 'dd-setup', '--', 'test', '-r', str(header)],
                                    capture_output=True, timeout=5).returncode != 0
            result['webhook_header']['dd_setup_read_denied'] = denied
        except (OSError, subprocess.TimeoutExpired):
            result['webhook_header']['dd_setup_read_denied'] = 'probe_failed'
    result['probes'] = {
        'booking_root': probe('booking.didde-mie.com', '/'),
        'booking_health': probe('booking.didde-mie.com', '/api/health'),
        'booking_availability': probe('booking.didde-mie.com', '/api/availability'),
        'checkout_root': probe('checkout.didde-mie.com', '/'),
    }
    code = """from django_scopes import scopes_disabled
from pretix.base.models import Event, Discount, Item, Order, Quota, SubEvent, Organizer, SalesChannel
import json
with scopes_disabled():
 discounts=list(Discount.objects.filter(event__slug='studio',event__organizer__slug='dd-studio'))
 full_day=(len(discounts)==1 and discounts[0].active and discounts[0].condition_min_count==14 and
  str(discounts[0].benefit_discount_matching_percent)=='100.00' and
  discounts[0].benefit_only_apply_to_cheapest_n_matches==2 and
  list(discounts[0].condition_limit_products.values_list('id',flat=True))==[1])
 organizer=Organizer.objects.get(slug='dd-studio')
 web=list(SalesChannel.objects.filter(organizer=organizer,identifier='web').values_list('type',flat=True))
 print('DD_STATUS=' + json.dumps({'events':[{'slug':e.slug,'live':e.live,'testmode':e.testmode} for e in Event.objects.all().order_by('slug')], 'products':Item.objects.count(), 'dates':SubEvent.objects.count(), 'quotas':Quota.objects.count(), 'discounts':Discount.objects.count(), 'full_day_discount_complete':full_day, 'orders':Order.objects.count(), 'web_sales_channel_valid':web==['web']}))
"""
    output = command("docker", "exec", "dd-hosted-pretix-1", "python", "-m", "pretix", "shell", "-v", "0", "-c", code)
    result["pretix"] = json.loads(next(line[len("DD_STATUS="):] for line in output.splitlines() if line.startswith("DD_STATUS=")))
    try:
        # The pinned standalone image starts `all` with a Unix control socket.
        # supervisorctl's default config points elsewhere, so name that socket.
        supervisor = command("docker", "exec", "-u", "0", "dd-hosted-pretix-1", "supervisorctl", "-s",
                             "unix:///tmp/supervisor.sock", "status")
        processes = [line.split()[:2] for line in supervisor.splitlines()]
        if {name: state for name, state in processes} != {
                'nginx': 'RUNNING', 'pretixtask': 'RUNNING', 'pretixweb': 'RUNNING'}:
            raise ValueError('Pretix supervised process is not running')
        result["pretix"]["supervisor_probe"] = "ok"
        result["pretix"]["supervisor"] = [" ".join(process) for process in processes]
    except (subprocess.CalledProcessError, ValueError):
        result["pretix"]["supervisor_probe"] = "failed"
    result["host"] = {"disk_available_kib": os.statvfs("/").f_bavail * os.statvfs("/").f_frsize // 1024,
                      "load_average": tuple(round(value, 2) for value in os.getloadavg())}
    result['monitoring'] = {'supervisor_timer': unit_status('dd-hosted-supervisor.timer'),
                            'supervisor_last_service': unit_status('dd-hosted-supervisor.service'),
                            'backup': backup_status()}
    print(json.dumps(result, sort_keys=True, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Hosted status failed; inspect locally without sharing secrets or raw container logs.", file=sys.stderr)
        sys.exit(1)
