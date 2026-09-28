#!/usr/bin/python3
"""Root-owned SSH deployment entrypoint; never execute a caller's shell command.

The SSH key has command="sudo -n /usr/local/sbin/dd-deploy",restrict.
Only a small JSON manifest is accepted on stdin. Host configuration, secrets,
readiness and schema provisioning remain owner-controlled outside the checkout.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import urllib.request

ROOT = Path("/etc/dd-hosted")
STATE = Path("/var/lib/dd-hosted")
PREFIX = "ghcr.io/m3g4w4tt5/dd-website-"
TARGETS = {"booking": "DD_BOOKING_IMAGE", "communications": "DD_COMMUNICATIONS_IMAGE", "worker": "DD_WORKER_IMAGE"}
SERVICES = ["postgres", "redis", "mail-capture", "pretix", "pretix-cron", "booking", "booking-communications", "booking-worker", "proxy"]
FILES = ("compose.production.yaml", "compose.hosted.yaml", "proxy.conf",
         "pretix-nginx.conf", "pretix-settings.py", "pretix-task.conf", "deploy.py")


def config_version(root):
    digest = hashlib.sha256()
    for name in FILES:
        digest.update(name.encode() + b"\0")
        digest.update((root / name).read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_manifest(data):
    if not isinstance(data, dict) or set(data) != {"commit", "images", "config_version"}:
        raise ValueError("Expected commit, images and config version only")
    commit = data["commit"]
    if not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Invalid commit")
    images = data["images"]
    if not isinstance(images, dict) or set(images) != set(TARGETS):
        raise ValueError("Expected exactly three booking images")
    for target, image in images.items():
        if not isinstance(image, str) or not re.fullmatch(re.escape(PREFIX + target) + r"@sha256:[0-9a-f]{64}", image):
            raise ValueError("Image must be a digest in the approved registry repository")
    if not isinstance(data["config_version"], str) or not re.fullmatch(r"[0-9a-f]{64}", data["config_version"]):
        raise ValueError("Invalid host configuration version")
    return data


def run(command, env, capture=False):
    return subprocess.run(command, env=env, check=True, text=True,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL)


def atomic_json(path, data):
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
        os.fchmod(output.fileno(), 0o600)
        json.dump(data, output, sort_keys=True)
        output.write("\n")
        temporary = output.name
    os.replace(temporary, path)


def endpoint(host, path):
    request = urllib.request.Request("http://127.0.0.1:8080" + path, headers={"Host": host})
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise ValueError("Unexpected readiness status")
        body = response.read(512 * 1024 + 1)
        if len(body) > 512 * 1024:
            raise ValueError("Readiness response exceeded bound")
        return body


def check_readiness(compose, env):
    for service in SERVICES:
        cid = run(compose + ["ps", "-q", service], env, True).stdout.strip()
        if not cid:
            raise ValueError("Service unavailable: " + service)
        status = run(["/usr/bin/docker", "inspect", "--format",
                      "{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}", cid], env, True).stdout.strip()
        if not status.startswith("running") or "unhealthy" in status or "starting" in status:
            raise ValueError("Service not ready: " + service)
    endpoint("booking.didde-mie.com", "/")
    health = json.loads(endpoint("booking.didde-mie.com", "/api/health"))
    if health.get("ok") is not True:
        raise ValueError("Booking health failed")
    availability = json.loads(endpoint("booking.didde-mie.com", "/api/availability"))
    if availability.get("source") != "pretix" or len(availability.get("slots", [])) != 14:
        raise ValueError("Pretix-backed availability failed")
    endpoint("checkout.didde-mie.com", "/")


def running_images(compose, env):
    images = {}
    for target, service in (("booking", "booking"), ("communications", "booking-communications"), ("worker", "booking-worker")):
        try:
            cid = run(compose + ["ps", "-q", service], env, True).stdout.strip()
            images[target] = run(["/usr/bin/docker", "inspect", "--format", "{{.Image}}", cid], env, True).stdout.strip() if cid else None
        except subprocess.CalledProcessError:
            images[target] = None
    return images


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
    for name in [*FILES, "ready"]:
        path = ROOT / name
        stat = path.lstat()
        if path.is_symlink() or stat.st_uid != 0 or stat.st_mode & 0o022:
            raise ValueError("Deployment configuration must be root-owned and not writable by others")
    if config_version(ROOT) != manifest["config_version"]:
        raise ValueError("Host configuration version differs from release")
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "HOME": "/root",
           "DD_SECRET_DIRECTORY": "/etc/dd-hosted/secrets"}
    env.update({TARGETS[key]: value for key, value in manifest["images"].items()})
    compose = ["/usr/bin/docker", "compose", "--project-directory", str(ROOT),
               "-f", str(ROOT / "compose.production.yaml"), "-f", str(ROOT / "compose.hosted.yaml")]
    with (STATE / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        phase = "configuration"
        atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "running"})
        try:
            run(compose + ["config", "--quiet"], env)
            phase = "images"
            atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "running"})
            for image in manifest["images"].values():
                run(["/usr/bin/docker", "pull", image], env)
                revision = run(["/usr/bin/docker", "image", "inspect", "--format",
                                '{{ index .Config.Labels "org.opencontainers.image.revision" }}', image], env, True).stdout.strip()
                if revision != manifest["commit"]:
                    raise ValueError("Image revision mismatch")
            phase = "replacement"
            atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "running"})
            # Migrations and rollback remain separately reviewed owner operations.
            run(compose + ["up", "-d", "--no-build", "--pull", "missing", "--wait",
                           "--wait-timeout", "240"] + SERVICES, env)
            phase = "proxy"
            atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "running"})
            run(compose + ["restart", "proxy"], env)
            phase = "readiness"
            atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "running"})
            check_readiness(compose, env)
        except (ValueError, OSError, subprocess.CalledProcessError) as error:
            category = "check" if isinstance(error, ValueError) else "command"
            atomic_json(STATE / "failed.json", {"manifest": manifest, "phase": phase,
                          "category": category, "running_image_ids": running_images(compose, env)})
            atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": phase, "status": "failed"})
            raise ValueError("Deployment " + phase + " failed (" + category + "); inspect private failed.json") from None
        current = STATE / "current.json"
        if current.exists() and json.loads(current.read_text()) != manifest:
            atomic_json(STATE / "previous.json", json.loads(current.read_text()))
        atomic_json(current, manifest)
        (STATE / "failed.json").unlink(missing_ok=True)
        atomic_json(STATE / "attempt.json", {"manifest": manifest, "phase": "complete", "status": "succeeded"})
        print("Deployed commit " + manifest["commit"] + " config " + manifest["config_version"])


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # No runtime environment values, captures or container logs in CI output.
        print("Deployment failed: " + (str(error) if isinstance(error, ValueError) else "operational check failed"), file=sys.stderr)
        sys.exit(1)
