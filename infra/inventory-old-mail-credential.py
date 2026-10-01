#!/usr/bin/env python3
"""Privately compare one old app password with hosted secret files.

Run in an owner-controlled root terminal on the VPS. This is a bounded file
inventory, not evidence about other machines, external clients, or delivery.
The password is prompted without echo and neither it nor a hash is printed.
"""

import argparse
import getpass
import os
from pathlib import Path
import stat


ROOT = Path("/etc/dd-hosted/secrets")
MAX_BYTES = 4 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("label", choices=("controlled-mail", "contact-form"))
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run in the owner-controlled VPS terminal through sudo")
    password = getpass.getpass(f"{args.label} app password (hidden): ")
    if not password or "\n" in password or "\r" in password:
        parser.error("Invalid password input")
    needle = password.encode("utf-8")
    inspected = 0
    skipped = 0
    matches = []
    with os.scandir(ROOT) as entries:
        for entry in entries:
            metadata = entry.stat(follow_symlinks=False)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_size > MAX_BYTES:
                skipped += 1
                continue
            inspected += 1
            with open(entry.path, "rb") as handle:
                if needle in handle.read(MAX_BYTES + 1):
                    matches.append(entry.name)
    for name in sorted(matches):
        print(f"MATCH {args.label}: {name}")
    print(f"RESULT {args.label}: {len(matches)} matching files; {inspected} inspected; {skipped} skipped")
    print("LIMIT: compare other hosts, mail clients, scheduled jobs and saved local credentials separately")


if __name__ == "__main__":
    main()
