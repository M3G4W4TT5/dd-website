#!/usr/bin/env python3
"""Run pinned outer-page regression in a disposable no-network container."""
import argparse
import os
import subprocess
import tempfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sudo', action='store_true', help='Use existing passwordless local Docker sudo access')
parser.add_argument('--output', type=Path, help='Optional directory for synthetic rendered HTML/CSP specimens')
parser.add_argument('--script', choices=['page', 'mail'], default='page')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
docker = ['sudo', '-n', 'docker'] if args.sudo else ['docker']
with tempfile.TemporaryDirectory(prefix='ttd-outer-fixture-') as directory:
    fixture = Path(directory)
    fixture.chmod(0o755)
    config = fixture / 'pretix.cfg'
    config.write_text('[pretix]\ninstance_name=TTD isolated fixture\nurl=http://localhost\ncurrency=DKK\n[database]\nbackend=sqlite3\n[mail]\nbackend=console\n[celery]\nbackend=cache+memory://\nbroker=memory://\n')
    command = docker + ['run', '--rm', '--network', 'none', '--read-only',
        '--user', f'{os.getuid()}:{os.getgid()}',
        '--tmpfs', '/tmp:rw,size=512m', '--tmpfs', '/data:rw,size=64m',
        '-e', 'DATA_DIR=/tmp/ttd-verification', '-e', 'PRETIX_CONFIG_FILE=/fixture/pretix.cfg',
        '-e', 'PYTHONUNBUFFERED=1', '-v', f'{fixture}:/fixture:ro',
        '-v', f'{root}:/review:ro', '-v', f'{root / "infra/pretix-settings.py"}:/pretix/src/production_settings.py:ro']
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
        command += ['-v', f'{args.output.resolve()}:/out']
    command += ['--entrypoint', 'python', 'pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02', '/review/infra/verify-ttd-full-page.py' if args.script == 'page' else '/review/infra/verify-ttd-mail-delivery.py']
    subprocess.run(command, check=True)
