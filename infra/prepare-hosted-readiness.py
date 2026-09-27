#!/usr/bin/python3
"""Owner-run final prerequisite check. Marks ready but never starts applications."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
CONFIGS = ('compose.production.yaml', 'compose.hosted.yaml', 'proxy.conf',
           'pretix-nginx.conf', 'pretix-settings.py', 'pretix-task.conf')


def trusted(path, uid=0, private=False):
    stat = path.lstat()
    if path.is_symlink() or not path.is_file() or stat.st_uid != uid or stat.st_mode & (0o077 if private else 0o022):
        raise ValueError('File ownership/permissions differ: ' + path.name)


def matching(source, destination):
    trusted(source)
    trusted(destination)
    if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(destination.read_bytes()).digest():
        raise ValueError('Installed file differs from reviewed source: ' + source.name)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Readiness is already enabled; inspect instead of repeating initial setup')
    source = Path(__file__).resolve().parent
    for directory in (source, ROOT, STATE, PRIVATE, ROOT / 'secrets'):
        stat = directory.lstat()
        if directory.is_symlink() or not directory.is_dir() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError('Unsafe operational directory')
    for name in CONFIGS:
        matching(source / name, ROOT / name)
    matching(source / 'deploy.py', Path('/usr/local/sbin/dd-deploy'))
    trusted(source / 'setup-hosted-runtime.py')
    trusted(source / 'release.json')
    deploy = runpy.run_path(str(source / 'deploy.py'))
    manifest = deploy['validate_manifest'](json.loads((source / 'release.json').read_text()))
    setup = runpy.run_path(str(source / 'setup-hosted-runtime.py'))
    for name, value in [('runtime-setup.complete', 'scoped-runtime-v1\n'),
                        ('limits-setup.complete', 'hosted-limits-v1\n')]:
        trusted(PRIVATE / name, private=True)
        if (PRIVATE / name).read_text() != value:
            raise ValueError('Missing verified checkpoint: ' + name)
    for name in ('runtime-private.json', 'provisioning-private.json'):
        trusted(PRIVATE / name, private=True)
    credentials = json.loads((PRIVATE / 'runtime-private.json').read_text())
    passwords = json.loads((PRIVATE / 'provisioning-private.json').read_text())['passwords']
    runtime = setup['runtime_files'](credentials, passwords)
    for name, (uid, config) in runtime.items():
        path = ROOT / 'secrets' / name
        trusted(path, uid, private=True)
        expected = ''.join(k + '=' + v + '\n' for k, v in config.items())
        if path.read_text() != expected:
            raise ValueError('Runtime configuration differs from closed-gate smoke setup: ' + name)
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    env.update({deploy['TARGETS'][k]: v for k, v in manifest['images'].items()})
    compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml'),
               '-f', str(ROOT / 'compose.hosted.yaml')]
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd = os.open(PRIVATE / 'readiness.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as log:
            def run(args, capture=False):
                result = subprocess.run(args, env=env, text=True, check=True,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                return result.stdout.strip() if capture else None
            run(compose + ['config', '--quiet'])
            running = set(run(compose + ['ps', '--status', 'running', '--services'], True).splitlines())
            if running != {'postgres', 'redis', 'mail-capture'}:
                raise ValueError('Expected preparation-only service state')
            for service in running:
                cid = run(compose + ['ps', '-q', service], True)
                health = run(['docker', 'inspect', '--format', '{{.State.Health.Status}}', cid], True)
                if health != 'healthy':
                    raise ValueError('Preparation service is unhealthy: ' + service)
            run(['systemctl', 'is-active', '--quiet', 'dd-cloudflared.service'])
            run(['systemctl', 'is-enabled', '--quiet', 'dd-cloudflared.service'])
            tunnel = json.loads(run(['curl', '--fail', '--silent', '--max-time', '10',
                                     'http://127.0.0.1:20245/ready'], True))
            if tunnel.get('status') != 200 or tunnel.get('readyConnections', 0) < 1:
                raise ValueError('Private tunnel is not ready')
            run(['curl', '--fail', '--silent', '--output', '/dev/null', '--max-time', '10',
                 'http://127.0.0.1:8025/'])
            for image in manifest['images'].values():
                # Anonymous pull; no registry credential is installed on the VPS.
                run(['docker', 'pull', image])
                revision = run(['docker', 'image', 'inspect', '--format',
                                '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], True)
                if revision != manifest['commit']:
                    raise ValueError('Image revision differs from reviewed release')
            image = manifest['images']['communications']
            for name, (uid, _) in runtime.items():
                validator = ('import {communicationsConfig} from "./server/runtime/config.ts"; communicationsConfig(process.env,"booking");'
                             if uid == 10002 else 'import {' + ('validateWorker' if uid == 10003 else 'validateBooking') +
                             '} from "./apps/booking/server/config.ts"; ' +
                             ('validateWorker' if uid == 10003 else 'validateBooking') + '(process.env);')
                database_key = 'MARKETING_DATABASE_URL' if uid == 10002 else 'BOOKING_DATABASE_URL'
                role = {10001: 'booking_web_runtime', 10002: 'booking_marketing_runtime', 10003: 'booking_worker_runtime'}[uid]
                validator += 'import pg from "pg"; const c=new pg.Client({connectionString:process.env.' + database_key + '}); await c.connect();'
                validator += 'try {const r=await c.query("SELECT current_user, has_schema_privilege(current_user,\'public\',\'CREATE\') AS ddl"); if(r.rows[0].current_user!=="' + role + '" || r.rows[0].ddl) throw Error("Runtime role isolation failed");} finally {await c.end();}'
                if uid != 10001:
                    validator += 'import {createCapture} from "./server/mail/capture.ts"; const store=createCapture("/capture"); try {await store({},Buffer.from("Synthetic private capture check")); await store.prune();} finally {store.close();}'
                args = ['docker', 'run', '--rm', '--read-only', '--user', f'{uid}:{uid}',
                        '--network', 'dd-hosted_database', '--cap-drop', 'ALL',
                        '--security-opt', 'no-new-privileges', '--memory', '256m', '--pids-limit', '64',
                        '--tmpfs', '/tmp:rw,nosuid,noexec,size=64m,mode=1777',
                        '--tmpfs', f'/capture:rw,nosuid,noexec,size=32m,mode=0700,uid={uid},gid={uid}',
                        '--mount', f'type=bind,src={ROOT}/secrets/{name},dst=/run/secrets/runtime,readonly',
                        '--entrypoint', 'node', image, '--env-file=/run/secrets/runtime',
                        '--import', 'tsx', '--input-type=module', '-e', validator]
                run(args)
            fd = os.open(ROOT / 'ready', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
            with os.fdopen(fd, 'w') as stream:
                stream.write('private-smoke ' + manifest['commit'] + '\n')
    print('PASS: reviewed files, exact image revisions, runtime roles/capture and private tunnel verified; readiness enabled.')
    print('Applications remain stopped. GitHub Actions may now perform the closed-gate private smoke deployment.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Readiness failed; inspect /var/lib/dd-hosted/provisioning/readiness.log privately.', file=sys.stderr)
        sys.exit(1)
