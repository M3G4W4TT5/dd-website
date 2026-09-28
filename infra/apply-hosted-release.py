#!/usr/bin/python3
"""Owner-only, retryable host configuration and private sandbox gate package.

Run from root-owned staged files. Never runs initial bootstrap or touches volumes.
Credential values are read from existing private files or entered on a TTY.
"""
import base64
import fcntl
import getpass
import grp
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import pwd
import re
import runpy
import secrets
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
PROJECT = 'dd-hosted'
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
    'compose.production.yaml': 'ac6604d93feddc7d1ad7ada13fbe1089766e4f4f15447cf0f4f84e95b144abfb',
    'compose.hosted.yaml': '21b6df7f428132e39519db26b16aa28b7e85e4f597bbd896cc739f5f6caa8ba1',
    'proxy.conf': 'a1eedce6172a288612db007942a15b110d847d3db29b33d8023ae360302b8f6d',
    'pretix-nginx.conf': '479478ac117a25c9fcedbe02346885f3a874ef7051dd14942b3060a800a24bf6',
    'pretix-settings.py': '139ee2020dabbd2aac1a230c682d994197f6b0831a6767a432f4bd470fce7df2',
    'pretix-task.conf': '3e3036710bd4a0135c3f2743345fb4b5e6ad952aec1395859a516291fbc7abbb',
    'deploy.py': 'cf8068a74e877d7f0acb7b365365417d59a8f14147cdfd763cac7f45692f0dbb',
}
# The failed owner run replaced all seven installed files before stopping.
# Accept both its reviewed bytes and the earlier installed baseline on retry.
PARTIAL = {**TARGET,
           'compose.production.yaml': '1624e087cc906881d7f207e037dd5e1bf1fdb05d4fe7e1c0aaa21444dbbe5d6f'}
PROXY_GROUP = 10006
APP_SERVICES = {'booking': 'booking', 'communications': 'booking-communications',
                'worker': 'booking-worker'}
ACTIVE = {'action': None, 'phase': None, 'operation': None, 'diagnostic': None}
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


def put(path, body, mode, uid=0, gid=None):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        os.fchmod(output.fileno(), mode)
        output.write(body)
        temporary = Path(output.name)
    os.chown(temporary, uid, uid if gid is None else gid)
    os.replace(temporary, path)


def safe_run(args, *, input=None, capture=False, env=None):
    ACTIVE['diagnostic'] = None
    if args[:2] == ['docker', 'compose'] or (len(args) > 2 and args[1] == 'compose'):
        ACTIVE['operation'] = 'compose_' + next((item for item in ('up', 'config', 'ps', 'restart') if item in args), 'command')
    elif args[:2] == ['docker', 'exec']:
        ACTIVE['operation'] = 'docker_exec'
    elif args[:2] == ['docker', 'inspect']:
        ACTIVE['operation'] = 'docker_inspect'
    elif args[:3] == ['docker', 'image', 'inspect']:
        ACTIVE['operation'] = 'image_inspect'
    elif args[:3] == ['docker', 'network', 'inspect']:
        ACTIVE['operation'] = 'network_inspect'
    else:
        ACTIVE['operation'] = 'bounded_command'
    try:
        result = subprocess.run(args, input=input, env=env, text=True, check=True,
                                stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                                stderr=subprocess.PIPE, timeout=300)
    except subprocess.TimeoutExpired as error:
        ACTIVE['diagnostic'] = 'timeout'
        raise RuntimeError('command_timeout') from None
    except subprocess.CalledProcessError as error:
        # Never retain raw Docker/HTTP output: it can contain a secret or a URL.
        detail = (error.stderr or '').lower()
        ACTIVE['diagnostic'] = next((category for marker, category in (
            ('permission denied', 'permission_denied'),
            ('no such file or directory', 'missing_file'),
            ('unhealthy', 'unhealthy_container'),
            ('manifest unknown', 'missing_image'),
            ('mount', 'mount_error'),
            ('network', 'network_error'),
        ) if marker in detail), 'unspecified')
        raise RuntimeError('command_exit_' + str(error.returncode)) from None
    if capture and len(result.stdout) > 65536:
        raise RuntimeError('command_output_limit')
    return result.stdout if capture else None


