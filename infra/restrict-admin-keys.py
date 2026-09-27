#!/usr/bin/python3
"""Owner-run source-IP restriction for existing administrator SSH keys."""
import ipaddress
import os
from pathlib import Path
import pwd
import re
import sys

if os.geteuid() != 0 or len(sys.argv) != 2:
    sys.exit("Usage: sudo python3 restrict-admin-keys.py YOUR_PUBLIC_IPV4")
address = str(ipaddress.IPv4Address(sys.argv[1]))
accounts = ["dd-owner", "dd-setup", "administrator"]
key_pattern = re.compile(r"^(.*?)(ssh-ed25519|ssh-rsa|ecdsa-sha2-\S+|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)\s+([A-Za-z0-9+/=]+)(.*)$")
changes = []
for account in accounts:
    path = Path(pwd.getpwnam(account).pw_dir) / ".ssh/authorized_keys"
    if not path.exists():
        print(account + ": no authorized_keys file; no key access added")
        continue
    if path.is_symlink():
        sys.exit("Refusing a symlink; review " + str(path))
    original = path.read_text()
    lines = []
    for line in original.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            lines.append(line)
            continue
        match = key_pattern.fullmatch(line.strip())
        if not match:
            sys.exit("Unrecognized key format; review " + str(path))
        options, keytype, blob, comment = match.groups()
        options = options.strip()
        if "from=" in options:
            sys.exit("Existing source restriction; review manually before changing " + str(path))
        new_options = 'from="' + address + '"' + ("," + options if options else "")
        lines.append(new_options + " " + keytype + " " + blob + comment)
    updated = "\n".join(lines) + ("\n" if lines else "")
    if updated != original:
        backup = path.with_name("authorized_keys.before-ci")
        if backup.exists():
            sys.exit("Backup already exists; review rather than overwriting " + str(backup))
        changes.append((account, path, original, updated, backup))
# Validate all accounts before touching any file. Preserve original permissions.
for account, path, original, updated, backup in changes:
    descriptor = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as output:
        output.write(original)
    path.write_text(updated)
    print(account + ": keys restricted to " + address + "; private backup saved")
print("CI key unchanged. Keep this owner session open and test fresh owner/setup logins.")
