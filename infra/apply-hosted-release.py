#!/usr/bin/python3
"""Owner-only, retryable host configuration and private sandbox gate package.

Run from root-owned staged files. Never runs initial bootstrap or touches volumes.
Credential values are read from existing private files or entered on a TTY.
"""
import base64
import fcntl
import getpass
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
FILES = ('compose.production.yaml', 'compose.hosted.yaml', 'proxy.conf',
         'pretix-nginx.conf', 'pretix-settings.py', 'pretix-task.conf', 'deploy.py')
BASELINE = {
    'compose.production.yaml': 'cde07a912b21df2956950eea23769bab710ed9f922571f3c1f7a737e0e5ecbb1',
    'compose.hosted.yaml': '21b6df7f428132e39519db26b16aa28b7e85e4f597bbd896cc739f5f6caa8ba1',
    'proxy.conf': 'd8d452c4c81538b67250ee452811770531f4471097c213bd22e38cde53a0aa39',
    'pretix-nginx.conf': '479478ac117a25c9fcedbe02346885f3a874ef7051dd14942b3060a800a24bf6',
    'pretix-settings.py': '4a0888413948f1ff01b93d731aa9d21337c70d722e25abd326b72301bcf5c2ca',
    'pretix-task.conf': '3e3036710bd4a0135c3f2743345fb4b5e6ad952aec1395859a516291fbc7abbb',
    'deploy.py': 'dbb3aca389e561334dbe9b14dfa87b176933ee27b68e96d39c4cac5066d82cb5',
}
TARGET = {
    'compose.production.yaml': '1624e087cc906881d7f207e037dd5e1bf1fdb05d4fe7e1c0aaa21444dbbe5d6f',
    'compose.hosted.yaml': '21b6df7f428132e39519db26b16aa28b7e85e4f597bbd896cc739f5f6caa8ba1',
    'proxy.conf': 'a1eedce6172a288612db007942a15b110d847d3db29b33d8023ae360302b8f6d',
    'pretix-nginx.conf': '479478ac117a25c9fcedbe02346885f3a874ef7051dd14942b3060a800a24bf6',
    'pretix-settings.py': '139ee2020dabbd2aac1a230c682d994197f6b0831a6767a432f4bd470fce7df2',
    'pretix-task.conf': '3e3036710bd4a0135c3f2743345fb4b5e6ad952aec1395859a516291fbc7abbb',
    'deploy.py': '3820d556a2cb4325719121ea27a9e3cc2461c6daf6bb587abc9810ebfc561183',
}
WEBHOOK_EVENTS = (
    'pretix.event.order.placed', 'pretix.event.order.paid',
    'pretix.event.order.modified', 'pretix.event.order.changed.*',
    'pretix.event.order.canceled', 'pretix.event.order.refund.requested',
    'pretix.event.order.refund.done', 'pretix.event.order.refund.failed',
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def trusted(path, uid=0, private=False):
    stat = path.lstat()
    if path.is_symlink() or stat.st_uid != uid or stat.st_mode & (0o077 if private else 0o022):
        raise ValueError('Unsafe operational file: ' + path.name)


def put(path, body, mode, uid=0):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        os.fchmod(output.fileno(), mode)
        output.write(body)
        temporary = Path(output.name)
    os.chown(temporary, uid, uid)
    os.replace(temporary, path)


def safe_run(args, *, input=None, capture=False, env=None):
    return subprocess.run(args, input=input, env=env, text=True, check=True,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, timeout=300).stdout


def installed(name):
    return Path('/usr/local/sbin/dd-deploy') if name == 'deploy.py' else ROOT / name


def compose(manifest):
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    for target, key in [('booking', 'DD_BOOKING_IMAGE'), ('communications', 'DD_COMMUNICATIONS_IMAGE'),
                        ('worker', 'DD_WORKER_IMAGE')]:
        env[key] = manifest['images'][target]
    args = ['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.production.yaml'),
            '-f', str(ROOT / 'compose.hosted.yaml')]
    return args, env


def current():
    return json.loads((STATE / 'current.json').read_text())


