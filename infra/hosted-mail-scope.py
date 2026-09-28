#!/usr/bin/python3
"""Owner-only Purelymail sender policy check to the approved sandbox recipient."""
from email.utils import formatdate, make_msgid
import os
from pathlib import Path
import re
import smtplib
import ssl
import sys

ROOT = Path('/etc/dd-hosted/secrets')
RECIPIENT = 'dev@memoryone.eu'
USER = 'booking@didde-mie.com'
ALLOWED = ('booking@didde-mie.com', 'noreply+booking@didde-mie.com')
DENIED = ('contact@didde-mie.com', 'newsletter@didde-mie.com',
          'noreply@didde-mie.com', 'outside@example.net')


def values(name):
    path = ROOT / name
    metadata = path.lstat()
    if path.is_symlink() or metadata.st_uid not in (10002, 10003) or metadata.st_mode & 0o077:
        raise ValueError('Unsafe controlled-mail runtime file')
    result = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
    if (result.get('DD_MODE'), result.get('PAYMENT_ENVIRONMENT'),
        result.get('PAYMENT_RELEASE_ENABLED'), result.get('MAIL_DELIVERY'),
        result.get('MAIL_RELEASE_ENABLED'), result.get('MAIL_RECIPIENT_ALLOWLIST'),
        result.get('SMTP_USER'), result.get('SMTP_PORT')) != (
            'production', 'sandbox', 'false', 'controlled', 'false', RECIPIENT, USER, '465'):
        raise ValueError('Sandbox mail gates differ')
    if not re.fullmatch(r'[A-Za-z0-9.-]{4,253}', result.get('SMTP_HOST', '')) or not result.get('SMTP_PASSWORD'):
        raise ValueError('SMTP configuration is incomplete')
    return result


def attempt(smtp, envelope, header):
    body = ('From: <' + header + '>\r\nTo: <' + RECIPIENT + '>\r\n' +
            'Date: ' + formatdate(localtime=False) + '\r\n' +
            'Message-ID: ' + make_msgid(domain='didde-mie.com') + '\r\n' +
            'Subject: Synthetic sender-scope check\r\n\r\n' +
            'No action. Controlled sender policy test.\r\n')
    try:
        code, _ = smtp.mail(envelope)
        if code >= 500:
            return False
        if code != 250:
            raise ValueError('Transient SMTP response during sender check')
        code, _ = smtp.rcpt(RECIPIENT)
        if code >= 500:
            return False
        if code not in (250, 251):
            raise ValueError('Transient SMTP response during recipient check')
        code, _ = smtp.data(body)
        if code >= 500:
            return False
        if code != 250:
            raise ValueError('Transient SMTP response during DATA')
        return True
    finally:
        smtp.rset()


def main():
    if os.geteuid() != 0:
        raise ValueError('Run through owner sudo')
    configs = [values(name) for name in ('booking-communications.env', 'booking-worker.env')]
    if configs[0]['SMTP_HOST'] != configs[1]['SMTP_HOST'] or \
            configs[0]['SMTP_PASSWORD'] == configs[1]['SMTP_PASSWORD']:
        raise ValueError('Distinct booking app passwords are not installed')
    approved, denied = 0, 0
    for config in configs:
        with smtplib.SMTP_SSL(config['SMTP_HOST'], 465, timeout=15,
                              context=ssl.create_default_context()) as smtp:
            smtp.login(USER, config['SMTP_PASSWORD'])
            for address in ALLOWED:
                if not attempt(smtp, address, address):
                    raise ValueError('An approved booking sender was rejected')
                approved += 1
            for address in DENIED:
                if attempt(smtp, address, address):
                    raise ValueError('A cross-identity sender was accepted')
                denied += 1
            if attempt(smtp, USER, 'contact@didde-mie.com'):
                raise ValueError('A forbidden visible From was accepted')
            denied += 1
            if attempt(smtp, 'contact@didde-mie.com', USER):
                raise ValueError('A forbidden envelope From was accepted')
            denied += 1
    print(f'PASS Purelymail booking sender scopes: {approved} approved messages only to {RECIPIENT}; '
          f'{denied} denied sender combinations; two distinct app passwords.')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Sender-scope check failed or is inconclusive; inspect the provider privately. '
              'Any accepted test message went only to the approved sandbox recipient.', file=sys.stderr)
        sys.exit(1)
