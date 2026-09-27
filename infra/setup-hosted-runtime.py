#!/usr/bin/python3
"""Owner-run initial booking credentials. No application starts or secret output."""
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
IMAGE = 'ghcr.io/m3g4w4tt5/dd-website-communications@sha256:a3d41b983fe2920e3b57f1edb4a9c5ba085de6c1c453381448196bba232e3ce6'
KEYS = ('availability', 'web_read', 'worker_read', 'write', 'booking_payload',
        'marketing_payload', 'recovery_hash', 'marketing_bearer', 'webhook_password')

# Executed through Django in the pinned Pretix image. CHECK_ONLY rolls back all
# test teams/tokens and permits local configuration verification without adoption.
PRETIX_CODE = '''
from django.db import transaction
from django_scopes import scopes_disabled
from pretix.base.models import Event, Item, Order, Organizer, Team, TeamAPIToken, User
from rest_framework.test import APIClient

with scopes_disabled(), transaction.atomic():
 organizer = Organizer.objects.get(slug='dd-studio')
 rental = Event.objects.get(organizer=organizer, slug='studio')
 events = list(Event.objects.filter(organizer=organizer).order_by('slug'))
 if not CHECK_ONLY:
  assert len(events) == 3 and all(e.testmode and not e.live for e in events)
  assert not Order.objects.exists()
  assert User.objects.filter(email='admin@didde-mie.com', is_active=True).exists()
 item = Item.objects.get(event=rental, pk=1, active=True, admission=False)
 assert str(item.default_price) == '250.00'
 prefix = 'DD hosted runtime ' if not CHECK_ONLY else 'DD isolated runtime verification '
 scopes = {
  'availability': (True, {}),
  'web_read': (False, {'event.orders:read': True}),
  'worker_read': (False, {'event.orders:read': True}),
  'write': (False, {'event.orders:read': True, 'event.orders:write': True}),
 }
 tokens = {}
 for key, (all_events, permissions) in scopes.items():
  name = prefix + key
  team = Team.objects.filter(organizer=organizer, name=name).first()
  if team is None:
   team = Team.objects.create(organizer=organizer, name=name, all_events=all_events,
          all_event_permissions=False, all_organizer_permissions=False,
          limit_event_permissions=permissions, limit_organizer_permissions={})
   if not all_events:
    team.limit_events.set([rental])
   token = TeamAPIToken.objects.create(team=team, name=name, token=CREDENTIALS[key])
  else:
   assert team.all_events == all_events
   assert not team.all_event_permissions and not team.all_organizer_permissions
   assert team.limit_event_permissions == permissions and team.limit_organizer_permissions == {}
   assert set(team.limit_events.values_list('pk', flat=True)) == (set() if all_events else {rental.pk})
   assert not team.members.exists()
   token = team.tokens.get(name=name, token=CREDENTIALS[key], active=True)
   assert team.tokens.count() == 1
  tokens[key] = token
  assert not team.members.exists()
  assert not token.has_organizer_permission(organizer, 'organizer.teams:write')
  assert not token.has_organizer_permission(organizer, 'organizer.events:create')
  assert not token.has_event_permission(organizer, rental, 'event.items:write')
  assert not token.has_event_permission(organizer, rental, 'event.settings.general:write')
  assert token.has_event_permission(organizer, rental, 'event.orders:read') == (key != 'availability')
  assert token.has_event_permission(organizer, rental, 'event.orders:write') == (key == 'write')
  for event in events:
   assert token.has_event_permission(organizer, event) == (all_events or event.pk == rental.pk)
 client = APIClient()
 base = '/api/v1/organizers/dd-studio/events/'
 for key in ('availability', 'web_read', 'worker_read'):
  client.credentials(HTTP_AUTHORIZATION='Token ' + CREDENTIALS[key])
  assert client.get(base + 'studio/items/').status_code == 200
  assert client.get(base + 'studio/subevents/').status_code == 200
  assert client.get(base + 'studio/quotas/?with_availability=true').status_code == 200
  assert client.get(base + 'studio/orders/').status_code == (403 if key == 'availability' else 200)
  assert client.post(base + 'studio/orders/', {}, format='json').status_code == 403
 client.credentials(HTTP_AUTHORIZATION='Token ' + CREDENTIALS['availability'])
 assert client.get(base).status_code == 200
 for event in events:
  assert client.get(base + event.slug + '/items/').status_code == 200
 client.credentials(HTTP_AUTHORIZATION='Token ' + CREDENTIALS['web_read'])
 for event in events:
  if event.pk != rental.pk:
   assert client.get(base + event.slug + '/orders/').status_code == 403
 if CHECK_ONLY:
  transaction.set_rollback(True)
 print('PASS scoped credentials: catalog reads, rental reads, denied writes and denied unrelated orders; product=1')
'''