def gates(name):
    path = ROOT / 'secrets' / name
    trusted(path, {'booking-web.env': 10001, 'booking-communications.env': 10002,
                   'booking-worker.env': 10003}[name], private=True)
    values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
    return path, values


def save_gates(path, values):
    put(path, ''.join(key + '=' + value + '\n' for key, value in values.items()).encode(),
        0o400, path.stat().st_uid)


def header_secret():
    registry = PRIVATE / 'runtime-private.json'
    trusted(registry, private=True)
    credentials = json.loads(registry.read_text())
    _, web = gates('booking-web.env')
    if web.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') != credentials.get('webhook_password') or \
       web.get('PRETIX_MANAGE_WEBHOOK_USER') != 'dd-booking':
        raise ValueError('Existing webhook identity differs from private registry')
    encoded = base64.b64encode(('dd-booking:' + credentials['webhook_password']).encode()).decode('ascii')
    desired = ('proxy_set_header Authorization "Basic ' + encoded + '";\n').encode()
    path = ROOT / 'secrets' / 'pretix-webhook-header.conf'
    if path.exists():
        trusted(path)
        if path.read_bytes() != desired:
            raise ValueError('Existing internal webhook header differs')
    else:
        put(path, desired, 0o444)
    return credentials


def verify_bridge():
    data = json.loads(safe_run(['docker', 'network', 'inspect', 'dd-hosted_ingress'], capture=True))[0]
    gateways = [item.get('Gateway') for item in data['IPAM']['Config'] if item.get('Gateway')]
    if not gateways or any(ipaddress.ip_address(ip) not in ipaddress.ip_network('172.16.0.0/12') for ip in gateways):
        raise ValueError('Ingress bridge gateway differs from reviewed client-IP trust range')


def install(source):
    trusted(ROOT / 'ready')
    trusted(source)
    if set(TARGET) != set(FILES):
        raise ValueError('Reviewed target hashes are incomplete')
    for name in FILES:
        candidate = source / name
        destination = installed(name)
        trusted(candidate)
        trusted(destination)
        if sha(candidate) != TARGET[name]:
            raise ValueError('Staged file differs from reviewed release: ' + name)
        if sha(destination) not in (BASELINE[name], TARGET[name]):
            raise ValueError('Installed configuration version differs: ' + name)
    verify_bridge()
    header_secret()
    manifest = current()
    arguments, env = compose(manifest)
    put(STATE / 'config-install.json', json.dumps({'status': 'installing', 'commit': manifest['commit']}).encode(), 0o600)
    for name in FILES:
        put(installed(name), (source / name).read_bytes(), 0o755 if name == 'deploy.py' else 0o644)
    deploy = runpy.run_path(str(installed('deploy.py')))
    version = deploy['config_version'](ROOT)
    if version != deploy['config_version'](source):
        raise ValueError('Installed host configuration differs from reviewed source')
    safe_run(arguments + ['config', '--quiet'], env=env)
    # Compose must recreate bind-mounted services after atomic file replacement;
    # restart alone keeps the previous mount inode and secret set.
    safe_run(arguments + ['up', '-d', '--no-build', '--pull', 'missing', '--wait',
                          '--wait-timeout', '240', 'pretix', 'pretix-cron', 'proxy'], env=env)
    deploy['check_readiness'](arguments, env)
    put(STATE / 'config-install.json', json.dumps({'status': 'installed', 'config_version': version}).encode(), 0o600)
    print('PASS: reviewed host configuration installed; proxy restarted; Pretix-backed routes ready; version ' + version)