def record(action, phase, status, category=None, **safe_details):
    ACTIVE.update(action=action, phase=phase, operation=None, diagnostic=None)
    body = {'action': action, 'phase': phase, 'status': status, **safe_details}
    if category:
        body['category'] = category
    put(STATE / (action + '.json'), (json.dumps(body, sort_keys=True) + '\n').encode(), 0o600)


def failure_category(error):
    if isinstance(error, KeyboardInterrupt):
        return 'interrupted'
    if isinstance(error, RuntimeError):
        return str(error) if re.fullmatch(r'command_(timeout|output_limit|exit_[0-9]+)', str(error)) else 'runtime'
    if isinstance(error, ValueError):
        return 'validation'
    if isinstance(error, (OSError, TimeoutError)):
        return 'operational'
    return 'unexpected'


def installed(name):
    return Path('/usr/local/sbin/dd-deploy') if name == 'deploy.py' else ROOT / name


def compose(manifest):
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    for target, key in [('booking', 'DD_BOOKING_IMAGE'), ('communications', 'DD_COMMUNICATIONS_IMAGE'),
                        ('worker', 'DD_WORKER_IMAGE')]:
        env[key] = manifest['images'][target]
    args = ['docker', 'compose', '--project-name', PROJECT, '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.production.yaml'),
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


def webhook_registry():
    registry = PRIVATE / 'runtime-private.json'
    trusted(registry, private=True)
    credentials = json.loads(registry.read_text())
    if not re.fullmatch(r'[a-f0-9]{64}', credentials.get('webhook_password', '')):
        raise ValueError('Invalid dedicated webhook credential registry')
    return registry, credentials


def webhook_header(password):
    encoded = base64.b64encode(('dd-booking:' + password).encode()).decode('ascii')
    return ('proxy_set_header Authorization "Basic ' + encoded + '";\n').encode()


def rotate_webhook():
    registry, credentials = webhook_registry()
    _, web = gates('booking-web.env')
    if web.get('PRETIX_MANAGE_WEBHOOK_USER') != 'dd-booking':
        raise ValueError('Unexpected webhook user')
    path = ROOT / 'secrets' / 'pretix-webhook-header.conf'
    marker = STATE / 'webhook-rotation.json'
    marker_data = json.loads(marker.read_text()) if marker.exists() else {}
    completed = marker_data.get('status') == 'complete'
    old = credentials['webhook_password']
    next_password = credentials.get('webhook_password_next')
    if next_password is not None and not re.fullmatch(r'[a-f0-9]{64}', next_password):
        raise ValueError('Invalid pending webhook credential')
    if completed and next_password is None:
        if web.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') != old or not path.exists():
            raise ValueError('Completed webhook rotation differs from running files')
        trusted(path)
        if path.read_bytes() != webhook_header(old):
            raise ValueError('Completed webhook header differs')
        put(path, webhook_header(old), 0o440, gid=PROXY_GROUP)
        return old, False
    if not completed and next_password is None and marker_data.get('status') == 'pending' and \
       marker_data.get('next_sha256') == hashlib.sha256(old.encode()).hexdigest() and \
       web.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') == old and path.exists() and \
       path.read_bytes() == webhook_header(old):
        put(path, webhook_header(old), 0o440, gid=PROXY_GROUP)
        return old, True
    if web.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') not in (old, next_password):
        raise ValueError('Webhook runtime differs from rotation registry')
    if path.exists():
        trusted(path)
        if path.read_bytes() not in (webhook_header(old), webhook_header(next_password) if next_password else b''):
            raise ValueError('Existing internal webhook header differs')
    if next_password is None:
        next_password = secrets.token_hex(32)
        credentials['webhook_password_next'] = next_password
        put(registry, (json.dumps(credentials, sort_keys=True) + '\n').encode(), 0o400)
    put(marker, (json.dumps({'status': 'pending',
                             'next_sha256': hashlib.sha256(next_password.encode()).hexdigest()}) + '\n').encode(), 0o600)
    # Replace the exposed path first. The old mounted inode survives only inside
    # the current proxy until the explicit recreation below.
    put(path, webhook_header(next_password), 0o440, gid=PROXY_GROUP)
    if web.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') != next_password:
        web['PRETIX_MANAGE_WEBHOOK_PASSWORD'] = next_password
        save_gates(ROOT / 'secrets' / 'booking-web.env', web)
    return next_password, True


