#!/usr/bin/env python3
"""Owner-only controlled native event SMTP activation; never sends or resends mail.

Default is inspection. --apply requires approved installed adapter and release
identities, verifies Purelymail authentication without DATA, and changes only a
new private [ttd-mail] section. Recreate Pretix web/cron separately afterward.
"""
import argparse
import configparser
import getpass
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import smtplib
import ssl
import stat
import tempfile

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
BACKUPS = Path('/root/dd-ttd-native-mail-backups')


def inspect(expected_commit, expected_adapter):
    if os.geteuid() != 0:
        raise RuntimeError('Run through owner sudo')
    current = json.loads((STATE / 'current.json').read_text())
    if current.get('commit') != expected_commit:
        raise RuntimeError('Current release changed; reconcile before activation')
    if hashlib.sha256((ROOT / 'pretix-settings.py').read_bytes()).hexdigest() != expected_adapter:
        raise RuntimeError('Reviewed native mail adapter is not installed')
    path = ROOT / 'secrets/pretix-runtime.cfg'
    metadata = path.lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise RuntimeError('Unsafe Pretix runtime file')
    cfg = configparser.ConfigParser(interpolation=None)
    original = path.read_text()
    cfg.read_string(original)
    if cfg.get('mail','host') != 'mail-capture' or cfg.get('mail','port') != '1025':
        raise RuntimeError('Global native capture route changed')
    if cfg.has_section('ttd-mail'):
        raise RuntimeError('Native mail section already exists; inspect rather than overwrite')
    return path, metadata, cfg, original


def activate(path, metadata, cfg, original, password):
    if len(password) < 12 or any(c in password for c in '\r\n'):
        raise RuntimeError('Invalid app credential')
    # Authenticate and check envelope acceptance. No DATA => no message is sent.
    with smtplib.SMTP_SSL('smtp.purelymail.com',465,timeout=15,context=ssl.create_default_context()) as smtp:
        smtp.login('booking@didde-mie.com',password)
        if smtp.mail('noreply+booking@didde-mie.com')[0] != 250:
            raise RuntimeError('Approved envelope sender rejected')
        if smtp.rcpt('dev@memoryone.eu')[0] not in (250,251):
            raise RuntimeError('Approved test recipient rejected')
        smtp.rset()
    cfg['ttd-mail'] = dict(delivery='controlled', release_enabled='false',
                           host='smtp.purelymail.com',port='465',user='booking@didde-mie.com',
                           password=password,recipient_allowlist='dev@memoryone.eu')
    stream=io.StringIO(); cfg.write(stream)
    if path.read_text() != original:
        raise RuntimeError('Pretix runtime changed during activation')
    backup_directory=BACKUPS
    backup_directory.mkdir(mode=0o700,exist_ok=True)
    if backup_directory.is_symlink() or backup_directory.stat().st_uid != 0 or backup_directory.stat().st_mode & 0o077:
        raise RuntimeError('Unsafe backup directory')
    backup=backup_directory / ('pretix-runtime-'+secrets.token_hex(8)+'.cfg')
    with open(backup,'x',opener=lambda p,f:os.open(p,f,0o600)) as out:out.write(original)
    fd,temp=tempfile.mkstemp(prefix='.ttd-mail-',dir=path.parent)
    try:
        with os.fdopen(fd,'w') as out:
            out.write(stream.getvalue()); out.flush(); os.fsync(out.fileno())
            os.fchown(out.fileno(),metadata.st_uid,metadata.st_gid)
            os.fchmod(out.fileno(),stat.S_IMODE(metadata.st_mode))
        os.replace(temp,path)
    finally:
        if os.path.exists(temp):os.unlink(temp)
    print(json.dumps({'configured':'controlled','recipient':'dev@memoryone.eu','release_enabled':False,
                      'backup':str(backup),'process_activation':'pending Pretix web/cron recreation','mail_sent':False}))


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--expected-commit',required=True)
    parser.add_argument('--expected-adapter',required=True)
    parser.add_argument('--apply',action='store_true')
    args=parser.parse_args()
    path,metadata,cfg,original=inspect(args.expected_commit,args.expected_adapter)
    if not args.apply:
        print('PASS reviewed adapter/release and global capture; inspection only')
        return
    password=getpass.getpass('Dedicated Pretix Purelymail app password for booking@didde-mie.com (hidden): ')
    activate(path,metadata,cfg,original,password)


if __name__=='__main__':
    try:main()
    except Exception as error:
        # SMTP exception bodies can contain private addresses/provider details.
        print('FAILED native mail activation: '+type(error).__name__+'; no secrets printed')
        raise SystemExit(1)