def verify_release(commit):
    if not re.fullmatch('[0-9a-f]{40}', commit):
        raise ValueError('Expected exact merged commit')
    manifest = current()
    if manifest.get('commit') != commit or manifest.get('config_version') != runpy.run_path(str(installed('deploy.py')))['config_version'](ROOT):
        raise ValueError('Running release identity or host configuration differs')
    attempt = json.loads((STATE / 'attempt.json').read_text())
    if attempt.get('status') != 'succeeded' or attempt.get('manifest') != manifest or (STATE / 'failed.json').exists():
        raise ValueError('Deployment state is not a verified success')
    args, env = compose(manifest)
    for service in ('booking', 'booking-communications', 'booking-worker'):
        cid = safe_run(args + ['ps', '-q', service], env=env, capture=True).strip()
        image_id = safe_run(['docker', 'inspect', '--format', '{{.Image}}', cid], capture=True).strip()
        revision = safe_run(['docker', 'image', 'inspect', '--format',
                             '{{index .Config.Labels "org.opencontainers.image.revision"}}', image_id], capture=True).strip()
        if revision != commit:
            raise ValueError('Actual running application revision differs: ' + service)
    return manifest, args, env


PRETIX_ACTIVATION = '''
from django_scopes import scopes_disabled
from pretix.base.models import Event, Organizer
from pretix.api.models import WebHook, WebHookEventListener
from pretix.plugins.stripe.payment import StripeCC
with scopes_disabled():
 organizer=Organizer.objects.get(slug='dd-studio')
 events=list(Event.objects.filter(organizer=organizer).order_by('slug'))
 assert len(events)==3 and all(e.testmode for e in events)
 for event in events:
  provider=StripeCC(event)
  assert str(provider.settings.secret_key).startswith(('sk_test_','rk_test_'))
  assert str(provider.settings.publishable_key).startswith('pk_test_')
  if not event.live:
   event.live=True
   event.save(update_fields=['live'])
 rental=next(e for e in events if e.slug=='studio')
 target='http://proxy:8081/api/manage/pretix-webhook'
 rows=list(WebHook.objects.filter(organizer=organizer,comment='DD booking private lifecycle'))
 assert len(rows)<=1
 hook=rows[0] if rows else WebHook.objects.create(organizer=organizer,target_url=target,enabled=True,all_events=False,comment='DD booking private lifecycle')
 assert hook.target_url==target and hook.enabled and not hook.all_events
 hook.limit_events.set([rental])
 expected=set(WEBHOOK_EVENTS)
 actual=set(hook.listeners.values_list('action_type',flat=True))
 assert actual<=expected
 for action in expected-actual:WebHookEventListener.objects.create(webhook=hook,action_type=action)
 assert set(hook.listeners.values_list('action_type',flat=True))==expected
 print('PASS: three test-mode events published and one scoped credential-free internal webhook configured')
'''


def activate_sandbox(commit):
    manifest, args, env = verify_release(commit)
    credentials = header_secret()
    files = {name: gates(name) for name in ('booking-web.env', 'booking-communications.env', 'booking-worker.env')}
    for _, values in files.values():
        if values.get('DD_MODE') != 'production' or values.get('PAYMENT_ENVIRONMENT') != 'sandbox' or \
           values.get('PAYMENT_RELEASE_ENABLED') != 'false' or values.get('MAIL_DELIVERY') != 'capture' or \
           values.get('MAIL_RELEASE_ENABLED') != 'false':
            raise ValueError('Sandbox or mail release gates differ from reviewed capture state')
        if values.get('PREVIEW') not in ('true', 'false'):
            raise ValueError('Unexpected preview gate')
    web = files['booking-web.env'][1]
    if web.get('PRETIX_MANAGE_WRITE_API_TOKEN') not in (None, credentials['write']):
        raise ValueError('Unexpected booking write credential')
    signing = web.get('STRIPE_WEBHOOK_SIGNING_SECRET')
    if not signing:
        signing = getpass.getpass('Paste Stripe sandbox webhook signing secret (hidden): ').strip()
    if not re.fullmatch(r'whsec_[A-Za-z0-9_-]{24,}', signing):
        raise ValueError('Invalid Stripe sandbox signing secret shape')
    code = 'WEBHOOK_EVENTS=' + repr(WEBHOOK_EVENTS) + '\n' + PRETIX_ACTIVATION
    safe_run(['docker', 'exec', '-i', 'dd-hosted-pretix-1', 'python', '-m', 'pretix', 'shell', '-v', '0',
              '-c', 'exec(__import__("sys").stdin.read())'], input=code)
    web.update({'PREVIEW': 'false', 'PRETIX_MANAGE_WRITE_API_TOKEN': credentials['write'],
                'PRETIX_EVENTS_CHECKOUT_ENABLED': 'true', 'BOOKING_SELF_SERVICE_ENABLED': 'true',
                'STRIPE_WEBHOOK_SIGNING_SECRET': signing})
    for path, values in files.values():
        values['PREVIEW'] = 'false'
        save_gates(path, values)
    put(STATE / 'sandbox-gates.json', json.dumps({'status': 'activating', 'commit': commit}).encode(), 0o600)
    safe_run(args + ['up', '-d', '--no-build', '--pull', 'missing', '--wait', '--wait-timeout', '240',
                     'booking', 'booking-communications', 'booking-worker'], env=env)
    safe_run(args + ['restart', 'proxy'], env=env)
    runpy.run_path(str(installed('deploy.py')))['check_readiness'](args, env)
    put(STATE / 'sandbox-gates.json', json.dumps({'status': 'active', 'commit': commit,
        'preview': False, 'checkout': True, 'self_service': True, 'payment_release': False,
        'mail_release': False, 'delivery': 'capture'}).encode(), 0o600)
    print('PASS: test-mode events visible, scoped private webhook and sandbox gates active; capture only, live-payment and unrestricted-mail gates closed')