def finish_webhook_rotation(password):
    registry, credentials = webhook_registry()
    if credentials.get('webhook_password_next') not in (password, None) or \
       (credentials.get('webhook_password_next') is None and credentials['webhook_password'] != password):
        raise ValueError('Pending webhook rotation differs')
    credentials['webhook_password'] = password
    credentials.pop('webhook_password_next', None)
    put(registry, (json.dumps(credentials, sort_keys=True) + '\n').encode(), 0o400)
    put(STATE / 'webhook-rotation.json', b'{"status":"complete"}\n', 0o600)


def running_application():
    # Compose service IDs do not require trusting current.json or its image refs.
    args = ['docker', 'ps', '--filter', 'label=com.docker.compose.project=' + PROJECT,
            '--format', '{{.ID}} {{.Label "com.docker.compose.service"}}']
    containers = dict(line.split(' ', 1)[::-1] for line in safe_run(args, capture=True).splitlines())
    images, ids, revisions = {}, {}, {}
    for target, service in APP_SERVICES.items():
        cid = containers.get(service)
        if not cid:
            raise ValueError('Running application service missing: ' + service)
        detail = json.loads(safe_run(['docker', 'inspect', cid], capture=True))[0]
        if detail['State']['Status'] != 'running':
            raise ValueError('Application service stopped: ' + service)
        image = detail['Config']['Image']
        if not re.fullmatch(re.escape('ghcr.io/m3g4w4tt5/dd-website-' + target) + r'@sha256:[0-9a-f]{64}', image):
            raise ValueError('Running application image is not a pinned published digest: ' + service)
        image_id = detail['Image']
        metadata = json.loads(safe_run(['docker', 'image', 'inspect', image_id], capture=True))[0]
        revision = metadata['Config'].get('Labels', {}).get('org.opencontainers.image.revision')
        if not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{40}', revision):
            raise ValueError('Running application revision missing: ' + service)
        images[target], ids[target] = image, image_id
        revisions[target] = revision
    return {'images': images, 'ids': ids, 'revisions': revisions}


def verify_runtime_mount(service, filename):
    cid = PROJECT + '-' + service + '-1'
    detail = json.loads(safe_run(['docker', 'inspect', cid], capture=True))[0]
    command = detail['Config'].get('Cmd') or []
    if detail['State']['Status'] != 'running' or '--env-file=/run/secrets/runtime' not in command:
        raise ValueError('Running application startup differs: ' + service)
    script = "const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('/run/secrets/runtime')).digest('hex'))"
    mounted_hash = safe_run(['docker', 'exec', cid, 'node', '-e', script], capture=True).strip()
    if mounted_hash != sha(ROOT / 'secrets' / filename):
        raise ValueError('Running runtime mount differs: ' + service)


def verify_webhook_proxy():
    probe = '''import urllib.request,urllib.error
try:
 urllib.request.urlopen(urllib.request.Request('http://proxy:8081/api/manage/pretix-webhook',data=b'{}',method='POST',headers={'Content-Type':'application/json'}),timeout=10)
 raise SystemExit(1)
except urllib.error.HTTPError as error:
 raise SystemExit(0 if error.code==400 else 1)
'''
    safe_run(['docker', 'exec', PROJECT + '-pretix-1', 'python', '-c', probe])


def verify_mounts():
    for service, destination, source in (
        ('pretix', '/pretix/src/production_settings.py', ROOT / 'pretix-settings.py'),
        ('pretix-cron', '/pretix/src/production_settings.py', ROOT / 'pretix-settings.py'),
        ('proxy', '/etc/nginx/conf.d/default.conf', ROOT / 'proxy.conf'),
    ):
        result = safe_run(['docker', 'exec', PROJECT + '-' + service + '-1',
                           'sha256sum', destination], capture=True).split()[0]
        if result != sha(source):
            raise ValueError('Running mount differs: ' + service)


