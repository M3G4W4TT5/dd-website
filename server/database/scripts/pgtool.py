"""Run scoped PostgreSQL clients without putting credentials in process arguments."""
import os
import re
import secrets
import select
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import unquote, urlparse


def pgpass(value):
    return value.replace('\\', '\\\\').replace(':', '\\:')


class PgClient:
    def __init__(self, prefix, connection, env=None):
        self.prefix = prefix
        self.connection = connection
        self.env = env

    def args(self, tool, args):
        return [*self.prefix, tool, *self.connection, *args]

    def __call__(self, tool, args, stdin=None):
        result = subprocess.run(self.args(tool, args), input=stdin, env=self.env,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('Scoped PostgreSQL operation failed (raw output withheld)')
        return result.stdout

    @contextmanager
    def snapshot(self, database):
        """Keep one exported MVCC snapshot open for a fingerprint and pg_dump."""
        process = subprocess.Popen(
            self.args('psql', ['--dbname', database, '-XqAt', '-v', 'ON_ERROR_STOP=1']),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            env=self.env, text=True, bufsize=1)

        def send(statement):
            if process.poll() is not None:
                raise RuntimeError('PostgreSQL snapshot connection closed')
            process.stdin.write(statement + '\n')
            process.stdin.flush()

        def read():
            if not select.select([process.stdout], [], [], 60)[0]:
                raise RuntimeError('PostgreSQL snapshot response timed out')
            line = process.stdout.readline()
            if not line:
                raise RuntimeError('PostgreSQL snapshot connection closed')
            return line.strip()

        try:
            send('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
            send('SELECT pg_export_snapshot();')
            snapshot_id = read()
            if not re.fullmatch(r'[A-Fa-f0-9-]{5,100}', snapshot_id):
                raise RuntimeError('Invalid exported PostgreSQL snapshot identity')

            def query(statement):
                send(statement)
                return read()

            yield snapshot_id, query
        finally:
            if process.poll() is None:
                try:
                    send('ROLLBACK;')
                    process.stdin.close()
                    process.wait(timeout=10)
                except (BrokenPipeError, OSError, subprocess.TimeoutExpired):
                    process.kill()
                    process.wait()


@contextmanager
def client(url, docker_container=None):
    parsed = urlparse(url)
    user = unquote(parsed.username or '')
    container = docker_container or os.environ.get('PGTOOL_DOCKER_CONTAINER')
    # An explicit container identifies the database, not just a fallback tool.
    docker = bool(container) or shutil.which('pg_dump') is None
    if docker:
        if container and container != 'dd-hosted-postgres-1' and not re.fullmatch(r'dd-step10-test-[a-f0-9]{12}', container):
            raise ValueError('Unrecognized PostgreSQL container')
        base = ([*(['sudo', '-n'] if os.geteuid() != 0 else []), 'docker', 'exec', '-i', container]
                if container else ['docker', 'compose', 'exec', '-T', 'postgres'])
        path = '/tmp/dd-operator-' + secrets.token_hex(12)
        data = f'127.0.0.1:5432:*:{pgpass(user)}:{pgpass(unquote(parsed.password or ""))}\n'
        subprocess.run(base + ['sh', '-c', f'umask 077; cat > {path}'], input=data.encode(),
                       check=True, stdout=subprocess.DEVNULL)
        try:
            yield PgClient(base + ['env', 'PGPASSFILE=' + path],
                           ['--host', '127.0.0.1', '--port', '5432', '--username', user])
        finally:
            subprocess.run(base + ['rm', '-f', path], check=True, stdout=subprocess.DEVNULL)
    else:
        with tempfile.TemporaryDirectory() as temporary:
            passfile = Path(temporary) / 'pgpass'
            passfile.write_text(f'{parsed.hostname}:{parsed.port or 5432}:*:{pgpass(user)}:{pgpass(unquote(parsed.password or ""))}\n')
            passfile.chmod(0o600)
            yield PgClient([], ['--host', parsed.hostname, '--port', str(parsed.port or 5432),
                                '--username', user], {**os.environ, 'PGPASSFILE': str(passfile)})