def controlled_mail(commit):
    _, args, env = verify_release(commit)
    files = {name: gates(name) for name in ('booking-communications.env', 'booking-worker.env')}
    for _, values in files.values():
        if values.get('PREVIEW') != 'false' or values.get('PAYMENT_ENVIRONMENT') != 'sandbox' or \
           values.get('PAYMENT_RELEASE_ENABLED') != 'false' or values.get('MAIL_RELEASE_ENABLED') != 'false' or \
           values.get('MAIL_DELIVERY') not in ('capture', 'controlled'):
            raise ValueError('Sandbox gates are not ready for controlled mail')
    host = input('Approved SMTP host: ').strip()
    password = getpass.getpass('Booking SMTP password (hidden): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9.-]{4,253}', host) or len(password) < 12 or '\n' in password:
        raise ValueError('Invalid SMTP input')
    for path, values in files.values():
        values.update({'MAIL_DELIVERY': 'controlled', 'MAIL_RECIPIENT_ALLOWLIST': 'dev@memoryone.eu',
                       'SMTP_HOST': host, 'SMTP_PORT': '465', 'SMTP_USER': 'booking@didde-mie.com',
                       'SMTP_PASSWORD': password})
        save_gates(path, values)
    put(STATE / 'mail-gates.json', json.dumps({'status': 'activating', 'commit': commit}).encode(), 0o600)
    safe_run(args + ['up', '-d', '--no-build', '--pull', 'missing', '--wait', '--wait-timeout', '240',
                     'booking-communications', 'booking-worker'], env=env)
    safe_run(args + ['restart', 'proxy'], env=env)
    runpy.run_path(str(installed('deploy.py')))['check_readiness'](args, env)
    put(STATE / 'mail-gates.json', json.dumps({'status': 'controlled', 'commit': commit,
        'recipient': 'dev@memoryone.eu', 'mail_release': False}).encode(), 0o600)
    print('PASS: booking communications and worker use controlled delivery only to dev@memoryone.eu; Pretix remains on Mailpit')


def main():
    if os.geteuid() != 0:
        raise ValueError('Run as dd-owner through sudo')
    trusted(Path(__file__).resolve())
    action = sys.argv[1] if len(sys.argv) > 1 else ''
    source = Path(__file__).resolve().parent
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action == 'install' and len(sys.argv) == 2:
            install(source)
        elif action == 'activate-sandbox' and len(sys.argv) == 3:
            activate_sandbox(sys.argv[2])
        elif action == 'controlled-mail' and len(sys.argv) == 3:
            controlled_mail(sys.argv[2])
        else:
            raise ValueError('Expected install, activate-sandbox COMMIT or controlled-mail COMMIT')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError, TimeoutError, AssertionError):
        print('Hosted release checkpoint stopped; inspect sanitized status and private operational logs before retry.', file=sys.stderr)
        sys.exit(1)
