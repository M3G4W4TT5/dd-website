#!/usr/bin/env python3
"""Disposable pinned-Pretix regression; never connects to the existing stack.

Requires Docker Compose access; uses the existing passwordless Docker sudo rule.
Creates a random Compose project with no published ports or shared volumes.
All credentials and data are synthetic; cleanup runs even if an assertion fails.
"""
import os
from pathlib import Path
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parent
COMPOSE = '''services:
  postgres:
    image: postgres:17.6-alpine
    environment:
      POSTGRES_DB: pretix
      POSTGRES_USER: pretix
      POSTGRES_PASSWORD: synthetic-only-password
    healthcheck:
      test: [CMD-SHELL, "pg_isready -U pretix -d pretix"]
      interval: 2s
      timeout: 2s
      retries: 30
  redis:
    image: redis:7.4.5-alpine
  pretix:
    image: pretix/standalone:2026.7.0
    environment:
      PRETIX_PRETIX_URL: http://pretix
      PRETIX_PRETIX_CURRENCY: DKK
      PRETIX_PRETIX_DATADIR: /data
      PRETIX_DATABASE_BACKEND: postgresql
      PRETIX_DATABASE_NAME: pretix
      PRETIX_DATABASE_USER: pretix
      PRETIX_DATABASE_PASSWORD: synthetic-only-password
      PRETIX_DATABASE_HOST: postgres
      PRETIX_REDIS_LOCATION: redis://redis:6379/0
      PRETIX_CELERY_BROKER: redis://redis:6379/1
      PRETIX_CELERY_BACKEND: redis://redis:6379/2
      AUTOMIGRATE: skip
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
'''


def main():
    project = 'dd-rental-check-' + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix='dd-rental-pretix-') as directory:
        compose = Path(directory) / 'compose.yaml'
        compose.write_text(COMPOSE)
        docker = ['docker'] if os.geteuid() == 0 else ['sudo', '-n', 'docker']
        command = docker + ['compose', '-p', project, '-f', str(compose)]
        def run(args, **kwargs):
            return subprocess.run(command + args, check=True, timeout=300, **kwargs)
        try:
            run(['up', '-d', '--wait', 'postgres', 'redis'], stdout=subprocess.DEVNULL)
            run(['run', '-T', '--rm', '--no-deps', '--entrypoint', 'python3', 'pretix',
                 '-m', 'pretix', 'migrate', '--noinput'], stdout=subprocess.DEVNULL)
            source = (ROOT / 'tests' / 'rental_pretix_probe.py').read_text()
            run(['run', '-T', '--rm', '--no-deps', '--entrypoint', 'python3', 'pretix',
                 '-m', 'pretix', 'shell', '-v', '0', '-c',
                 'exec(__import__("sys").stdin.read())'], input=source, text=True)
        finally:
            subprocess.run(command + ['down', '--volumes', '--remove-orphans'],
                           check=True, timeout=180, stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    main()
