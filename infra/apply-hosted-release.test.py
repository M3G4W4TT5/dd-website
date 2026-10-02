"""Check that the owner package can only install the reviewed host-file bytes."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import MagicMock, patch
import urllib.error

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('hosted_release', HERE / 'apply-hosted-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class OwnerPackageTests(unittest.TestCase):
    def test_only_the_reviewed_ingress_gateway_is_trusted_for_client_ip(self):
        for gateway, accepted in [('172.20.0.1', True), ('172.20.0.2', False),
                                  ('172.19.0.1', False)]:
            response = json.dumps([{'IPAM': {'Config': [{'Subnet': '172.20.0.0/16',
                                                         'Gateway': gateway}]}}])
            with self.subTest(gateway=gateway), patch.object(release, 'safe_run', return_value=response):
                if accepted:
                    release.verify_bridge()
                else:
                    with self.assertRaisesRegex(ValueError, 'client-IP trust peer'):
                        release.verify_bridge()

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
                  'check_readiness': lambda *_: None, 'preserve_primary': real['preserve_primary']}
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

    def test_verified_pre_ttd_adapter_upgrade_preserves_application_images(self):
        fixture = HERE / 'tests' / 'fixtures' / 'pretix-pre-ttd-settings.py'
        self.assertEqual(release.sha(fixture), release.PRE_TTD_TARGET['pretix-settings.py'])
        (self.root / 'pretix-settings.py').write_bytes(fixture.read_bytes())
        with self.context():
            release.install(self.source)
        self.assertEqual(release.sha(self.root / 'pretix-settings.py'), release.TARGET['pretix-settings.py'])
        report = json.loads((self.state / 'config-install.json').read_text())
        self.assertEqual(report['status'], 'installed')
        self.assertEqual(report['running_revisions'], self.running['revisions'])
        self.assertTrue(any(cmd[-2:] == ['pretix', 'pretix-cron'] for cmd in self.commands))

    def test_pre_ttd_adapter_drift_stops_before_host_mutation(self):
        fixture = HERE / 'tests' / 'fixtures' / 'pretix-pre-ttd-settings.py'
        (self.root / 'pretix-settings.py').write_bytes(fixture.read_bytes() + b'\n# unreviewed drift\n')
        before = {p.name: p.read_bytes() for p in self.root.iterdir() if p.is_file()}
        with self.context(), self.assertRaisesRegex(ValueError, 'Installed configuration version differs: pretix-settings.py'):
            release.install(self.source)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir() if p.is_file()})
        self.assertEqual(self.commands, [])

    def test_reviewed_rendering_adapter_upgrade_preserves_running_images(self):
        destination = self.root / 'pretix-settings.py'
        old = b'synthetic reviewed installed adapter'
        destination.write_bytes(old)
        original_sha = release.sha

        def inspected_sha(path):
            if path == destination and path.read_bytes() == old:
                return release.PRE_RENDER_TARGET['pretix-settings.py']
            return original_sha(path)

        with self.context(), patch.object(release, 'sha', side_effect=inspected_sha):
            release.install(self.source)
        self.assertEqual(original_sha(destination), release.TARGET['pretix-settings.py'])
        report = json.loads((self.state / 'config-install.json').read_text())
        self.assertEqual(report['status'], 'installed')
        self.assertEqual(report['running_revisions'], self.running['revisions'])

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

    def test_mail_rotation_uses_distinct_authenticated_process_credentials(self):
        for name in ('booking-communications.env', 'booking-worker.env'):
            path = self.root / 'secrets' / name
            values = dict(line.split('=', 1) for line in path.read_text().splitlines())
            values.update({'PREVIEW': 'false', 'MAIL_DELIVERY': 'controlled',
                           'MAIL_RECIPIENT_ALLOWLIST': 'dev@memoryone.eu',
                           'SMTP_HOST': 'smtp.example.test', 'SMTP_PORT': '465',
                           'SMTP_USER': 'booking@didde-mie.com', 'SMTP_PASSWORD': 'old-password-123'})
            path.write_text(''.join(key + '=' + value + '\n' for key, value in values.items()))
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with self.context(), patch.object(release, 'verify_release', return_value=(self.manifest, [], {})), \
             patch.object(release.getpass, 'getpass', side_effect=['new-communications-123', 'new-worker-456']), \
             patch.object(release.smtplib, 'SMTP_SSL', return_value=smtp):
            release.rotate_mail_credentials(self.manifest['commit'])
        self.assertEqual(smtp.login.call_count, 2)
        # A failed recreation may leave the new files in place. Retrying the
        # same verified credentials must remain possible without minting more.
        with self.context(), patch.object(release, 'verify_release', return_value=(self.manifest, [], {})), \
             patch.object(release.getpass, 'getpass', side_effect=['new-communications-123', 'new-worker-456']), \
             patch.object(release.smtplib, 'SMTP_SSL', return_value=smtp):
            release.rotate_mail_credentials(self.manifest['commit'])
        self.assertEqual(smtp.login.call_count, 4)
        passwords = []
        for name in ('booking-communications.env', 'booking-worker.env'):
            values = dict(line.split('=', 1) for line in (self.root / 'secrets' / name).read_text().splitlines())
            passwords.append(values['SMTP_PASSWORD'])
            self.assertEqual(values['MAIL_RECIPIENT_ALLOWLIST'], 'dev@memoryone.eu')
            self.assertEqual(values['MAIL_RELEASE_ENABLED'], 'false')
        self.assertEqual(passwords, ['new-communications-123', 'new-worker-456'])
        self.assertEqual(json.loads((self.state / 'mail-gates.json').read_text())['status'],
                         'configured_pending_sender_scope_check')

    def test_known_mixed_revision_availability_503_is_recorded_as_pending(self):
        import runpy
        actual = runpy.run_path(HERE / 'deploy.py')
        error = urllib.error.HTTPError('http://127.0.0.1:8080/api/availability', 503,
                                       'unavailable', {}, None)
        deploy = {'config_version': actual['config_version'],
                  'check_readiness': lambda *_: (_ for _ in ()).throw(error),
                  'preserve_primary': actual['preserve_primary'],
                  'endpoint': lambda _host, path: b'{"ok":true}' if path == '/api/health' else b'OK'}
        with self.context(), patch.object(release.runpy, 'run_path', return_value=deploy), \
             patch.object(release.urllib.request, 'urlopen', side_effect=error):
            release.install(self.source)
        status = json.loads((self.state / 'config-install.json').read_text())
        self.assertEqual(status['status'], 'installed_pending_release')
        self.assertEqual(status['category'], 'availability_503_stale_images')
        self.assertEqual(json.loads((self.state / 'webhook-rotation.json').read_text())['status'], 'complete')

    def test_native_mail_recreates_only_pretix_and_preserves_manifest_images(self):
        self.running['revisions'] = {key:self.manifest['commit'] for key in release.APP_SERVICES}
        original_images = dict(self.manifest['images'])
        with self.context(): release.native_mail_adapter(self.source, allow_proxy_reload=True)
        recreated = [c for c in self.commands if 'up' in c]
        self.assertEqual(len(recreated),1)
        self.assertEqual(recreated[0][-2:],['pretix','pretix-cron'])
        self.assertIn('--no-deps',recreated[0]); self.assertIn('never',recreated[0])
        proxy_checks=[c for c in self.commands if 'nginx' in c]
        self.assertEqual(proxy_checks,[['docker','exec','dd-hosted-proxy-1','nginx','-t'],['docker','exec','dd-hosted-proxy-1','nginx','-s','reload']])
        self.assertFalse(any('proxy' == c[-1] or 'booking' == c[-1] for c in self.commands))
        result=json.loads((self.state/'current.json').read_text())
        self.assertEqual(result['images'],original_images)
        self.assertEqual(result['commit'],'c'*40)
        self.assertEqual(result['config_version'],release.runpy.run_path(HERE/'deploy.py')['config_version'](self.root))
    def test_native_mail_stops_before_mutation_on_running_release_drift(self):
        with self.context(),self.assertRaisesRegex(ValueError,'identity differ'):
            release.native_mail_adapter(self.source, allow_proxy_reload=True)
        self.assertEqual(self.commands,[])

    def test_native_mail_recreation_needs_explicit_shared_reload_approval(self):
        with self.context(),self.assertRaisesRegex(ValueError,'approved graceful proxy reload'):
            release.native_mail_adapter(self.source)
        self.assertEqual(self.commands,[])
    def test_native_mail_finalization_does_not_recreate_or_reload(self):
        self.running['revisions']={key:self.manifest['commit'] for key in release.APP_SERVICES}
        with self.context(): release.native_mail_adapter(self.source,install_adapter=False,recreate=False)
        self.assertFalse(any('up' in c or 'reload' in c for c in self.commands))
        status=json.loads((self.state/'native-mail-adapter.json').read_text())
        self.assertEqual(status['status'],'verified')


if __name__ == '__main__':
    unittest.main()
