"""Check that the owner package can only install the reviewed host-file bytes."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hosted_release', HERE / 'apply-hosted-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class OwnerPackageTests(unittest.TestCase):
    def test_reviewed_target_is_the_complete_local_host_configuration(self):
        self.assertEqual(set(release.TARGET), set(release.FILES))
        for name in release.FILES:
            self.assertEqual(release.sha(HERE / name), release.TARGET[name], name)

    def test_private_file_checks_reject_open_permissions_and_symlinks(self):
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            path = parent / 'runtime.env'
            path.write_text('SYNTHETIC=true\n')
            path.chmod(0o600)
            release.trusted(path, path.stat().st_uid, private=True)
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                release.trusted(path, path.stat().st_uid, private=True)
            link = parent / 'link.env'
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                release.trusted(link, path.stat().st_uid)

    def test_command_failure_keeps_only_safe_operation_and_exit_category(self):
        failure = subprocess.CalledProcessError(7, ['docker', 'compose'], stderr='private token')
        with patch.object(release.subprocess, 'run', side_effect=failure):
            with self.assertRaisesRegex(RuntimeError, '^command_exit_7$'):
                release.safe_run(['docker', 'compose', 'up', '--no-deps', 'booking'])
        self.assertEqual(release.ACTIVE['operation'], 'compose_up')
        self.assertEqual(release.ACTIVE['diagnostic'], 'unspecified')


class UpgradePathTests(unittest.TestCase):
    """Execute the real owner install/activation code against an isolated host tree."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.root, self.state, self.source = (base / name for name in ('host', 'state', 'package'))
        for directory in (self.root, self.state, self.source, self.root / 'secrets', self.state / 'provisioning'):
            directory.mkdir(exist_ok=True)
        for name in release.FILES:
            body = (HERE / name).read_bytes()
            (self.source / name).write_bytes(body)
            (self.root / name).write_bytes(body)
        (self.root / 'ready').write_text('ready')
        self.old = 'a' * 64
        registry = {'webhook_password': self.old, 'write': 'b' * 64}
        (self.state / 'provisioning' / 'runtime-private.json').write_text(json.dumps(registry))
        self.web = {'PRETIX_MANAGE_WEBHOOK_USER': 'dd-booking',
                    'PRETIX_MANAGE_WEBHOOK_PASSWORD': self.old, 'PREVIEW': 'true',
                    'DD_MODE': 'production', 'PAYMENT_ENVIRONMENT': 'sandbox',
                    'PAYMENT_RELEASE_ENABLED': 'false', 'MAIL_DELIVERY': 'capture',
                    'MAIL_RELEASE_ENABLED': 'false'}
        for name, values in [('booking-web.env', self.web),
                             ('booking-communications.env', dict(self.web)),
                             ('booking-worker.env', dict(self.web))]:
            (self.root / 'secrets' / name).write_text(''.join(k + '=' + v + '\n' for k, v in values.items()))
        header = self.root / 'secrets' / 'pretix-webhook-header.conf'
        header.write_bytes(release.webhook_header(self.old))
        header.chmod(0o444)
        self.manifest = {'commit': 'c' * 40,
                         'images': {key: 'ghcr.io/m3g4w4tt5/dd-website-' + key + '@sha256:' + 'e' * 64
                                    for key in release.APP_SERVICES}}
        self.running = {'revisions': {'booking': 'c' * 40, 'communications': 'c' * 40,
                                      'worker': 'f' * 40}, 'images': self.manifest['images'],
                        'ids': {key: 'sha256:' + '1' * 64 for key in release.APP_SERVICES}}
        self.commands = []
        self.fail_service = None

    def fake_run(self, args, **kwargs):
        self.commands.append(args)
        if self.fail_service and args[-1] == self.fail_service and 'up' in args:
            raise RuntimeError('command_exit_1')
        return '' if kwargs.get('capture') else None

    def context(self):
        import runpy
        real = runpy.run_path(HERE / 'deploy.py')
        deploy = {'config_version': real['config_version'],
                  'validate_manifest': real['validate_manifest'],
                  'check_readiness': lambda *_: None}
        patches = [
            patch.object(release, 'ROOT', self.root), patch.object(release, 'STATE', self.state),
            patch.object(release, 'PRIVATE', self.state / 'provisioning'),
            patch.object(release, 'installed', side_effect=lambda name: self.root / name),
            patch.object(release, 'trusted', return_value=None),
            patch.object(release, 'verify_bridge', return_value=None),
            patch.object(release, 'running_application', return_value=self.running),
            patch.object(release, 'current', return_value=self.manifest),
            patch.object(release, 'safe_run', side_effect=self.fake_run),
            patch.object(release, 'verify_runtime_mount', return_value=None),
            patch.object(release, 'verify_mounts', return_value=None),
            patch.object(release, 'verify_webhook_proxy', return_value=None),
            patch.object(release.os, 'chown', return_value=None),
            patch.object(release.runpy, 'run_path', return_value=deploy),
        ]
        class Scope:
            def __enter__(self_inner):
                for item in patches:
                    item.__enter__()
            def __exit__(self_inner, *exc):
                for item in reversed(patches):
                    item.__exit__(*exc)
        return Scope()

    def test_stale_manifest_install_preserves_images_and_rotates_private_header(self):
        with self.context():
            release.install(self.source)
        report = json.loads((self.state / 'config-install.json').read_text())
        self.assertEqual(report['status'], 'installed')
        self.assertTrue(report['release_record_stale'])
        self.assertEqual(report['running_revisions'], self.running['revisions'])
        recreations = [cmd for cmd in self.commands if 'up' in cmd]
        self.assertEqual([cmd[-1] for cmd in recreations], ['pretix-cron', 'booking', 'proxy'])
        self.assertTrue(all('--no-deps' in cmd and '--force-recreate' in cmd and '--pull' in cmd
                            and cmd[cmd.index('--pull') + 1] == 'never' for cmd in recreations))
        header = self.root / 'secrets' / 'pretix-webhook-header.conf'
        self.assertEqual(header.stat().st_mode & 0o777, 0o440)
        registry = json.loads((self.state / 'provisioning' / 'runtime-private.json').read_text())
        self.assertNotEqual(registry['webhook_password'], self.old)
        self.assertNotIn('webhook_password_next', registry)
        self.assertEqual(release.webhook_header(registry['webhook_password']), header.read_bytes())

    def test_interrupted_recreation_reports_phase_and_reuses_pending_rotation(self):
        with self.context():
            self.fail_service = 'proxy'
            with patch.object(release.os, 'geteuid', return_value=0), \
                 patch.object(release.sys, 'argv', ['apply-hosted-release.py', 'install']):
                self.assertEqual(release.run_owner_action(), 1)
            failed = json.loads((self.state / 'config-install.json').read_text())
            self.assertEqual((failed['phase'], failed['status'], failed['category']),
                             ('proxy_recreation', 'failed', 'command_exit_1'))
            pending = json.loads((self.state / 'provisioning' / 'runtime-private.json').read_text())['webhook_password_next']
            self.fail_service = None
            release.install(self.source)
        finished = json.loads((self.state / 'provisioning' / 'runtime-private.json').read_text())
        self.assertEqual(finished['webhook_password'], pending)
        self.assertEqual(json.loads((self.state / 'config-install.json').read_text())['status'], 'installed')

    def test_sandbox_and_mail_activation_recreate_only_affected_services(self):
        with self.context():
            release.install(self.source)
            args, env = release.compose(self.manifest)
            with patch.object(release, 'verify_release', return_value=(self.manifest, args, env)), \
                 patch.object(release, 'verify_pretix_activation', return_value=None), \
                 patch.object(release.getpass, 'getpass', return_value='whsec_' + 'x' * 32):
                release.activate_sandbox(self.manifest['commit'])
            self.assertEqual(json.loads((self.state / 'sandbox-gates.json').read_text())['status'], 'configured')
            updated = release.gates('booking-web.env')[1]
            self.assertEqual(updated['PRETIX_MANAGE_WRITE_API_TOKEN'], 'b' * 64)
            self.assertEqual(updated['STRIPE_WEBHOOK_SIGNING_SECRET'], 'whsec_' + 'x' * 32)
            self.assertEqual(updated['BOOKING_SELF_SERVICE_ENABLED'], 'true')
            self.assertEqual(updated['PAYMENT_RELEASE_ENABLED'], 'false')
            with patch.object(release, 'verify_release', return_value=(self.manifest, args, env)), \
                 patch('builtins.input', return_value='smtp.example.test'), \
                 patch.object(release.getpass, 'getpass', return_value='synthetic-password-123'), \
                 patch.object(release, 'verify_pretix_activation', return_value=None):
                release.controlled_mail(self.manifest['commit'])
            with patch.object(release, 'verify_release', return_value=(self.manifest, args, env)), \
                 patch('builtins.input', side_effect=AssertionError('must reuse existing SMTP credential')):
                release.controlled_mail(self.manifest['commit'])
        self.assertEqual(json.loads((self.state / 'mail-gates.json').read_text())['status'], 'configured_pending_delivery')
        for name in ('booking-communications.env', 'booking-worker.env'):
            values = dict(line.split('=', 1) for line in (self.root / 'secrets' / name).read_text().splitlines())
            self.assertEqual(values['MAIL_RECIPIENT_ALLOWLIST'], 'dev@memoryone.eu')
            self.assertEqual(values['MAIL_DELIVERY'], 'controlled')
            self.assertEqual(values['MAIL_RELEASE_ENABLED'], 'false')
        self.assertNotIn('SMTP_PASSWORD', (self.root / 'secrets' / 'booking-web.env').read_text())
        recreations = [cmd for cmd in self.commands if 'up' in cmd]
        self.assertTrue(all('--no-deps' in cmd and '--force-recreate' in cmd for cmd in recreations))

    def test_known_mixed_revision_availability_503_is_recorded_as_pending(self):
        import runpy
        actual = runpy.run_path(HERE / 'deploy.py')
        error = urllib.error.HTTPError('http://127.0.0.1:8080/api/availability', 503,
                                       'unavailable', {}, None)
        deploy = {'config_version': actual['config_version'],
                  'check_readiness': lambda *_: (_ for _ in ()).throw(error),
                  'endpoint': lambda _host, path: b'{"ok":true}' if path == '/api/health' else b'OK'}
        with self.context(), patch.object(release.runpy, 'run_path', return_value=deploy), \
             patch.object(release.urllib.request, 'urlopen', side_effect=error):
            release.install(self.source)
        status = json.loads((self.state / 'config-install.json').read_text())
        self.assertEqual(status['status'], 'installed_pending_release')
        self.assertEqual(status['category'], 'availability_503_stale_images')
        self.assertEqual(json.loads((self.state / 'webhook-rotation.json').read_text())['status'], 'complete')


if __name__ == '__main__':
    unittest.main()