def runtime_files(credentials, passwords):
    def db(role, database):
        password = passwords[role]
        if not re.fullmatch('[a-f0-9]{64}', password):
            raise ValueError('Invalid scoped database credential registry')
        return f'postgresql://{role}:{password}@postgres:5432/{database}'

    common = {'DD_MODE': 'production', 'PREVIEW': 'true', 'HOST': '0.0.0.0',
              'PAYMENT_ENVIRONMENT': 'sandbox', 'PAYMENT_RELEASE_ENABLED': 'false',
              'MAIL_DELIVERY': 'capture', 'MAIL_RELEASE_ENABLED': 'false'}
    rental = {'BOOKING_PUBLIC_BASE_URL': 'https://studio.didde-mie.com',
              'PRETIX_API_BASE': 'http://pretix:80', 'PRETIX_ORGANIZER_SLUG': 'dd-studio',
              'PRETIX_EVENT_SLUG': 'studio', 'PRETIX_ITEM_ID': '1',
              'PRETIX_SHOP_BASE': 'https://ttd-checkout.didde-mie.com',
              'MANAGE_RECOVERY_HASH_KEY': credentials['recovery_hash'],
              'PAYLOAD_KEY': credentials['booking_payload']}
    web = {**common, **rental,
           'BOOKING_DATABASE_URL': db('booking_web_runtime', 'booking_management'),
           'CONTACT_BOOKING_ORIGIN': 'https://studio.didde-mie.com',
           'BOOKING_COMMUNICATIONS_URL': 'http://booking-communications:3012',
           'BOOKING_MARKETING_BEARER': credentials['marketing_bearer'],
           'PRETIX_API_TOKEN': credentials['availability'],
           'PRETIX_MANAGE_API_TOKEN': credentials['web_read'],
           'PRETIX_MANAGE_WEBHOOK_USER': 'dd-booking',
           'PRETIX_MANAGE_WEBHOOK_PASSWORD': credentials['webhook_password'],
           'PRETIX_EVENTS_CHECKOUT_ENABLED': 'false', 'BOOKING_SELF_SERVICE_ENABLED': 'false'}
    worker = {**common, **rental,
              'BOOKING_DATABASE_URL': db('booking_worker_runtime', 'booking_management'),
              'PRETIX_MANAGE_API_TOKEN': credentials['worker_read'],
              'CAPTURE_DIRECTORY': '/capture', 'WORKER_HEALTH_PORT': '3013'}
    communications = {**common, 'SERVICE_SITE': 'booking', 'PORT': '3012',
                      'ALLOWED_ORIGINS': 'https://studio.didde-mie.com',
                      'MARKETING_ACTION_BASE_URL': 'https://studio.didde-mie.com',
                      'MARKETING_DATABASE_URL': db('booking_marketing_runtime', 'marketing'),
                      'PAYLOAD_KEY': credentials['marketing_payload'],
                      'BOOKING_MARKETING_BEARER': credentials['marketing_bearer'],
                      'CAPTURE_DIRECTORY': '/capture'}
    return {'booking-web.env': (10001, web),
            'booking-communications.env': (10002, communications),
            'booking-worker.env': (10003, worker)}


def checked_file(path, uid=0):
    stat = path.lstat()
    if path.is_symlink() or not path.is_file() or stat.st_uid != uid or stat.st_mode & 0o077:
        raise ValueError('Private file ownership or permissions differ: ' + path.name)


