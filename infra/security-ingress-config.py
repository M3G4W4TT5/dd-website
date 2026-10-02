#!/usr/bin/python3
"""Prepare private ingress configuration for owner review; never installs/restarts anything."""
import os
from pathlib import Path
import re
import secrets
import sys


def render(existing: str, key: str):
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        raise ValueError('Invalid ingress credential')
    lines = existing.splitlines()
    if any(line.startswith('BOOKING_INGRESS_KEY=') for line in lines):
        raise ValueError('Ingress credential already exists; inspect instead of rotating')
    return existing.rstrip() + '\nBOOKING_INGRESS_KEY=' + key + '\n', \
        'proxy_set_header X-DD-Booking-Ingress-Key "' + key + '";\n'


def main():
    if len(sys.argv) != 3:
        raise ValueError('Usage: security-ingress-config.py PRIVATE_WEB_ENV NEW_PRIVATE_STAGING_DIRECTORY')
    src, dest = map(Path, sys.argv[1:])
    st = src.lstat()
    if src.is_symlink() or not src.is_file() or st.st_mode & 0o077:
        raise ValueError('Private regular web configuration required')
    dest.mkdir(mode=0o700)  # refuses existing directory, never overwrites
    web, header = render(src.read_text(), secrets.token_hex(32))
    for name, body in [('booking-web.env', web), ('booking-ingress-header.conf', header)]:
        fd = os.open(dest / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w') as f:
            f.write(body)
    print('Private review files prepared; install only at an owner-approved rollout checkpoint')


if __name__ == '__main__':
    main()
