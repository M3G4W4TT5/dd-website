#!/usr/bin/python3
"""Owner-only hosted backup and disposable database restore verification.

The existing scoped backup.py and restore.py perform the transfer. This wrapper
loads their private credentials without displaying them and checks restored
table content and sequence state. It never starts outgoing integrations.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

HOST = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
HERE = Path(__file__).resolve().parent
TOOLS = HERE.parent / 'server/database/scripts' if (HERE.parent / 'server/database/scripts/backup.py').is_file() else HERE
DATABASES = ('marketing', 'booking_management', 'pretix')
RETENTION_DAYS = 14
BUNDLE_NAME = re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{6}\Z')

FINGERPRINT = """
CREATE TEMP TABLE dd_fingerprint(kind text, relation text, value text);
DO $dd$
DECLARE item record; rows_count bigint; content_hash text; last_value bigint; called boolean;
BEGIN
 FOR item IN SELECT n.nspname AS schema_name, c.relname AS relation_name
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
     AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' ORDER BY 1,2 LOOP
  EXECUTE format('SELECT count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), '''')) FROM %I.%I t',
                 item.schema_name, item.relation_name) INTO rows_count, content_hash;
  INSERT INTO dd_fingerprint VALUES ('table', item.schema_name||'.'||item.relation_name,
                                     rows_count::text||':'||content_hash);
 END LOOP;
 FOR item IN SELECT n.nspname AS schema_name, c.relname AS relation_name
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema') ORDER BY 1,2 LOOP
  EXECUTE format('SELECT last_value,is_called FROM %I.%I',
                 item.schema_name, item.relation_name) INTO last_value, called;
  INSERT INTO dd_fingerprint VALUES ('sequence', item.schema_name||'.'||item.relation_name,
                                     last_value::text||':'||called::text);
 END LOOP;
END $dd$;
SELECT json_build_object(
 'tables',(SELECT count(*) FROM dd_fingerprint WHERE kind='table'),
 'sequences',(SELECT count(*) FROM dd_fingerprint WHERE kind='sequence'),
 'relations',(SELECT json_agg(json_build_array(kind,relation,value) ORDER BY kind,relation)
              FROM dd_fingerprint));
"""


def db_env():
    registry = STATE / 'provisioning/provisioning-private.json'
    admin_file = HOST / 'secrets/postgres-admin-password'
    for path in (registry, admin_file, TOOLS / 'backup.py', TOOLS / 'restore.py', TOOLS / 'pgtool.py'):
        if not path.is_file() or path.is_symlink():
            raise ValueError('Required private credential or reviewed script is unavailable')
    backup_password = json.loads(registry.read_text())['passwords']['dd_backup']
    admin_password = admin_file.read_text().strip()
    if not re.fullmatch('[a-f0-9]{64}', backup_password) or not re.fullmatch('[a-f0-9]{64}', admin_password):
        raise ValueError('Hosted database credential format differs from provisioning')
    return {**os.environ, 'PGTOOL_DOCKER_CONTAINER': 'dd-hosted-postgres-1',
            'BACKUP_REPOSITORY_ROOT': str(HERE),
            'BACKUP_DATABASE_URL': f'postgresql://dd_backup:{backup_password}@127.0.0.1:5432/postgres',
            'RESTORE_DATABASE_URL': f'postgresql://dd_admin:{admin_password}@127.0.0.1:5432/postgres',
            'RESTORE_INTEGRATIONS': 'disabled'}


def tool(script, *args, env):
    result = subprocess.run([sys.executable, str(TOOLS / script), *map(str, args)],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            timeout=900)
    if result.returncode:
        raise RuntimeError(script + ' failed; inspect privately without printing database contents')


def query(db, statement, env):
    sys.path.insert(0, str(TOOLS))
    from pgtool import client
    with client(env['RESTORE_DATABASE_URL'], env['PGTOOL_DOCKER_CONTAINER']) as run:
        return run('psql', ['--dbname', db, '-XqAt', '-v', 'ON_ERROR_STOP=1'], statement.encode())


def fingerprint(db, env):
    payload = json.loads(query(db, FINGERPRINT, env).decode().strip().splitlines()[-1])
    canonical = json.dumps(payload['relations'] or [], separators=(',', ':')).encode()
    return payload['tables'], payload['sequences'], hashlib.sha256(canonical).hexdigest()


def table_snapshot(raw):
    payload = json.loads(raw.strip().splitlines()[-1])
    relations = [entry for entry in payload['relations'] or [] if entry[0] == 'table']
    canonical = json.dumps(relations, separators=(',', ':')).encode()
    return payload['tables'], payload['sequences'], hashlib.sha256(canonical).hexdigest()


def source_snapshot(snapshot_query):
    """Fingerprint the exported snapshot using only the backup role's SELECT grants."""
    relations = json.loads(snapshot_query("""
SELECT coalesce(json_agg(json_build_array(n.nspname,c.relname)
                         ORDER BY n.nspname,c.relname),'[]'::json)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema')
  AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%';
"""))
    sequences = int(snapshot_query("""
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relkind='S' AND n.nspname NOT IN ('pg_catalog','information_schema');
"""))
    entries = []
    for schema, name in relations:
        quoted = '.'.join('"' + part.replace('"', '""') + '"' for part in (schema, name))
        count, content_hash = json.loads(snapshot_query(
            "SELECT json_build_array(count(*),md5(coalesce(" +
            "string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),''))) " +
            "FROM " + quoted + " t;"))
        entries.append(['table', schema + '.' + name, str(count) + ':' + content_hash])
    canonical = json.dumps(entries, separators=(',', ':')).encode()
    return len(entries), sequences, hashlib.sha256(canonical).hexdigest()


def verify_database(db, directory, env):
    """Compare the restored tables with the same MVCC snapshot used by pg_dump.

    Sequence values are nontransactional in PostgreSQL. Restoring the archive
    verifies its saved sequence state; live sequence values can change during
    the dump and are deliberately not compared to that state.
    """
    sys.path.insert(0, str(TOOLS))
    from pgtool import client
    with client(env['BACKUP_DATABASE_URL'], env['PGTOOL_DOCKER_CONTAINER']) as pg:
        with pg.snapshot(db) as (snapshot_id, snapshot_query):
            source = source_snapshot(snapshot_query)
            tool('backup.py', db, directory, env={**env, 'BACKUP_SNAPSHOT_ID': snapshot_id})
    restore_name = 'dd_restore_' + db + '_' + secrets.token_hex(4)
    try:
        tool('restore.py', directory, restore_name, env=env)
        restored = query(restore_name, FINGERPRINT, env).decode()
        if source != table_snapshot(restored):
            raise RuntimeError('Isolated restore differs from the exported backup snapshot')
        return source[:2]
    finally:
        query('postgres', 'DROP DATABASE IF EXISTS ' + restore_name + ' WITH (FORCE);', env)


def record_success(root, bundle, now):
    body = json.dumps({'completed_at': now.isoformat(), 'bundle': bundle.name,
                       'databases': list(DATABASES), 'isolated_restore': True}, sort_keys=True)
    with tempfile.NamedTemporaryFile(mode='w', dir=root, delete=False) as output:
        os.fchmod(output.fileno(), 0o600)
        output.write(body + '\n')
        temporary = Path(output.name)
    temporary.replace(root / 'latest.json')


def prune_old_bundles(root, current, now):
    """Keep recent complete root-owned bundles, including at least two copies."""
    bundles = []
    for candidate in root.iterdir():
        if not BUNDLE_NAME.fullmatch(candidate.name):
            continue
        stat = candidate.lstat()
        if candidate.is_symlink() or not candidate.is_dir() or stat.st_uid != os.geteuid() or stat.st_mode & 0o077:
            raise ValueError('Unsafe backup bundle; retention stopped')
        if not all((candidate / db / 'manifest.json').is_file() and
                   not (candidate / db / 'manifest.json').is_symlink() for db in DATABASES):
            continue
        bundles.append(candidate)
    bundles.sort(key=lambda item: item.name, reverse=True)
    if current not in bundles:
        raise ValueError('Current backup bundle is incomplete')
    cutoff = now - timedelta(days=RETENTION_DAYS)
    for candidate in bundles[2:]:
        timestamp = datetime.strptime(candidate.name[:16], '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
        if timestamp < cutoff:
            shutil.rmtree(candidate)


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through owner sudo')
    if sys.argv[1:] not in ([], ['--nightly']):
        raise ValueError('Usage: hosted-backup-check.py [--nightly]')
    env = db_env()
    root = STATE / 'step10-backups'
    if root.is_symlink() or (root.exists() and root.stat().st_uid != 0):
        raise ValueError('Unsafe private backup directory')
    root.mkdir(mode=0o700, exist_ok=True)
    root.chmod(0o700)
    now = datetime.now(timezone.utc)
    bundle = root / (now.strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3))
    bundle.mkdir(mode=0o700)
    results = []
    for db in DATABASES:
        tables, sequences = verify_database(db, bundle / db, env)
        results.append((db, tables, sequences))
    if sys.argv[1:] == ['--nightly']:
        prune_old_bundles(root, bundle, now)
        record_success(root, bundle, now)
    print('PASS private scoped backup and isolated restore: ' +
          ', '.join(f'{db} ({tables} tables, {sequences} sequences)' for db, tables, sequences in results))
    print('Private backup directory: ' + str(bundle))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Hosted backup/restore check stopped; inspect privately. No application database was restored into.',
              file=sys.stderr)
        sys.exit(1)
