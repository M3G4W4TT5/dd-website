#!/usr/bin/python3
"""Root-owned SSH deployment entrypoint; never execute a caller's shell command.

The SSH key has command="sudo -n /usr/local/sbin/dd-deploy",restrict.
Only a small JSON manifest is accepted on stdin. Host configuration, secrets,
readiness and schema provisioning remain owner-controlled outside the checkout.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path("/etc/dd-hosted")
STATE = Path("/var/lib/dd-hosted")
PREFIX = "ghcr.io/m3g4w4tt5/dd-website-"
TARGETS = {"booking": "DD_BOOKING_IMAGE", "communications": "DD_COMMUNICATIONS_IMAGE", "worker": "DD_WORKER_IMAGE"}
SERVICES = ["postgres", "redis", "pretix", "pretix-cron", "booking", "booking-communications", "booking-worker", "proxy"]


def validate_manifest(data):
    if not isinstance(data, dict) or set(data) != {"commit", "images"}:
        raise ValueError("Expected commit and images only")
    commit = data["commit"]
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid commit")
    images = data["images"]
    if not isinstance(images, dict) or set(images) != set(TARGETS):
        raise ValueError("Expected exactly three booking images")
    for target, image in images.items():
        if not isinstance(image, str) or not re.fullmatch(re.escape(PREFIX + target) + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Image must be a digest in the approved registry repository")
    return data


def run(command, env, capture=False):
    return subprocess.run(command, env=env, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None)


def main():
    if os.geteuid() != 0:
        raise ValueError("Owner-installed deployment command requires root")
    # SSH stdin has a transport/job timeout; bound the entire manifest here.
    body = sys.stdin.buffer.read(4097)
    if len(body) > 4096:
        raise ValueError("Manifest exceeds 4096 bytes")
    manifest = validate_manifest(json.loads(body))
    # Prevent accidentally exposing an unprovisioned stack. This marker is made
    # by the owner only after private ingress, databases and secrets are ready.
    if not (ROOT / "ready").is_file():
        raise ValueError("Hosted prerequisites are incomplete: owner readiness marker is absent")
    for name in ["compose.production.yaml", "compose.hosted.yaml", "proxy.conf", "ready"]:
        path = ROOT / name
        stat = path.lstat()
        if path.is_symlink() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError("Deployment configuration must be root-owned and not writable by others")
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root",
           "DD_SECRET_DIRECTORY": "/etc/dd-hosted/secrets"}
    env.update({TARGETS[key]: value for key, value in manifest["images"].items()})
    compose = ["/usr/bin/docker", "compose", "--project-directory", str(ROOT),
               "-f", str(ROOT / "compose.production.yaml"), "-f", str(ROOT / "compose.hosted.yaml")]
    with (STATE / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Validate without printing any rendered configuration or secret values.
        run(compose + ["config", "--quiet"], env)
        for image in manifest["images"].values():
            run(["/usr/bin/docker", "pull", image], env)
            revision = run(["/usr/bin/docker", "image", "inspect", "--format",
                            '{{ index .Config.Labels "org.opencontainers.image.revision" }}', image], env, True).stdout.strip()
            if revision != manifest["commit"]:
                raise ValueError("Image revision does not match the release commit")
        # Database/schema migrations are separately reviewed owner jobs for now.
        # Do not automatically roll back databases or recreate shared volumes.
        run(compose + ["up", "-d", "--no-build", "--pull", "missing", "--wait",
                       "--wait-timeout", "240"] + SERVICES, env)
        # Compose checks application health; also check both local proxy vhosts.
        for host in ["studio.didde-mie.com", "ttd-checkout.didde-mie.com"]:
            run(["/usr/bin/curl", "--fail", "--silent", "--output", "/dev/null",
                 "--max-time", "15", "--header", "Host: " + host,
                 "http://127.0.0.1:8080/"], env)
        current = STATE / "current.json"
        if current.exists() and json.loads(current.read_text()) != manifest:
            (STATE / "previous.json").write_bytes(current.read_bytes())
        with tempfile.NamedTemporaryFile(mode="w", dir=STATE, delete=False) as output:
            json.dump(manifest, output)
            temporary = output.name
        os.replace(temporary, current)
        print("Deployed commit " + manifest["commit"])


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # No runtime environment values, captures or container logs in CI output.
        print("Deployment failed: " + str(error), file=sys.stderr)
        sys.exit(1)
