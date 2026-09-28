#!/usr/bin/python3
"""Synthetic backup and isolated restore against a disposable PostgreSQL 17.6."""
import importlib.util
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone

HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent / 'server/database/scripts'
spec = importlib.util.spec_from_file_location('hosted_backup', HERE / 'hosted-backup-check.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def run(*args, input=None, env=None, check=True):
    launch = ('sudo', '-n', *args) if args[0] == 'docker' and os.geteuid() != 0 else args
    result = subprocess.run(launch, input=input, text=True, capture_output=True, env=env, timeout=120)
    if check and result.returncode:
        raise RuntimeError('Disposable PostgreSQL check failed: ' + args[0])
    return result


def main():
    container = 'dd-step10-test-' + secrets.token_hex(6)
    fixture = 'dd_backup_fixture_' + secrets.token_hex(4)
    restored = 'dd_restore_fixture_' + secrets.token_hex(4)
    with tempfile.TemporaryDirectory(prefix='dd-step10-') as temporary:
        run('docker', 'run', '-d', '--rm', '--name', container, '--network', 'none',
            '--tmpfs', '/var/lib/postgresql/data:rw,size=128m',
            '-e', 'POSTGRES_USER=dd_admin', '-e', 'POSTGRES_PASSWORD=synthetic-admin',
            '-e', 'POSTGRES_DB=postgres', 'postgres:17.6-alpine')
        try:
            for _ in range(80):
                if run('docker', 'exec', container, 'pg_isready', '-U', 'dd_admin',
                       check=False).returncode == 0:
                    break
                time.sleep(0.25)
            else:
                raise RuntimeError('Disposable PostgreSQL did not start')

            def sql(db, statement):
                return run('docker', 'exec', '-i', container, 'psql', '-U', 'dd_admin',
                           '-d', db, '-XqAt', '-v', 'ON_ERROR_STOP=1', input=statement).stdout

            sql('postgres', "CREATE ROLE dd_backup LOGIN PASSWORD 'synthetic-backup';")
            sql('postgres', 'CREATE DATABASE ' + fixture + ';')
            sql(fixture, """
REVOKE CONNECT ON DATABASE %s FROM PUBLIC;
GRANT CONNECT ON DATABASE %s TO dd_backup;
CREATE TABLE proof(id serial PRIMARY KEY, value text NOT NULL);
INSERT INTO proof(value) VALUES ('alpha'), ('beta');
CREATE SEQUENCE untouched START 37 INCREMENT 5;
SELECT setval('proof_id_seq',81,true);
GRANT USAGE ON SCHEMA public TO dd_backup;
GRANT SELECT ON proof TO dd_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO dd_backup;
""" % (fixture, fixture))
            env = {**os.environ, 'PGTOOL_DOCKER_CONTAINER': container,
                   'BACKUP_DATABASE_URL': 'postgresql://dd_backup:synthetic-backup@127.0.0.1:5432/postgres',
                   'BACKUP_FIXTURE_MODE': 'true',
                   'RESTORE_DATABASE_URL': 'postgresql://dd_admin:synthetic-admin@127.0.0.1:5432/postgres',
                   'RESTORE_INTEGRATIONS': 'disabled'}
            archive = Path(temporary) / 'private-backup'
            run('python3', str(TOOLS / 'backup.py'), fixture, str(archive), env=env)
            run('python3', str(TOOLS / 'restore.py'), str(archive), restored, env=env)
            source = backup.fingerprint(fixture, env)
            target = backup.fingerprint(restored, env)
            assert source == target and source[:2] == (1, 2)
            assert sql(restored, "SELECT nextval('proof_id_seq'); SELECT nextval('untouched');") == '82\n37\n'
            print('PASS disposable scoped backup, isolated restore, content and called/uncalled sequences')
        finally:
            run('docker', 'rm', '-f', container, check=False)

    with tempfile.TemporaryDirectory(prefix='dd-step10-retention-') as temporary:
        root = Path(temporary)
        now = datetime.now(timezone.utc).replace(microsecond=0)

        def complete(days):
            bundle = root / ((now - timedelta(days=days)).strftime('%Y%m%dT%H%M%SZ') + '-abcdef')
            bundle.mkdir(mode=0o700)
            for db in backup.DATABASES:
                (bundle / db).mkdir()
                (bundle / db / 'manifest.json').write_text('{}')
            return bundle

        newest, recent, old, older = (complete(days) for days in (0, 1, 15, 20))
        incomplete = root / ((now - timedelta(days=30)).strftime('%Y%m%dT%H%M%SZ') + '-123abc')
        incomplete.mkdir(mode=0o700)
        backup.prune_old_bundles(root, newest, now)
        assert newest.exists() and recent.exists() and incomplete.exists()
        assert not old.exists() and not older.exists()
        backup.record_success(root, newest, now)
        assert (root / 'latest.json').stat().st_mode & 0o777 == 0o600
        assert __import__('json').loads((root / 'latest.json').read_text())['isolated_restore'] is True
        print('PASS bounded nightly retention and private success marker')


if __name__ == '__main__':
    main()
