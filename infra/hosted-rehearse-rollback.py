#!/usr/bin/python3
"""Owner-only image rollback rehearsal between the two recorded releases."""
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys

STATE = Path('/var/lib/dd-hosted')
ROOT = Path('/etc/dd-hosted')
DEPLOY = Path('/usr/local/sbin/dd-deploy')


def manifest(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError('A recorded release is unavailable')
    return json.loads(path.read_text())


def planned_release(expected=None):
    deploy = runpy.run_path(str(DEPLOY))
    if (STATE / 'failed.json').exists():
        raise ValueError('A failed deployment must be investigated first')
    current = manifest(STATE / 'current.json')
    attempt = manifest(STATE / 'attempt.json')
    if attempt.get('status') != 'succeeded' or attempt.get('manifest') != current:
        raise ValueError('Current release record is not a verified success')
    previous = manifest(STATE / 'previous.json')
    if previous.get('commit') == current.get('commit'):
        raise ValueError('Previous release is not distinct')
    if expected and previous.get('commit') != expected:
        raise ValueError('Requested target is not the recorded previous release')
    target = {**previous, 'config_version': deploy['config_version'](ROOT)}
    deploy['validate_manifest'](target)
    if current.get('config_version') != target['config_version']:
        raise ValueError('Installed host configuration differs from current release')
    return current, target


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through owner sudo')
    if sys.argv[1:] == ['plan']:
        current, target = planned_release()
        print('Current revision: ' + current['commit'])
        print('Recorded rollback revision: ' + target['commit'])
        print('Host configuration version: ' + target['config_version'])
        print('Image-only rollback; database and provider configuration stay in place.')
    elif len(sys.argv) == 3 and sys.argv[1] == 'execute':
        _, target = planned_release(sys.argv[2])
        result = subprocess.run([str(DEPLOY)], input=json.dumps(target).encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                timeout=900)
        if result.returncode:
            raise ValueError('Recorded rollback deployment failed; inspect sanitized status')
        print(result.stdout.decode().strip())
    else:
        raise ValueError('Usage: hosted-rehearse-rollback.py plan | execute EXPECTED_PREVIOUS_COMMIT')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Rollback rehearsal stopped; inspect sanitized release state before retry.', file=sys.stderr)
        sys.exit(1)
