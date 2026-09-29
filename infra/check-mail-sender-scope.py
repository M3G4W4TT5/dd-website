#!/usr/bin/env python3
"""Owner-only, bounded Purelymail SMTP sender-scope probe.

No credential, SMTP response text, message content, or recipient is printed.
Every accepted probe goes only to the existing controlled recipient. Do not
run this with a production customer address or with mail-release gates open.
"""

import argparse
import getpass
import smtplib
import ssl
from email.message import EmailMessage


DOMAIN = "didde-mie.com"
RECIPIENT = "dev@memoryone.eu"
HOST = "smtp.purelymail.com"


def sender_policy_rejection(exc):
    response = exc.smtp_error
    if isinstance(response, bytes):
        response = response.decode("utf-8", errors="replace")
    return exc.smtp_code in (501, 530) and "not authorized to send mail as" in str(response).lower()


def invalid_credential_rejection(exc):
    return exc.smtp_code == 535


def cases(identity):
    own = f"{identity}@{DOMAIN}"
    if identity == "booking":
        allowed = [
            ("own", own, own),
            ("tagged-no-reply", f"noreply+booking@{DOMAIN}", f"noreply+booking@{DOMAIN}"),
        ]
        denied = [
            ("unapproved-own-tag", f"booking+scopeprobe@{DOMAIN}", f"booking+scopeprobe@{DOMAIN}"),
            ("base-no-reply", f"noreply@{DOMAIN}", f"noreply@{DOMAIN}"),
            ("unapproved-no-reply-tag", f"noreply+scopeprobe@{DOMAIN}", f"noreply+scopeprobe@{DOMAIN}"),
            ("contact", f"contact@{DOMAIN}", f"contact@{DOMAIN}"),
            ("newsletter", f"newsletter@{DOMAIN}", f"newsletter@{DOMAIN}"),
            ("mixed-envelope", f"contact@{DOMAIN}", own),
            ("mixed-visible", own, f"contact@{DOMAIN}"),
            ("mixed-own-tag-envelope", f"booking+scopeprobe@{DOMAIN}", own),
            ("mixed-own-tag-visible", own, f"booking+scopeprobe@{DOMAIN}"),
            ("external-domain", "scopeprobe@example.net", "scopeprobe@example.net"),
        ]
    else:
        other = "newsletter" if identity == "contact" else "contact"
        denied = [
            ("unapproved-own-tag", f"{identity}+scopeprobe@{DOMAIN}", f"{identity}+scopeprobe@{DOMAIN}"),
            ("other-primary", f"{other}@{DOMAIN}", f"{other}@{DOMAIN}"),
            ("booking", f"booking@{DOMAIN}", f"booking@{DOMAIN}"),
            ("tagged-no-reply", f"noreply+booking@{DOMAIN}", f"noreply+booking@{DOMAIN}"),
            ("mixed-envelope", f"booking@{DOMAIN}", own),
            ("mixed-visible", own, f"booking@{DOMAIN}"),
            ("external-domain", "scopeprobe@example.net", "scopeprobe@example.net"),
        ]
        allowed = [("own", own, own)]
    return [(label, envelope, visible, True) for label, envelope, visible in allowed] + [
        (label, envelope, visible, False) for label, envelope, visible in denied
    ]


def authenticate(username, password):
    with smtplib.SMTP_SSL(HOST, 465, timeout=15, context=ssl.create_default_context()) as smtp:
        smtp.login(username, password)


def probe(username, password, label, envelope, visible):
    message = EmailMessage()
    message["From"] = visible
    message["Reply-To"] = f"{username}"
    message["To"] = RECIPIENT
    message["Subject"] = f"DD sender scope probe: {label}"
    message.set_content("Synthetic sender-scope probe. No customer or booking data.")
    try:
        with smtplib.SMTP_SSL(HOST, 465, timeout=15, context=ssl.create_default_context()) as smtp:
            smtp.login(username, password)
            smtp.sendmail(envelope, [RECIPIENT], message.as_bytes())
        return "accepted", None
    except smtplib.SMTPAuthenticationError:
        return "inconclusive-auth", None
    except smtplib.SMTPResponseException as exc:
        if sender_policy_rejection(exc):
            return "sender-policy-rejected", exc.smtp_code
        return "inconclusive", exc.smtp_code
    except smtplib.SMTPRecipientsRefused:
        return "recipient-refused", None
    except (OSError, smtplib.SMTPException):
        return "inconclusive", None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("identity", choices=("booking", "contact", "newsletter"))
    parser.add_argument("--credential", required=True, choices=("communications", "worker", "pretix", "primary", "marketing", "old-shared"))
    auth = parser.add_mutually_exclusive_group()
    auth.add_argument("--auth-revoked", action="store_true", help="Check only that an old credential can no longer authenticate")
    auth.add_argument("--auth-valid", action="store_true", help="Check only that a current credential still authenticates")
    args = parser.parse_args()
    username = f"{args.identity}@{DOMAIN}"
    password = getpass.getpass("SMTP app password (hidden): ")
    if not password:
        parser.error("Empty password")
    if args.auth_revoked:
        try:
            authenticate(username, password)
        except smtplib.SMTPAuthenticationError as exc:
            if invalid_credential_rejection(exc):
                print(f"PASS {args.credential} authentication rejected ({exc.smtp_code})")
                return 0
            print(f"INCONCLUSIVE {args.credential} authentication probe ({exc.smtp_code})")
            return 2
        except (OSError, smtplib.SMTPException):
            print(f"INCONCLUSIVE {args.credential} authentication probe")
            return 2
        print(f"FAIL {args.credential} still authenticates")
        return 1
    if args.auth_valid:
        try:
            authenticate(username, password)
        except smtplib.SMTPAuthenticationError as exc:
            if invalid_credential_rejection(exc):
                print(f"FAIL {args.credential} authentication rejected ({exc.smtp_code})")
                return 1
            print(f"INCONCLUSIVE {args.credential} authentication probe ({exc.smtp_code})")
            return 2
        except (OSError, smtplib.SMTPException):
            print(f"INCONCLUSIVE {args.credential} authentication probe")
            return 2
        print(f"PASS {args.credential} still authenticates")
        return 0
    try:
        authenticate(username, password)
    except (OSError, smtplib.SMTPException):
        print(f"INCONCLUSIVE {args.credential} authentication failed")
        return 2
    failures = 0
    inconclusive = 0
    for label, envelope, visible, expected in cases(args.identity):
        result, code = probe(username, password, label, envelope, visible)
        passed = result == ("accepted" if expected else "sender-policy-rejected")
        uncertain = result.startswith("inconclusive") or result == "recipient-refused"
        inconclusive += uncertain
        failures += not passed and not uncertain
        status = "PASS" if passed else "INCONCLUSIVE" if uncertain else "FAIL"
        print(f"{status} {args.credential} {label}: {result}" +
              (f" ({code})" if code is not None else ""))
    return 1 if failures else 2 if inconclusive else 0


if __name__ == "__main__":
    raise SystemExit(main())
