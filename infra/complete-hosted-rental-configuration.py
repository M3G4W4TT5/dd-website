#!/usr/bin/python3
"""Add only the omitted, reviewed rental discount; never reimport hosted events."""
import fcntl
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'

# Verified against the source Pretix configuration on 28 September 2026.
EXPECTED = {
    'event': 1, 'active': True,
    'internal_name': 'Full day studio: 14 hours, pay for 12',
    'position': 1, 'all_sales_channels': True,
    'available_from': None, 'available_until': None, 'subevent_mode': 'distinct',
    'condition_all_products': False, 'condition_apply_to_addons': True,
    'condition_ignore_voucher_discounted': False,
    'condition_min_count': 14, 'condition_min_value': '0.00',
    'benefit_same_products': True, 'benefit_discount_matching_percent': '100.00',
    'benefit_only_apply_to_cheapest_n_matches': 2,
    'benefit_apply_to_addons': True, 'benefit_ignore_voucher_discounted': False,
    'subevent_date_from': None, 'subevent_date_until': None,
    'limit_sales_channels': [], 'condition_limit_products': [1],
    'benefit_limit_products': [],
}

REPAIR_CODE = '''
import json
from django.core import serializers
from django.db import transaction
from django_scopes import scopes_disabled
from pretix.base.models import Discount, Event, Item, Order, Quota
from rest_framework.test import APIClient

with scopes_disabled(), transaction.atomic():
 event = Event.objects.get(pk=1, slug='studio', organizer__slug='dd-studio')
 assert event.testmode and not event.live
 assert not Order.objects.exists(), 'Inspect order state before changing initial configuration'
 item = Item.objects.get(pk=1, event=event, active=True, admission=False)
 assert str(item.default_price) == '250.00'
 assert Event.objects.count() == 3 and Quota.objects.count() == 657
 # Existing configuration may be adopted only if it matches every field.
 rows = list(Discount.objects.filter(event=event))
 assert len(rows) <= 1, 'Unexpected rental discounts; inspect instead of replacing'
 if rows:
  discount = rows[0]
 else:
  fields = {k: v for k, v in EXPECTED.items() if k not in
            {'event', 'limit_sales_channels', 'condition_limit_products', 'benefit_limit_products'}}
  discount = Discount.objects.create(event=event, **fields)
  discount.condition_limit_products.set([item])
 actual = json.loads(serializers.serialize('json', [discount]))[0]['fields']
 assert actual == EXPECTED, 'Existing discount differs from reviewed source'
 client = APIClient()
 client.credentials(HTTP_AUTHORIZATION='Token ' + AVAILABILITY_TOKEN)
 response = client.get('/api/v1/organizers/dd-studio/events/studio/discounts/')
 assert response.status_code == 200
 assert response.data['count'] == 1
 assert not Order.objects.exists()
 if CHECK_ONLY:
  transaction.set_rollback(True)
 print('PASS: rental discount matches source; catalog token can read it; no orders or other configuration replaced.')
'''


def trusted(path, uid=0, private=False):
    stat = path.lstat()
    if path.is_symlink() or not path.is_file() or stat.st_uid != uid or stat.st_mode & (0o077 if private else 0o022):
        raise ValueError('Unsafe operational file: ' + path.name)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    trusted(Path(__file__))
    trusted(ROOT / 'ready')
    trusted(STATE / 'current.json', private=True)
    trusted(PRIVATE / 'runtime-private.json', private=True)
    trusted(ROOT / 'secrets' / 'booking-web.env', 10001, True)
    web = dict(line.split('=', 1) for line in (ROOT / 'secrets' / 'booking-web.env').read_text().splitlines())
    for key, expected in {'PREVIEW': 'true', 'PAYMENT_ENVIRONMENT': 'sandbox',
                          'PAYMENT_RELEASE_ENABLED': 'false', 'MAIL_DELIVERY': 'capture',
                          'MAIL_RELEASE_ENABLED': 'false', 'PRETIX_EVENTS_CHECKOUT_ENABLED': 'false',
                          'BOOKING_SELF_SERVICE_ENABLED': 'false'}.items():
        if web.get(key) != expected:
            raise ValueError('Expected closed-gate initial smoke configuration')
    credentials = json.loads((PRIVATE / 'runtime-private.json').read_text())
    if web.get('PRETIX_API_TOKEN') != credentials['availability']:
        raise ValueError('Unexpected availability credential')
    deploy_file = Path('/usr/local/sbin/dd-deploy')
    trusted(deploy_file)
    source=Path(__file__).resolve().parent
    trusted(source/'runtime-probes.py')
    probes=runpy.run_path(str(source/'runtime-probes.py'))
    deploy = runpy.run_path(str(deploy_file))
    manifest = deploy['validate_manifest'](json.loads((STATE / 'current.json').read_text()))
    for name in ('compose.production.yaml', 'compose.hosted.yaml'):
        trusted(ROOT / name)
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd = os.open(PRIVATE / 'rental-completion.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as log:
            code = ('EXPECTED=' + repr(EXPECTED) + '\nAVAILABILITY_TOKEN=' +
                    repr(credentials['availability']) + '\nCHECK_ONLY=False\n' + REPAIR_CODE)
            subprocess.run(['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml'),
                            '--profile', 'migration', 'run', '-T', '--rm', '--no-deps',
                            '--entrypoint', 'python3', 'pretix-migrate', '-m', 'pretix',
                            'shell', '-v', '0', '-c', 'exec(__import__("sys").stdin.read())'],
                           input=code, text=True, env=env, stdout=log, stderr=log, check=True)
            # Matching standalone image, catalog/DB subset and exact two networks.
            def probe_run(args,capture=False):
                result=subprocess.run(args,text=True,env=env,check=True,stdout=subprocess.PIPE if capture else log,stderr=log)
                return result.stdout.strip() if capture else None
            image=manifest['images']['booking']
            revision=probe_run(['docker','image','inspect','--format','{{index .Config.Labels "org.opencontainers.image.revision"}}',image],True)
            if revision!=manifest['commit']:raise ValueError('Image revision differs from current release')
            probes['run_probe'](probe_run,manifest['images'],'booking-web.env','availability',ROOT,PRIVATE)
    print('PASS: omitted full-day discount restored and hosted availability verified. Payment/mail/write gates remain closed.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Rental completion failed; inspect /var/lib/dd-hosted/provisioning/rental-completion.log privately.', file=sys.stderr)
        sys.exit(1)
