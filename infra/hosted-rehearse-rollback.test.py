#!/usr/bin/python3
"""Pure manifest checks for the owner-only image rollback helper."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock


SPEC = importlib.util.spec_from_file_location(
    'rollback', Path(__file__).with_name('hosted-rehearse-rollback.py'))
rollback = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rollback)


class RollbackTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name)
        self.current = {'commit': 'a' * 40, 'config_version': 'c' * 64,
                        'images': {'booking': 'booking-a', 'communications': 'communications-a',
                                   'worker': 'worker-a'}}
        self.previous = {'commit': 'b' * 40, 'config_version': 'd' * 64,
                         'images': {'booking': 'booking-b', 'communications': 'communications-b',
                                    'worker': 'worker-b'}}
        (self.state / 'current.json').write_text(json.dumps(self.current))
        (self.state / 'previous.json').write_text(json.dumps(self.previous))
        (self.state / 'attempt.json').write_text(json.dumps({
            'status': 'succeeded', 'manifest': self.current}))

    def planning(self, expected=None):
        with patch.object(rollback, 'STATE', self.state), \
             patch.object(rollback.runpy, 'run_path', return_value={
                 'config_version': lambda _: 'c' * 64,
                 'validate_manifest': lambda manifest: manifest}):
            return rollback.planned_release(expected)

    def test_uses_only_recorded_previous_images_with_current_config(self):
        current, target = self.planning('b' * 40)
        self.assertEqual(current, self.current)
        self.assertEqual(target['commit'], self.previous['commit'])
        self.assertEqual(target['images'], self.previous['images'])
        self.assertEqual(target['config_version'], self.current['config_version'])

    def test_rejects_unverified_or_ambiguous_state(self):
        with self.assertRaises(ValueError):
            self.planning('e' * 40)
        (self.state / 'failed.json').write_text('{}')
        with self.assertRaises(ValueError):
            self.planning()
        (self.state / 'failed.json').unlink()
        (self.state / 'attempt.json').write_text(json.dumps({'status': 'failed'}))
        with self.assertRaises(ValueError):
            self.planning()
        (self.state / 'attempt.json').write_text(json.dumps({
            'status': 'succeeded', 'manifest': self.current}))
        self.previous['commit'] = self.current['commit']
        (self.state / 'previous.json').write_text(json.dumps(self.previous))
        with self.assertRaises(ValueError):
            self.planning()

    def test_rejects_host_config_drift(self):
        self.current['config_version'] = 'e' * 64
        (self.state / 'current.json').write_text(json.dumps(self.current))
        (self.state / 'attempt.json').write_text(json.dumps({
            'status': 'succeeded', 'manifest': self.current}))
        with self.assertRaises(ValueError):
            self.planning()

    def test_execute_sends_only_the_recorded_digest_manifest(self):
        target = {**self.previous, 'config_version': self.current['config_version']}
        completed = MagicMock(returncode=0, stdout=b'Deployed recorded revision\n')
        with patch.object(rollback.os, 'geteuid', return_value=0), \
             patch.object(rollback.sys, 'argv', ['hosted-rehearse-rollback.py', 'execute', 'b' * 40]), \
             patch.object(rollback, 'planned_release', return_value=(self.current, target)) as planned, \
             patch.object(rollback.subprocess, 'run', return_value=completed) as run:
            rollback.main()
        planned.assert_called_once_with('b' * 40)
        args, kwargs = run.call_args
        self.assertEqual(args[0], [str(rollback.DEPLOY)])
        self.assertEqual(json.loads(kwargs['input']), target)
        self.assertEqual(kwargs['timeout'], 900)


if __name__ == '__main__':
    unittest.main()
