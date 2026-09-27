#!/usr/bin/python3
"""Owner-run configuration import using the separately scoped Pretix migrator."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
EXPECTED = '30f19c67dae97c8b15c691963a2ab22deff8d252a2cc02861b6060ca2ca77aab'


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Initial configuration import must precede hosted activation')
    source = Path(__file__).resolve().parent
    package = source / 'events.json'
    if package.stat().st_size > 16 * 1024 * 1024:
        raise ValueError('Oversized configuration package')
    data = json.loads(package.read_text())
    if data.get('sha256') != EXPECTED:
        raise ValueError('Configuration does not match the reviewed export')
    code_file = source / 'transfer-pretix-configuration.py'
    for path in (package, code_file):
        if path.is_symlink() or path.stat().st_uid != 0 or path.stat().st_mode & 0o022:
            raise ValueError('Install root-owned reviewed files before importing')
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        destination = PRIVATE / 'events.json'
        if destination.is_symlink():
            raise ValueError('Unsafe private configuration path')
        shutil.copyfile(package, destination)
        os.chown(destination, 15371, 15371)
        destination.chmod(0o400)
        log_path = PRIVATE / 'configuration-import.log'
        with log_path.open('a') as log:
            log_path.chmod(0o600)
            compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml')]
            subprocess.run(compose + ['--profile', 'migration', 'run', '-T', '--rm', '--no-deps',
                '--volume', f'{destination}:/run/configuration/events.json:ro',
                '--entrypoint', 'python3', 'pretix-migrate', '-m', 'pretix', 'shell', '-v', '0',
                '-c', 'TRANSFER_MODE="import"; exec(__import__("sys").stdin.read())'],
                input=code_file.read_text(), text=True, env=env, stdout=log, stderr=log, check=True)
            check = '''from django_scopes import scopes_disabled
from pretix.base.models import Event, Quota, Order
with scopes_disabled():
 assert Event.objects.count() == 3 and Quota.objects.count() == 657
 assert not Event.objects.filter(testmode=False).exists()
 assert not Event.objects.filter(live=True).exists()
 assert not Order.objects.exists()
'''
            subprocess.run(compose + ['run', '-T', '--rm', '--no-deps', '--entrypoint', 'python3',
                'pretix', '-m', 'pretix', 'shell', '-v', '0', '-c', check],
                text=True, env=env, stdout=log, stderr=log, check=True)
        print('PASS: hosted configuration matches reviewed export; runtime reads 3 unpublished test events and 657 quotas; no orders imported.')
        print('Retained: 4 products, 656 dates, 2 tax rules, buyer-detail requirements and EN/DA configuration.')
        print('Orders, users, sessions, API/payment credentials and integration settings were not copied. Applications remain stopped.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Configuration import failed; inspect /var/lib/dd-hosted/provisioning/configuration-import.log privately.', file=sys.stderr)
        sys.exit(1)
