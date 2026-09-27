#!/usr/bin/python3
"""Owner-run, closed-gate migration to the approved private booking hostnames."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
NEW_BOOKING = 'booking.didde-mie.com'
NEW_CHECKOUT = 'checkout.didde-mie.com'
OLD_BOOKING = 'studio.' + 'didde-mie.com'
OLD_CHECKOUT = 'ttd-' + 'checkout.didde-mie.com'
OLD_HASHES = {
    'compose.production.yaml': '8a9a166c1ce3c2dd3c3b09cb54a31d1cb83ca642da750c17594680e371803e16',
    'proxy.conf': '348c1f025dac454e9a9cd69679e782994565a06276109fc0ca5f0cb267a91cf9',
    'deploy.py': '371b9220a7bb63826c6ebab9a44b1bed018086ee6ee086e7ae925634853144fd',
}


def trust(path, uid=0, private=False):
    stat = path.lstat()
    if path.is_symlink() or not path.is_file() or stat.st_uid != uid or stat.st_mode & (0o077 if private else 0o022):
        raise ValueError('Unsafe operational file: ' + path.name)
    return stat


def old_form(new):
    return new.replace(NEW_BOOKING.encode(), OLD_BOOKING.encode()).replace(
        NEW_CHECKOUT.encode(), OLD_CHECKOUT.encode())


def write_atomic(path, body, uid, gid, mode):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp.write(body)
        tmp = Path(temp.name)
    try:
        os.chown(tmp, uid, gid)
        tmp.chmod(mode)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    source = Path(__file__).resolve().parent
    for directory in (source, ROOT, ROOT / 'secrets', STATE, PRIVATE):
        stat = directory.lstat()
        if directory.is_symlink() or not directory.is_dir() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError('Unsafe operational directory')
    for name in ('migrate-hosted-hostnames.py', 'setup-hosted-runtime.py',
                 'setup-hosted-pretix.py', 'compose.production.yaml', 'proxy.conf', 'deploy.py'):
        trust(source / name)
    trust(ROOT / 'ready')
    trust(STATE / 'current.json', private=True)
    for name in ('runtime-private.json', 'provisioning-private.json', 'pretix-django-secret'):
        trust(PRIVATE / name, private=True)
    if (PRIVATE / 'hostname-migration.complete').exists():
        raise ValueError('Hostname migration already completed; inspect rather than repeat')
    runtime = runpy.run_path(str(source / 'setup-hosted-runtime.py'))
    pretix = runpy.run_path(str(source / 'setup-hosted-pretix.py'))
    deploy = runpy.run_path(str(source / 'deploy.py'))
    manifest = deploy['validate_manifest'](json.loads((STATE / 'current.json').read_text()))
    credentials = json.loads((PRIVATE / 'runtime-private.json').read_text())
    passwords = json.loads((PRIVATE / 'provisioning-private.json').read_text())['passwords']
    django_secret = (PRIVATE / 'pretix-django-secret').read_text().strip()
    expected = {}
    for name, (uid, settings) in runtime['runtime_files'](credentials, passwords).items():
        desired = ''.join(k + '=' + v + '\n' for k, v in settings.items()).encode()
        expected[ROOT / 'secrets' / name] = (old_form(desired), desired, uid, uid, 0o400)
    for role, name in [('pretix_runtime', 'pretix-runtime.cfg'),
                       ('pretix_migrator', 'pretix-migration.cfg')]:
        desired = pretix['config'](role, passwords[role], django_secret).encode()
        expected[ROOT / 'secrets' / name] = (old_form(desired), desired, 15371, 15371, 0o400)
    for name, destination, mode in (
        ('compose.production.yaml', ROOT / 'compose.production.yaml', 0o644),
        ('proxy.conf', ROOT / 'proxy.conf', 0o644),
        ('deploy.py', Path('/usr/local/sbin/dd-deploy'), 0o755),
    ):
        desired = (source / name).read_bytes()
        if hashlib.sha256(old_form(desired)).hexdigest() != OLD_HASHES[name]:
            raise ValueError('Reviewed previous host configuration differs: ' + name)
        expected[destination] = (old_form(desired), desired, 0, 0, mode)
    for path, (previous, desired, uid, gid, mode) in expected.items():
        trust(path, uid, private=mode == 0o400)
        if path.stat().st_mode & 0o777 != mode or path.read_bytes() not in (previous, desired):
            raise ValueError('Existing hosted configuration differs: ' + path.name)
        if previous == desired or OLD_BOOKING.encode() in desired or OLD_CHECKOUT.encode() in desired:
            raise ValueError('Hostname replacement is incomplete: ' + path.name)
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    env.update({deploy['TARGETS'][key]: image for key, image in manifest['images'].items()})
    compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml'),
               '-f', str(ROOT / 'compose.hosted.yaml')]
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd = os.open(PRIVATE / 'hostname-migration.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as log:
            services = set(subprocess.run(compose + ['ps', '--status', 'running', '--services'],
                                          env=env, text=True, check=True, stdout=subprocess.PIPE,
                                          stderr=log).stdout.splitlines())
            if services != set(deploy['SERVICES']):
                raise ValueError('Expected current closed-gate stack before hostname migration')
            for path, (_, desired, uid, gid, mode) in expected.items():
                if path.read_bytes() != desired:
                    write_atomic(path, desired, uid, gid, mode)
            subprocess.run(compose + ['config', '--quiet'], env=env, stdout=log, stderr=log, check=True)
            subprocess.run(compose + ['up', '-d', '--no-build', '--no-deps', '--force-recreate',
                                      '--wait', '--wait-timeout', '240', 'pretix', 'pretix-cron',
                                      'booking', 'booking-communications', 'booking-worker', 'proxy'],
                           env=env, stdout=log, stderr=log, check=True)
            for host, path, status in ((NEW_BOOKING, '/api/health', '200'),
                                       (NEW_CHECKOUT, '/', '200'),
                                       (OLD_BOOKING, '/', '404'),
                                       (OLD_CHECKOUT, '/', '404')):
                actual = subprocess.run(['curl', '--silent', '--output', '/dev/null',
                                         '--max-time', '15', '--write-out', '%{http_code}',
                                         '--header', 'Host: ' + host,
                                         'http://127.0.0.1:8080' + path],
                                        env=env, text=True, check=True,
                                        stdout=subprocess.PIPE, stderr=log).stdout
                if actual != status:
                    raise ValueError('Hostname route failed validation: ' + host)
            marker = PRIVATE / 'hostname-migration.complete'
            fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
            with os.fdopen(fd, 'w') as stream:
                stream.write('approved-hostnames-v1\n')
    print('PASS: approved booking and checkout hostnames active; old hosts denied at the VPS proxy.')
    print('Original credentials and volumes preserved; preview/sandbox/capture and closed payment/mail/write gates unchanged.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Hostname migration failed; inspect /var/lib/dd-hosted/provisioning/hostname-migration.log privately.', file=sys.stderr)
        sys.exit(1)
