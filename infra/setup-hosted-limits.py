#!/usr/bin/python3
"""Owner-run limits/logging/capture configuration. Does not deploy applications."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
PRIVATE = Path('/var/lib/dd-hosted/provisioning')
FILES = ('compose.production.yaml', 'proxy.conf', 'pretix-nginx.conf',
         'pretix-settings.py', 'pretix-task.conf')
BEFORE = {
    'compose.production.yaml': '3ee9d6f87db627e008897b2a18b464346dd7dfb5841e38d06123557577c41822',
    'proxy.conf': '4f617850966d01ffe08e3b21c3a7193dedc3901c0591d600350f0ef01c3cdc21',
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reviewed(path):
    stat = path.lstat()
    if path.is_symlink() or not path.is_file() or stat.st_uid != 0 or stat.st_mode & 0o022:
        raise ValueError('Install root-owned reviewed files: ' + path.name)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Initial limits setup must precede activation')
    if (PRIVATE / 'runtime-setup.complete').read_text() != 'scoped-runtime-v1\n':
        raise ValueError('Complete hosted runtime credentials first')
    for directory in (ROOT, PRIVATE):
        stat = directory.lstat()
        if directory.is_symlink() or not directory.is_dir() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError('Unsafe operational directory')
    source = Path(__file__).resolve().parent
    for name in FILES:
        reviewed(source / name)
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with Path('/var/lib/dd-hosted/deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fd = os.open(PRIVATE / 'limits-setup.log', os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'a') as log:
            def run(args, capture=False):
                result = subprocess.run(args, text=True, env=env, check=True,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                return result.stdout.strip() if capture else None
            compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml')]
            running = set(run(compose + ['ps', '--status', 'running', '--services'], True).splitlines())
            if running != {'postgres', 'redis', 'mail-capture'}:
                raise ValueError('Unexpected running services; inspect before initial limits setup')
            # Internal HTTP works even while host port publishing is unavailable.
            mail = run(compose + ['ps', '-q', 'mail-capture'], True)
            summary = json.loads(run(['docker', 'exec', mail, 'wget', '-qO-',
                                      'http://127.0.0.1:8025/api/v1/messages'], True))
            if summary.get('total') != 0:
                raise ValueError('Mailpit contains captures; inspect and preserve them before recreation')
            free = shutil.disk_usage(ROOT).free
            memory_kib = int(next(line.split()[1] for line in Path('/proc/meminfo').read_text().splitlines()
                                  if line.startswith('MemTotal:')))
            if free < 8 * 1024**3 or memory_kib < 3500 * 1024:
                raise ValueError('Insufficient initial disk or memory budget')
            # Preserve prior non-secret host configuration and refuse unrelated drift.
            for name in FILES:
                target = ROOT / name
                desired = source / name
                previous = PRIVATE / (name + '.before-limits')
                if target.exists() or target.is_symlink():
                    reviewed(target)
                    if digest(target) != digest(desired):
                        if digest(target) != BEFORE.get(name):
                            raise ValueError('Existing host configuration differs: ' + name)
                        if previous.exists():
                            reviewed(previous)
                            if digest(previous) != digest(target):
                                raise ValueError('Previous host configuration differs: ' + name)
                        else:
                            with previous.open('xb') as output:
                                output.write(target.read_bytes())
                            previous.chmod(0o600)
                shutil.copyfile(desired, target)
                os.chown(target, 0, 0)
                target.chmod(0o644)
            run(compose + ['config', '--quiet'])
            run(compose + ['up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '90', 'mail-capture'])
            run(['curl', '--fail', '--silent', '--output', '/dev/null', '--max-time', '10',
                 'http://127.0.0.1:8025/'])
            container = run(compose + ['ps', '-q', 'mail-capture'], True)
            settings = json.loads(run(['docker', 'inspect', container], True))[0]
            ports = settings['NetworkSettings']['Ports']
            if ports.get('8025/tcp') != [{'HostIp': '127.0.0.1', 'HostPort': '8025'}]:
                raise ValueError('Mail capture UI binding differs')
            if ports.get('1025/tcp') or ports.get('1110/tcp'):
                raise ValueError('Mail capture SMTP/POP must not be published')
            limits = settings['HostConfig']
            if limits['Memory'] != 128 * 1024**2 or limits['PidsLimit'] != 64:
                raise ValueError('Mail capture resource limits differ')
            if limits['LogConfig'] != {'Type': 'local', 'Config': {'max-size': '10m', 'max-file': '3'}}:
                raise ValueError('Mail capture log rotation differs')
            marker = PRIVATE / 'limits-setup.complete'
            if marker.is_symlink():
                raise ValueError('Unsafe completion marker')
            marker.write_text('hosted-limits-v1\n')
            marker.chmod(0o400)
    print('PASS: hosted resource/log/capture configuration installed; Mailpit UI responds on 127.0.0.1:8025 only.')
    print('SMTP/POP ports unpublished; previous configuration preserved; database volumes and credentials unchanged.')
    print('Applications remain stopped. Bounded application captures take effect with the reviewed CI images.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Limits setup failed; inspect /var/lib/dd-hosted/provisioning/limits-setup.log privately.', file=sys.stderr)
        sys.exit(1)