def write_private(path, body, uid=0):
    if path.exists() or path.is_symlink():
        checked_file(path, uid)
        if path.read_text() != body:
            raise ValueError('Existing private file differs; inspect before changing: ' + path.name)
        return
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    with os.fdopen(fd, 'w') as stream:
        stream.write(body)
    os.chown(path, uid, uid)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Initial runtime setup must precede application activation')
    for directory in (STATE, PRIVATE, ROOT / 'secrets'):
        stat = directory.lstat()
        if directory.is_symlink() or not directory.is_dir() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError('Unsafe operational directory')
    checked_file(PRIVATE / 'provisioning-private.json')
    passwords = json.loads((PRIVATE / 'provisioning-private.json').read_text())['passwords']
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        log_path = PRIVATE / 'runtime-setup.log'
        if log_path.exists():
            checked_file(log_path)
        log_fd = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(log_fd, 'a') as log:
            def run(args, stdin=None, capture=False):
                result = subprocess.run(args, input=stdin, text=True, env=env, check=True,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                return result.stdout.strip() if capture else None
            compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml')]
            running = run(compose + ['ps', '--status', 'running', '--services'], capture=True).splitlines()
            if set(running) != {'postgres', 'redis', 'mail-capture'}:
                raise ValueError('Expected only healthy preparation services; inspect current stack')
            registry_path = PRIVATE / 'runtime-private.json'
            if registry_path.exists():
                checked_file(registry_path)
                credentials = json.loads(registry_path.read_text())
            else:
                for name in runtime_files(dict.fromkeys(KEYS, 'a' * 64), passwords):
                    if (ROOT / 'secrets' / name).exists():
                        raise ValueError('Existing runtime files without credential registry; inspect first')
                credentials = {key: secrets.token_hex(32) for key in KEYS}
                write_private(registry_path, json.dumps(credentials, sort_keys=True))
            if set(credentials) != set(KEYS) or any(not re.fullmatch('[a-f0-9]{64}', v) for v in credentials.values()):
                raise ValueError('Invalid private runtime registry')
            code = 'CHECK_ONLY=False\nCREDENTIALS=' + repr(credentials) + '\n' + PRETIX_CODE
            run(compose + ['run', '-T', '--rm', '--no-deps', '--entrypoint', 'python3',
                           'pretix', '-m', 'pretix', 'shell', '-v', '0',
                           '-c', 'exec(__import__("sys").stdin.read())'], stdin=code)
            run(['docker', 'pull', IMAGE])
            for filename, (uid, config) in runtime_files(credentials, passwords).items():
                path = ROOT / 'secrets' / filename
                body = ''.join(key + '=' + value + '\n' for key, value in config.items())
                write_private(path, body, uid)
                validator = ('import {communicationsConfig} from "./server/runtime/config.ts"; communicationsConfig(process.env,"booking");'
                             if filename == 'booking-communications.env' else
                             'import {' + ('validateWorker' if uid == 10003 else 'validateBooking') +
                             '} from "./apps/booking/server/config.ts"; ' +
                             ('validateWorker' if uid == 10003 else 'validateBooking') + '(process.env);')
                run(['docker', 'run', '--rm', '--network', 'none', '--read-only',
                     '--user', f'{uid}:{uid}', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                     '--memory', '256m', '--pids-limit', '64',
                     '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
                     '--mount', f'type=bind,src={path},dst=/run/secrets/runtime,readonly',
                     '--entrypoint', 'node', IMAGE, '--env-file=/run/secrets/runtime',
                     '--import', 'tsx', '--input-type=module', '-e', validator])
            write_private(PRIVATE / 'runtime-setup.complete', 'scoped-runtime-v1\n')
    print('PASS: hosted API scopes and three per-service runtime files verified; secrets not displayed.')
    print('Separate web/worker rental read tokens; availability cannot read orders; write token withheld from applications.')
    print('Preview/sandbox/capture configured; payment/mail/self-service gates closed. Applications remain stopped.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Runtime setup failed; inspect /var/lib/dd-hosted/provisioning/runtime-setup.log privately.', file=sys.stderr)
        sys.exit(1)
