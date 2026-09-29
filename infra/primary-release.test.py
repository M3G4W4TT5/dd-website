"""Exercise release isolation and failure/rollback records without a Docker daemon."""
import importlib.util
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('primary', Path(__file__).with_name('primary-release.py'))
primary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(primary)
IMAGE = primary.PREFIX + 'a' * 64
REVISION = 'b' * 40
BOOKING = {'commit': 'c' * 40, 'images': {'booking': 'unchanged-booking', 'communications': 'unchanged-communications', 'worker': 'unchanged-worker'}}
IDENTITIES = {'booking': {'id': 'stable'}, 'booking-communications': {'id': 'stable'}, 'booking-worker': {'id': 'stable'}}

class ReleaseTests(unittest.TestCase):
    def test_cross_schema_reads_require_specific_permission_denied_sqlstate(self):
        denied=subprocess.CompletedProcess([],1,'','ERROR:  42501\n')
        with patch.object(primary,'psql',return_value='f\n0\n1'),patch.object(primary,'psql_result',return_value=denied):
            primary.check_isolation()
        for result in (subprocess.CompletedProcess([],0,'1',''),subprocess.CompletedProcess([],1,'','ERROR:  42809\n')):
            with patch.object(primary,'psql',return_value='f\n0\n1'),patch.object(primary,'psql_result',return_value=result):
                with self.assertRaisesRegex(ValueError,'Negative'):primary.check_isolation()

    def test_database_inspection_uses_bootstrap_uid_and_keeps_password_out_of_argv(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory); (root/'secrets').mkdir()
            secret='a'*64; (root/'secrets/postgres-admin-password').write_text(secret)
            def run(args, env=None, input=None):
                self.assertNotIn(secret, ' '.join(args))
                return '70' if args[-3:]==['id','-u','postgres'] else ''
            with patch.object(primary,'ROOT',root), patch.object(primary,'trusted') as trusted, patch.object(primary,'run',side_effect=run), patch.object(primary.subprocess,'run') as command:
                primary.psql_result('SELECT 1;')
            trusted.assert_called_once_with(root/'secrets/postgres-admin-password',70)
            args=command.call_args.args[0]
            self.assertNotIn(secret,' '.join(args))
            self.assertIn('VERBOSITY=sqlstate',args)

    def test_immutable_approved_image_required(self):
        for image, revision in [(IMAGE.replace('@sha256:', ':latest-'), REVISION), (IMAGE.replace('ghcr.io', 'evil.test'), REVISION), (IMAGE, 'main')]:
            with self.assertRaises(ValueError): primary.configuration(image, revision)

    def test_release_only_recreates_primary_and_proxy_and_preserves_booking_pins(self):
        self.exercise_release(False)

    def test_failed_readiness_does_not_record_success_and_preserves_rollback_files(self):
        self.exercise_release(True)

    def exercise_release(self, fail):
        with tempfile.TemporaryDirectory() as directory:
            root, state, source = [Path(directory)/x for x in ('host','state','source')]
            for folder in (root, state, source): folder.mkdir()
            for name in primary.PRIMARY_FILES:
                (root/name).write_text('prior ' + name)
                (source/name).write_text('reviewed ' + name)
            prior = primary.configuration(primary.PREFIX+'d'*64, 'e'*40, root)
            (root/'primary-image.json').write_text(json.dumps(prior))
            commands = []
            def run(args, env=None, input=None):
                commands.append((args, env))
                if args[1:3] == ['image','inspect']: return REVISION
                if args[1] == 'inspect': return json.dumps([{'State': {'Health': {'Status': 'healthy'}}, 'Config': {'Image': IMAGE}}])
                return ''
            def readiness(*args):
                if fail: raise ValueError('Readiness failed')
            def put(path, body, uid=0, mode=0o600): path.write_text(body)
            with patch.object(primary, 'ROOT',root), patch.object(primary,'STATE',state), patch.object(primary,'trusted'), patch.object(primary,'put',side_effect=put), patch.object(primary,'run',side_effect=run), patch.object(primary,'current_booking',return_value=(BOOKING,IDENTITIES)), patch.object(primary,'applications',return_value=IDENTITIES), patch.object(primary.runpy,'run_path',return_value={'check_readiness': readiness}):
                if fail:
                    with self.assertRaises(ValueError): primary.release(IMAGE,REVISION,source=source)
                else: primary.release(IMAGE,REVISION,source=source)
            up = [args[-1] for args,_ in commands if 'up' in args]
            self.assertEqual(up,['primary-communications','proxy'])
            for args,env in commands:
                if env:
                    self.assertEqual(env['DD_BOOKING_IMAGE'],'unchanged-booking')
                    self.assertEqual(env['DD_COMMUNICATIONS_IMAGE'],'unchanged-communications')
                    self.assertEqual(env['DD_PRIMARY_COMMUNICATIONS_IMAGE'],IMAGE)
            self.assertEqual(json.loads((state/'primary-previous.json').read_text()),prior)
            for name in primary.PRIMARY_FILES: self.assertEqual((state/'primary-rollback'/name).read_text(),'prior '+name)
            self.assertEqual(json.loads((state/'primary-attempt.json').read_text())['status'],'applying' if fail else 'succeeded')
            self.assertEqual((state/'primary-current.json').exists(),not fail)

if __name__ == '__main__': unittest.main()
