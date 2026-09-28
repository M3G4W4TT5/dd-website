#!/usr/bin/python3
"""Read-only owner timer probe of all pinned Pretix Supervisor programs."""
import os
import runpy
import sys


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through owner sudo or the root-owned timer')
    deploy = runpy.run_path('/usr/local/sbin/dd-deploy')
    deploy['check_pretix_supervisor']({'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'})
    print('PASS pinned Pretix Supervisor programs running')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Pretix Supervisor probe failed; inspect locally without sharing logs or secrets.', file=sys.stderr)
        sys.exit(1)