def verify_pretix_activation():
    code = '''from django_scopes import scopes_disabled
from pretix.base.models import Event
from pretix.api.models import WebHook
with scopes_disabled():
 events=list(Event.objects.filter(organizer__slug='dd-studio'))
 assert len(events)==3 and all(e.testmode and e.live for e in events)
 hooks=list(WebHook.objects.filter(organizer__slug='dd-studio',comment='DD booking private lifecycle'))
 assert len(hooks)==1 and hooks[0].enabled and hooks[0].target_url=='http://proxy:8081/api/manage/pretix-webhook'
'''
    safe_run(['docker', 'exec', PROJECT + '-pretix-1', 'python', '-m', 'pretix', 'shell',
              '-v', '0', '-c', code])


def verify_bridge():
    data = json.loads(safe_run(['docker', 'network', 'inspect', 'dd-hosted_ingress'], capture=True))[0]
    gateways = [item.get('Gateway') for item in data['IPAM']['Config'] if item.get('Gateway')]
    if not gateways or any(ipaddress.ip_address(ip) not in ipaddress.ip_network('172.16.0.0/12') for ip in gateways):
        raise ValueError('Ingress bridge gateway differs from reviewed client-IP trust range')


def verify_proxy_group():
    # Numeric supplemental GID exists only in the proxy container. A host
    # account sharing it would also be able to read the bind-mounted header.
    if any(account.pw_gid == PROXY_GROUP for account in pwd.getpwall()):
        raise ValueError('Dedicated proxy GID is used by a host account')
    try:
        group = grp.getgrgid(PROXY_GROUP)
    except KeyError:
        return
    if group.gr_mem:
        raise ValueError('Dedicated proxy GID has host members')


def install(source):
    action = 'config-install'
    record(action, 'preflight', 'running')
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
        if sha(destination) not in (BASELINE[name], PARTIAL[name], TARGET[name]):
            raise ValueError('Installed configuration version differs: ' + name)
    verify_bridge()
    verify_proxy_group()
    running = running_application()
    manifest = current()
    if not isinstance(manifest, dict) or not re.fullmatch(r'[0-9a-f]{40}', manifest.get('commit', '')):
        raise ValueError('Existing successful-release record is not identifiable')
    # The successful-release record may predate an interrupted deployment.
    # Configuration installation must preserve the actual three image IDs.
    arguments, env = compose(running)
    drift = any(revision != manifest['commit'] for revision in running['revisions'].values())
    record(action, 'files', 'running', running_revisions=running['revisions'],
           recorded_revision=manifest['commit'], release_record_stale=drift)
    for name in FILES:
        put(installed(name), (source / name).read_bytes(), 0o755 if name == 'deploy.py' else 0o644)
    deploy = runpy.run_path(str(installed('deploy.py')))
    version = deploy['config_version'](ROOT)
    if version != deploy['config_version'](source):
        raise ValueError('Installed host configuration differs from reviewed source')
    safe_run(arguments + ['config', '--quiet'], env=env)
    record(action, 'credential_rotation', 'running', running_revisions=running['revisions'])
    password, rotation_pending = rotate_webhook()
    # --no-deps prevents proxy's dependencies from being reconciled to the
    # (possibly stale) successful-release manifest. Force recreation remounts
    # atomically replaced bind files even when Compose hashes do not change.
    command = arguments + ['up', '-d', '--no-deps', '--force-recreate', '--no-build',
                           '--pull', 'never', '--wait', '--wait-timeout', '240']
    record(action, 'pretix_recreation', 'running', running_revisions=running['revisions'])
    safe_run(command + ['pretix', 'pretix-cron'], env=env)
    if rotation_pending:
        record(action, 'booking_recreation', 'running', running_revisions=running['revisions'])
        safe_run(command + ['booking'], env=env)
    record(action, 'proxy_recreation', 'running', running_revisions=running['revisions'])
    safe_run(command + ['proxy'], env=env)
    record(action, 'verification', 'running', running_revisions=running['revisions'])
    after = running_application()
    if after['ids'] != running['ids'] or after['images'] != running['images']:
        raise ValueError('Configuration install changed application image identity')
    verify_runtime_mount('booking', 'booking-web.env')
    verify_mounts()
    verify_webhook_proxy()
    ACTIVE['operation'] = 'readiness'
    try:
        deploy['check_readiness'](arguments, env)
    except urllib.error.HTTPError as error:
        if not drift or error.code != 503:
            raise
        # The known partial install downgraded booking while leaving worker
        # newer. Only this exact availability failure may await the reviewed
        # image deployment; all other endpoints and the private hook must work.
        request = urllib.request.Request('http://127.0.0.1:8080/api/availability',
                                         headers={'Host': 'booking.didde-mie.com'})
        try:
            urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as availability_error:
            if availability_error.code != 503:
                raise
        else:
            raise ValueError('Availability changed during recovery')
        deploy['endpoint']('booking.didde-mie.com', '/')
        health = json.loads(deploy['endpoint']('booking.didde-mie.com', '/api/health'))
        if health.get('ok') is not True:
            raise ValueError('Booking health failed during recovery')
        deploy['endpoint']('checkout.didde-mie.com', '/')
        if rotation_pending:
            finish_webhook_rotation(password)
        record(action, 'awaiting_release', 'installed_pending_release',
               category='availability_503_stale_images', config_version=version,
               running_revisions=after['revisions'], recorded_revision=manifest['commit'],
               release_record_stale=True)
        print('PENDING: configuration and credential rotation verified; availability 503 with mixed application revisions. Deploy exact reviewed images before sandbox activation. Config version ' + version)
        return
    if rotation_pending:
        finish_webhook_rotation(password)
    record(action, 'complete', 'installed', config_version=version, running_revisions=after['revisions'],
           recorded_revision=manifest['commit'], release_record_stale=drift)
    print('PASS: reviewed host configuration installed; running application images preserved; Pretix-backed routes ready; version ' + version)


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
    for target, service in APP_SERVICES.items():
        cid = safe_run(args + ['ps', '-q', service], env=env, capture=True).strip()
        if not cid:
            raise ValueError('Application service missing: ' + service)
        image_id = safe_run(['docker', 'inspect', '--format', '{{.Image}}', cid], capture=True).strip()
        referenced_id = safe_run(['docker', 'image', 'inspect', '--format', '{{.Id}}',
                                  manifest['images'][target]], capture=True).strip()
        revision = safe_run(['docker', 'image', 'inspect', '--format',
                             '{{index .Config.Labels "org.opencontainers.image.revision"}}', image_id], capture=True).strip()
        if revision != commit or image_id != referenced_id:
            raise ValueError('Actual running application revision differs: ' + service)
    return manifest, args, env


