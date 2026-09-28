#!/usr/bin/python3
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('hosted_mail_scope',
                                              Path(__file__).with_name('hosted-mail-scope.py'))
scope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scope)


class SyntheticSMTP:
    def __init__(self):
        self.envelope = None
        self.recipient = None
        self.messages = []

    def mail(self, address):
        self.envelope = address
        return (250, b'ok')

    def rcpt(self, address):
        self.recipient = address
        return (250, b'ok')

    def data(self, body):
        self.messages.append((self.envelope, self.recipient, body))
        if self.envelope not in scope.ALLOWED or (
                'From: <' + self.envelope + '>') not in body:
            return (550, b'not permitted')
        return (250, b'ok')

    def rset(self):
        self.envelope = None
        self.recipient = None


class ScopeTests(unittest.TestCase):
    def test_approved_and_cross_identity_attempts_use_only_approved_recipient(self):
        smtp = SyntheticSMTP()
        self.assertTrue(scope.attempt(smtp, scope.ALLOWED[0], scope.ALLOWED[0]))
        self.assertFalse(scope.attempt(smtp, 'contact@didde-mie.com', 'contact@didde-mie.com'))
        self.assertFalse(scope.attempt(smtp, scope.ALLOWED[0], 'contact@didde-mie.com'))
        self.assertEqual({recipient for _, recipient, _ in smtp.messages}, {scope.RECIPIENT})
        self.assertEqual(len(smtp.messages), 3)

if __name__ == '__main__':
    unittest.main()
