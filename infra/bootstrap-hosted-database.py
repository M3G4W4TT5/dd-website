#!/usr/bin/python3
"""Owner-run fresh hosted database job. Never prints credential values."""
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
PRIVATE = STATE / 'provisioning'
PASSWORD = ROOT / 'secrets/postgres-admin-password'
MARKER = PRIVATE / 'hosted-bootstrap.json'
COMMIT = '07110aeffffc649ab4d66dfcd34ae879f0802e65'
IMAGE = 'ghcr.io/m3g4w4tt5/dd-website-communications@sha256:a3d41b983fe2920e3b57f1edb4a9c5ba085de6c1c453381448196bba232e3ce6'
POSTGRES = 'postgres:17.6-alpine'


def run(args, *, capture=False, stdin=None):
    result = subprocess.run(args, input=stdin, text=True, check=True,
                            stdout=subprocess.PIPE if capture else LOG,
                            stderr=LOG, env=ENV)
    return result.stdout.strip() if capture else None


def private_file(path, body):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(body)


def main():
    global LOG, ENV
    if os.geteuid() != 0:
        raise ValueError('Run through sudo as the VPS owner')
    if (ROOT / 'ready').exists():
        raise ValueError('Deployment is already activated; do not run initial bootstrap')
    STATE.mkdir(mode=0o700, exist_ok=True)
    PRIVATE.mkdir(mode=0o700, exist_ok=True)
    for directory in (STATE, PRIVATE):
        if directory.is_symlink() or directory.stat().st_uid != 0:
            raise ValueError('Private operational directories must be root-owned')
        directory.chmod(0o700)
    ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root',
           'DD_SECRET_DIRECTORY': str(ROOT / 'secrets')}
    with (STATE / 'deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        with (PRIVATE / 'bootstrap.log').open('a') as log:
            LOG = log
            (PRIVATE / 'bootstrap.log').chmod(0o600)
            # A foreign/existing volume must never be adopted by this fresh-install job.
            volume = subprocess.run(['docker', 'volume', 'inspect', 'dd-hosted_postgres'],
                                    stdout=subprocess.DEVNULL, stderr=log, env=ENV)
            if not MARKER.exists() and (volume.returncode == 0 or PASSWORD.exists()):
                raise ValueError('Existing hosted volume or admin credential found without bootstrap record; inspect before proceeding')
            if MARKER.exists():
                if json.loads(MARKER.read_text()) != {'commit': COMMIT, 'volume': 'dd-hosted_postgres'}:
                    raise ValueError('Unexpected bootstrap record')
                if not PASSWORD.is_file() or PASSWORD.is_symlink():
                    raise ValueError('Recorded bootstrap credential is missing or unsafe')
            run(['docker', 'pull', POSTGRES])
            run(['docker', 'pull', IMAGE])
            revision = run(['docker', 'image', 'inspect', '--format',
                            '{{index .Config.Labels "org.opencontainers.image.revision"}}', IMAGE], capture=True)
            if revision != COMMIT:
                raise ValueError('Published provisioning image revision mismatch')
            postgres_uid = int(run(['docker', 'run', '--rm', '--network', 'none',
                                    '--entrypoint', 'id', POSTGRES, '-u', 'postgres'], capture=True))
            if not MARKER.exists():
                private_file(PASSWORD, secrets.token_hex(32))
                os.chown(PASSWORD, postgres_uid, postgres_uid)
                PASSWORD.chmod(0o400)
                private_file(MARKER, json.dumps({'commit': COMMIT, 'volume': 'dd-hosted_postgres'}))
            # Only the reviewed database resource settings change at this stage.
            source = Path(__file__).resolve().parent / 'compose.production.yaml'
            if source.is_symlink() or source.stat().st_uid != 0:
                raise ValueError('Install the reviewed Compose file beside this root-owned helper')
            shutil.copyfile(source, ROOT / 'compose.production.yaml')
            os.chown(ROOT / 'compose.production.yaml', 0, 0)
            (ROOT / 'compose.production.yaml').chmod(0o644)
            compose = ['docker', 'compose', '-f', str(ROOT / 'compose.production.yaml')]
            run(compose + ['up', '-d', '--no-build', '--wait', '--wait-timeout', '120', 'postgres'])
            container = run(compose + ['ps', '-q', 'postgres'], capture=True)
            # The shared bootstrap initializes empty primary marketing metadata too;
            # no primary service runs and all its scoped logins are disabled below.
            env_file = PRIVATE / 'provision.env'
            if env_file.exists():
                if env_file.is_symlink() or env_file.stat().st_uid != 0:
                    raise ValueError('Unsafe provisioning environment file')
                env_file.unlink()
            private_file(env_file, 'PROVISION_DIRECTORY=/private\nPROVISION_DATABASE_URL='
                         f'postgresql://dd_admin:{PASSWORD.read_text().strip()}@postgres:5432/postgres\n')
            try:
                run(['docker', 'run', '--rm', '--user', '0:0', '--read-only',
                     '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                     '--memory', '256m', '--cpus', '0.5', '--pids-limit', '64',
                     '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
                     '--network', 'dd-hosted_database',
                     '--mount', f'type=bind,src={PRIVATE},dst=/private',
                     '--mount', f'type=bind,src={env_file},dst=/run/secrets/provision,readonly',
                     '--entrypoint', 'node', IMAGE, '--env-file=/run/secrets/provision',
                     '--import', 'tsx', 'server/database/scripts/provision.ts'])
            finally:
                env_file.unlink(missing_ok=True)
            sql = '''
ALTER ROLE booking_marketing_runtime CONNECTION LIMIT 8;
ALTER ROLE booking_web_runtime CONNECTION LIMIT 8;
ALTER ROLE booking_worker_runtime CONNECTION LIMIT 8;
ALTER ROLE pretix_runtime CONNECTION LIMIT 20;
ALTER ROLE dd_backup CONNECTION LIMIT 4;
ALTER ROLE booking_marketing_operator CONNECTION LIMIT 2;
ALTER ROLE booking_management_operator CONNECTION LIMIT 2;
ALTER ROLE booking_marketing_migrator CONNECTION LIMIT 2;
ALTER ROLE booking_management_migrator CONNECTION LIMIT 2;
ALTER ROLE pretix_migrator CONNECTION LIMIT 2;
ALTER ROLE primary_marketing_runtime NOLOGIN;
ALTER ROLE primary_marketing_migrator NOLOGIN;
ALTER ROLE primary_marketing_operator NOLOGIN;
SELECT 'scoped_runtime_flags=' || count(*) FROM pg_roles
 WHERE rolname IN ('booking_marketing_runtime','booking_web_runtime','booking_worker_runtime','pretix_runtime')
 AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls AND NOT rolreplication AND NOT rolinherit;
SELECT 'fresh_databases=' || count(*) FROM pg_database WHERE datname IN ('marketing','booking_management','pretix');
SHOW max_connections;
'''
            report = run(['docker', 'exec', '-i', container, 'psql', '-X', '-v',
                          'ON_ERROR_STOP=1', '-U', 'dd_admin', '-d', 'postgres', '-At'],
                         capture=True, stdin=sql)
            if 'scoped_runtime_flags=4' not in report or 'fresh_databases=3' not in report or report.splitlines()[-1] != '60':
                raise ValueError('Database identity verification failed')
            grants = run(['docker', 'exec', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                          '-U', 'dd_admin', '-d', 'booking_management', '-Atc',
                          "SELECT has_table_privilege('booking_web_runtime','public.manage_sessions','INSERT'),has_table_privilege('booking_worker_runtime','public.delivery_attempts','INSERT'),has_schema_privilege('booking_web_runtime','public','CREATE');"], capture=True)
            if grants != 't|t|f':
                raise ValueError('Management runtime grant verification failed')
            print('PASS: PostgreSQL healthy; 3 fresh databases; 4 restricted runtime roles; max_connections=60.')
            print('Private role registry and URLs saved under /var/lib/dd-hosted/provisioning; values not displayed.')
            print('Only PostgreSQL started. Pretix schema migration and runtime setup remain pending; CI deployment stays disabled.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Never echo SQL, environment files, exception details from the application,
        # or Docker logs that could contain generated credential values.
        if isinstance(error, ValueError):
            print(str(error), file=sys.stderr)
        else:
            print('Database bootstrap failed; inspect /var/lib/dd-hosted/provisioning/bootstrap.log privately.', file=sys.stderr)
        sys.exit(1)
