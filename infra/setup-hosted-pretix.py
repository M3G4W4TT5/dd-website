#!/usr/bin/python3
"""Owner-run Pretix credentials and schema migration, without application startup."""
import configparser
import fcntl
import io
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
PRETIX = 'pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02'


def config(role, password, secret):
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read_dict({
        'pretix': {'instance_name': 'DD private hosted sandbox',
                   'url': 'https://checkout.didde-mie.com', 'currency': 'DKK',
                   'datadir': '/data', 'trust_x_forwarded_for': 'on',
                   'trust_x_forwarded_proto': 'on', 'password_reset': 'off',
                   'plugins_default': 'pretix.plugins.statistics,pretix.plugins.checkinlists,pretix.plugins.stripe'},
        'locale': {'default': 'da', 'timezone': 'Europe/Copenhagen'},
        'languages': {'enabled': 'en,da', 'allow_incubating': 'da'},
        'database': {'backend': 'postgresql', 'host': 'postgres', 'port': '5432',
                     'name': 'pretix', 'user': role, 'password': password},
        'django': {'secret': secret, 'debug': 'off'},
        'redis': {'location': 'redis://redis:6379/0', 'sessions': 'true'},
        'celery': {'backend': 'redis://redis:6379/1', 'broker': 'redis://redis:6379/2'},
        'mail': {'host': 'mail-capture', 'port': '1025', 'tls': 'off', 'ssl': 'off',
                 'from': 'noreply+booking@didde-mie.com'},
    })
    out = io.StringIO()
    cfg.write(out)
    return out.getvalue()


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Hosted activation already completed; do not run initial setup')
    if not (PRIVATE / 'hosted-bootstrap.json').is_file():
        raise ValueError('Complete hosted database bootstrap first')
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        log_path = PRIVATE / 'pretix-setup.log'
        with log_path.open('a') as log:
            log_path.chmod(0o600)
            def run(args, *, capture=False):
                result = subprocess.run(args, check=True, text=True, env=env,
                                        stdout=subprocess.PIPE if capture else log, stderr=log)
                return result.stdout.strip() if capture else None
            registry = json.loads((PRIVATE / 'provisioning-private.json').read_text())['passwords']
            for role in ('pretix_runtime', 'pretix_migrator'):
                if not re.fullmatch('[a-f0-9]{64}', registry[role]):
                    raise ValueError('Invalid private role registry')
            run(['docker', 'pull', PRETIX])
            uid = int(run(['docker', 'run', '--rm', '--network', 'none',
                           '--entrypoint', 'id', PRETIX, '-u'], capture=True))
            if uid != 15371:
                raise ValueError('Unexpected pinned Pretix image user')
            secret_path = PRIVATE / 'pretix-django-secret'
            if not secret_path.exists():
                fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as stream:
                    stream.write(secrets.token_hex(32))
            secret = secret_path.read_text().strip()
            if not re.fullmatch('[a-f0-9]{64}', secret):
                raise ValueError('Invalid private Django secret')
            for role, filename in [('pretix_runtime', 'pretix-runtime.cfg'),
                                   ('pretix_migrator', 'pretix-migration.cfg')]:
                path = ROOT / 'secrets' / filename
                expected = config(role, registry[role], secret)
                if path.exists():
                    if path.is_symlink() or path.read_text() != expected:
                        raise ValueError('Existing Pretix configuration differs; inspect rather than overwrite')
                else:
                    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o400)
                    with os.fdopen(fd, 'w') as stream:
                        stream.write(expected)
                os.chown(path, uid, uid)
                path.chmod(0o400)
            source = Path(__file__).resolve().parent / 'compose.production.yaml'
            if source.is_symlink() or source.stat().st_uid != 0:
                raise ValueError('Install reviewed root-owned Compose file beside this helper')
            shutil.copyfile(source, ROOT / 'compose.production.yaml')
            os.chown(ROOT / 'compose.production.yaml', 0, 0)
            (ROOT / 'compose.production.yaml').chmod(0o644)
            compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml')]
            run(compose + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'redis', 'mail-capture'])
            run(compose + ['--profile', 'migration', 'run', '--rm', '--no-deps',
                           'pretix-migrate', 'migrate', '--noinput'])
            # Verify using the runtime credential, not the migrator/admin role.
            check = '''from django.conf import settings
from django.db import connection
assert settings.EMAIL_HOST == 'mail-capture' and settings.EMAIL_PORT == 1025
assert not settings.EMAIL_HOST_PASSWORD
with connection.cursor() as c:
 c.execute("SELECT current_user, count(*) FROM django_migrations GROUP BY current_user")
 role, count = c.fetchone()
 assert role == 'pretix_runtime' and count > 0
 c.execute("SELECT has_schema_privilege(current_user,'public','CREATE')")
 assert not c.fetchone()[0]
from pretix.base.models import Order, User
from django_scopes import scopes_disabled
with scopes_disabled():
 assert Order.objects.count() == 0
 assert not User.objects.exclude(email='admin@localhost').exists()
 for user in User.objects.filter(email='admin@localhost'):
  user.set_unusable_password()
  user.is_active = False
  user.save(update_fields=['password','is_active'])
 assert not User.objects.filter(is_active=True).exists()
print('runtime verified')
'''
            run(compose + ['--profile', 'migration', 'run', '--rm', '--no-deps',
                           '-e', 'PRETIX_CONFIG_FILE=/run/secrets/runtime',
                           '--entrypoint', 'python3', 'pretix', '-m', 'pretix', 'shell', '-c', check])
            print('PASS: Pretix migrations applied; runtime role reads schema and cannot create tables; orders empty; default admin disabled.')
            print('Redis and internal Mailpit running; capture UI binds only to 127.0.0.1:8025. No external SMTP credentials configured.')
            print('Pretix web/worker and booking apps remain stopped; hosted activation stays disabled.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Pretix setup failed; inspect /var/lib/dd-hosted/provisioning/pretix-setup.log privately.', file=sys.stderr)
        sys.exit(1)
