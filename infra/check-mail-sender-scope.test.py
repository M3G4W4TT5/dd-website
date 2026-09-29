#!/usr/bin/env python3
"""Offline regressions for the owner-only sender-scope probe."""

import contextlib
import importlib.util
import io
from pathlib import Path
import smtplib
import sys
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "check_mail_sender_scope", Path(__file__).with_name("check-mail-sender-scope.py")
)
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class FakeSMTP:
    def __init__(self, failure=None):
        self.failure = failure
        self.sent = []

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def login(self, *_):
        pass

    def sendmail(self, envelope, recipients, message):
        if self.failure:
            raise self.failure
        self.sent.append((envelope, recipients, message))


class SenderScopeTests(unittest.TestCase):
    def test_temporary_and_unrelated_rejections_are_inconclusive(self):
        errors = (
            smtplib.SMTPResponseException(451, b"temporary local problem"),
            smtplib.SMTPResponseException(454, b"temporary authentication failure"),
            smtplib.SMTPResponseException(451, b"temporarily not authorized to send mail as contact@didde-mie.com"),
            smtplib.SMTPResponseException(530, b"authentication required"),
            smtplib.SMTPResponseException(550, b"recipient unavailable"),
        )
        for error in errors:
            with self.subTest(code=error.smtp_code):
                with patch.object(scope.smtplib, "SMTP_SSL", return_value=FakeSMTP(error)):
                    self.assertEqual(
                        scope.probe("booking@didde-mie.com", "fixture", "denied", "contact@didde-mie.com", "contact@didde-mie.com"),
                        ("inconclusive", error.smtp_code),
                    )

    def test_explicit_sender_policy_rejection(self):
        for code in (501, 530):
            with self.subTest(code=code):
                error = smtplib.SMTPResponseException(
                    code, b"5.7.1 You (booking@didde-mie.com) are not authorized to send mail as contact@didde-mie.com"
                )
                with patch.object(scope.smtplib, "SMTP_SSL", return_value=FakeSMTP(error)):
                    self.assertEqual(
                        scope.probe("booking@didde-mie.com", "fixture", "denied", "contact@didde-mie.com", "contact@didde-mie.com"),
                        ("sender-policy-rejected", code),
                    )

    def test_accepted_probe_uses_fixed_recipient_and_booking_reply_to(self):
        smtp = FakeSMTP()
        with patch.object(scope.smtplib, "SMTP_SSL", return_value=smtp):
            self.assertEqual(
                scope.probe("booking@didde-mie.com", "fixture", "tagged", "noreply+booking@didde-mie.com", "noreply+booking@didde-mie.com"),
                ("accepted", None),
            )
        self.assertEqual(smtp.sent[0][1], [scope.RECIPIENT])
        self.assertIn(b"Reply-To: booking@didde-mie.com", smtp.sent[0][2])

    def run_main(self, extra, auth_error=None, case_result=None):
        argv = ["probe", "booking", "--credential", "old-shared" if "--auth-revoked" in extra else "communications", *extra]
        output = io.StringIO()
        with patch.object(sys, "argv", argv), patch.object(scope.getpass, "getpass", return_value="fixture"), contextlib.redirect_stdout(output):
            with patch.object(scope, "authenticate", side_effect=auth_error):
                if case_result is None:
                    result = scope.main()
                else:
                    with patch.object(scope, "cases", return_value=[("denied", "contact@didde-mie.com", "contact@didde-mie.com", False)]), patch.object(scope, "probe", return_value=case_result):
                        result = scope.main()
        return result, output.getvalue()

    def test_revocation_requires_invalid_credential_535(self):
        result, output = self.run_main(["--auth-revoked"], smtplib.SMTPAuthenticationError(535, b"credentials invalid"))
        self.assertEqual(result, 0)
        self.assertIn("PASS old-shared authentication rejected (535)", output)
        for code in (451, 454, 530):
            with self.subTest(code=code):
                result, output = self.run_main(["--auth-revoked"], smtplib.SMTPAuthenticationError(code, b"temporary or other error"))
                self.assertEqual(result, 2)
                self.assertIn("INCONCLUSIVE", output)
        result, output = self.run_main(["--auth-revoked"])
        self.assertEqual(result, 1)
        self.assertIn("FAIL old-shared still authenticates", output)

    def test_current_auth_temporary_failure_is_inconclusive(self):
        result, output = self.run_main(["--auth-valid"], smtplib.SMTPAuthenticationError(454, b"temporary authentication failure"))
        self.assertEqual(result, 2)
        self.assertIn("INCONCLUSIVE", output)

    def test_initial_auth_temporary_failure_is_inconclusive(self):
        result, output = self.run_main([], smtplib.SMTPAuthenticationError(454, b"temporary authentication failure"))
        self.assertEqual(result, 2)
        self.assertIn("INCONCLUSIVE", output)

    def test_scope_matrix_requires_explicit_rejection(self):
        for case_result, expected_code, expected_text in (
            (("sender-policy-rejected", 530), 0, "PASS"),
            (("inconclusive", 451), 2, "INCONCLUSIVE"),
            (("inconclusive", 454), 2, "INCONCLUSIVE"),
            (("accepted", None), 1, "FAIL"),
        ):
            with self.subTest(result=case_result):
                code, output = self.run_main([], case_result=case_result)
                self.assertEqual(code, expected_code)
                self.assertIn(expected_text, output)


if __name__ == "__main__":
    unittest.main()