PRETIX_ACTIVATION = '''
from django_scopes import scopes_disabled
from django.db import transaction
from pretix.base.models import Event, Organizer
from pretix.api.models import WebHook, WebHookEventListener
from pretix.plugins.stripe.payment import StripeCC
with scopes_disabled(), transaction.atomic():
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
    record('sandbox-gates', 'preflight', 'running', commit=commit)
    manifest, args, env = verify_release(commit)
    _, credentials = webhook_registry()
    if credentials.get('webhook_password_next') or json.loads((STATE / 'webhook-rotation.json').read_text()).get('status') != 'complete':
        raise ValueError('Webhook rotation is incomplete')
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
    record('sandbox-gates', 'pretix_activation', 'running', commit=commit)
    safe_run(['docker', 'exec', '-i', PROJECT + '-pretix-1', 'python', '-m', 'pretix', 'shell', '-v', '0',
              '-c', 'exec(__import__("sys").stdin.read())'], input=code)
    web.update({'PREVIEW': 'false', 'PRETIX_MANAGE_WRITE_API_TOKEN': credentials['write'],
                'PRETIX_EVENTS_CHECKOUT_ENABLED': 'true', 'BOOKING_SELF_SERVICE_ENABLED': 'true',
                'STRIPE_WEBHOOK_SIGNING_SECRET': signing})
    for path, values in files.values():
        values['PREVIEW'] = 'false'
        save_gates(path, values)
    record('sandbox-gates', 'runtime_recreation', 'running', commit=commit)
    safe_run(args + ['up', '-d', '--no-deps', '--force-recreate', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '240',
                     'booking', 'booking-communications', 'booking-worker'], env=env)
    safe_run(args + ['restart', 'proxy'], env=env)
    record('sandbox-gates', 'verification', 'running', commit=commit)
    for service, filename in (('booking', 'booking-web.env'),
                              ('booking-communications', 'booking-communications.env'),
                              ('booking-worker', 'booking-worker.env')):
        verify_runtime_mount(service, filename)
    verify_pretix_activation()
    ACTIVE['operation'] = 'readiness'
    runpy.run_path(str(installed('deploy.py')))['check_readiness'](args, env)
    record('sandbox-gates', 'complete', 'configured', commit=commit, preview=False, checkout=True,
           self_service=True, payment_release=False, mail_release=False, delivery='capture',
           provider_acceptance='pending')
    print('PASS: test-mode events visible; sandbox files mounted by recreated services and private webhook verified. Payment, refund and mail behavior still require hosted acceptance.')


def controlled_mail(commit):
    record('mail-gates', 'preflight', 'running', commit=commit)
    _, args, env = verify_release(commit)
    files = {name: gates(name) for name in ('booking-communications.env', 'booking-worker.env')}
    for _, values in files.values():
        if values.get('PREVIEW') != 'false' or values.get('PAYMENT_ENVIRONMENT') != 'sandbox' or \
           values.get('PAYMENT_RELEASE_ENABLED') != 'false' or values.get('MAIL_RELEASE_ENABLED') != 'false' or \
           values.get('MAIL_DELIVERY') not in ('capture', 'controlled'):
            raise ValueError('Sandbox gates are not ready for controlled mail')
    existing = [values for _, values in files.values() if values.get('MAIL_DELIVERY') == 'controlled']
    if existing:
        host, password = existing[0].get('SMTP_HOST', ''), existing[0].get('SMTP_PASSWORD', '')
        if any(values.get('SMTP_HOST') != host or values.get('SMTP_PASSWORD') != password or
               values.get('MAIL_RECIPIENT_ALLOWLIST') != 'dev@memoryone.eu' for values in existing):
            raise ValueError('Existing controlled mail credentials differ')
    else:
        host = input('Approved SMTP host: ').strip()
        password = getpass.getpass('Booking SMTP password (hidden): ').strip()
    if not re.fullmatch(r'[A-Za-z0-9.-]{4,253}', host) or len(password) < 12 or '\n' in password:
        raise ValueError('Invalid SMTP input')
    for path, values in files.values():
        values.update({'MAIL_DELIVERY': 'controlled', 'MAIL_RECIPIENT_ALLOWLIST': 'dev@memoryone.eu',
                       'SMTP_HOST': host, 'SMTP_PORT': '465', 'SMTP_USER': 'booking@didde-mie.com',
                       'SMTP_PASSWORD': password})
        save_gates(path, values)
    record('mail-gates', 'runtime_recreation', 'running', commit=commit)
    safe_run(args + ['up', '-d', '--no-deps', '--force-recreate', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '240',
                     'booking-communications', 'booking-worker'], env=env)
    safe_run(args + ['restart', 'proxy'], env=env)
    record('mail-gates', 'verification', 'running', commit=commit)
    for service, filename in (('booking-communications', 'booking-communications.env'),
                              ('booking-worker', 'booking-worker.env')):
        verify_runtime_mount(service, filename)
    ACTIVE['operation'] = 'readiness'
    runpy.run_path(str(installed('deploy.py')))['check_readiness'](args, env)
    record('mail-gates', 'complete', 'configured_pending_delivery', commit=commit,
           recipient='dev@memoryone.eu', mail_release=False)
    print('PASS: controlled-mail files mounted by recreated communications and worker; only dev@memoryone.eu configured. Delivery remains to be verified; Pretix remains on Mailpit.')


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


def run_owner_action():
    ACTIVE.update(action=None, phase=None, operation=None, diagnostic=None)
    try:
        main()
    except (ValueError, OSError, RuntimeError, TimeoutError, AssertionError, KeyboardInterrupt) as error:
        if ACTIVE['action']:
            try:
                record(ACTIVE['action'], ACTIVE['phase'], 'failed', category=failure_category(error),
                       operation=ACTIVE['operation'], diagnostic=ACTIVE['diagnostic'])
            except OSError:
                pass
        print('Hosted release stopped at ' + str(ACTIVE['phase'] or 'preflight') +
              ' (' + failure_category(error) + '); inspect sanitized status before retry.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(run_owner_action())
