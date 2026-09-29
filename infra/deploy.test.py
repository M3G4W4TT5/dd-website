"""Validate the privilege boundary without Docker or remote changes."""
import importlib.util
import io
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def manifest():
    return {"commit": "a" * 40, "config_version": "c" * 64, "images": {
        target: deploy.PREFIX + target + "@sha256:" + "b" * 64 for target in deploy.TARGETS}}


class ManifestTests(unittest.TestCase):
    def test_booking_operations_preserve_independent_primary_pin_and_reject_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in deploy.PRIMARY_FILES: (root/name).write_text("reviewed " + name)
            primary = deploy.PREFIX + "communications@sha256:" + "f" * 64
            data = {"image":primary,"files":{name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in deploy.PRIMARY_FILES}}
            (root/"primary-image.json").write_text(json.dumps(data))
            env = {"DD_COMMUNICATIONS_IMAGE":"booking-pin"}
            with patch.object(Path,"lstat",return_value=SimpleNamespace(st_uid=0,st_mode=0o100644)):
                args = deploy.preserve_primary(["docker","compose"],env,root)
                self.assertEqual(args[-2:],["-f",str(root/"compose.primary.yaml")])
                self.assertEqual(env["DD_PRIMARY_COMMUNICATIONS_IMAGE"],primary)
                self.assertEqual(env["DD_COMMUNICATIONS_IMAGE"],"booking-pin")
                (root/"proxy.primary.conf").write_text("unreviewed")
                with self.assertRaisesRegex(ValueError,"differs"): deploy.preserve_primary([],{},root)
            self.assertNotIn("primary-communications",deploy.SERVICES)
            self.assertNotIn("primary",deploy.SERVICES)

    def test_pretix_supervisor_requires_all_three_running_processes(self):
        good = 'nginx RUNNING pid 1\npretixtask RUNNING pid 2\npretixweb RUNNING pid 3\n'
        with patch.object(deploy, 'run', return_value=subprocess.CompletedProcess([], 0, good)) as command:
            deploy.check_pretix_supervisor({})
            self.assertEqual(command.call_args.args[0][1:5],
                             ['exec', '-u', '0', 'dd-hosted-pretix-1'])
        for status in (good.replace('pretixtask RUNNING', 'pretixtask FATAL'),
                       good.replace('pretixweb RUNNING pid 3\n', '')):
            with self.subTest(status=status), patch.object(
                    deploy, 'run', return_value=subprocess.CompletedProcess([], 0, status)):
                with self.assertRaisesRegex(ValueError, 'Pretix supervised process'):
                    deploy.check_pretix_supervisor({})

    def test_installed_deployer_is_hashed_from_its_actual_location(self):
        self.assertEqual(deploy.config_path(Path('/etc/dd-hosted'), 'deploy.py'),
                         Path('/usr/local/sbin/dd-deploy'))
        self.assertEqual(deploy.config_path(Path('infra'), 'deploy.py'), Path('infra/deploy.py'))

    def test_exact_digest_manifest(self):
        self.assertEqual(deploy.validate_manifest(manifest()), manifest())

    def test_rejects_other_registry_tags_commands_and_extra_images(self):
        for value in ["evil.example/image@sha256:" + "b" * 64,
                      deploy.PREFIX + "booking:latest", "$(id)"]:
            data = manifest()
            data["images"]["booking"] = value
            with self.assertRaises(ValueError):
                deploy.validate_manifest(data)
        data = manifest()
        data["images"]["primary"] = "extra"
        with self.assertRaises(ValueError):
            deploy.validate_manifest(data)

    def test_rejects_missing_images_and_invalid_commits(self):
        data = manifest()
        del data["images"]["worker"]
        with self.assertRaises(ValueError):
            deploy.validate_manifest(data)
        data = manifest()
        data["commit"] = "main; id"
        with self.assertRaises(ValueError):
            deploy.validate_manifest(data)

    def test_rejects_arbitrary_manifest_fields(self):
        data = manifest()
        data["compose"] = "/tmp/attacker.yaml"
        with self.assertRaises(ValueError):
            deploy.validate_manifest(data)

    def test_rejects_config_version_mismatch_shape(self):
        data = manifest()
        data["config_version"] = "old"
        with self.assertRaises(ValueError):
            deploy.validate_manifest(data)

    def test_post_replacement_failure_retains_success_and_records_running_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root, state = Path(directory) / "host", Path(directory) / "state"
            root.mkdir()
            state.mkdir()
            for name in deploy.FILES:
                (root / name).write_text("reviewed " + name)
            (root / "ready").write_text("ready")
            candidate = manifest()
            candidate["config_version"] = deploy.config_version(root)
            previous = {**candidate, "commit": "d" * 40}
            (state / "current.json").write_text(json.dumps(previous))

            def fake_run(command, env, capture=False):
                if "-q" in command and "ps" in command:
                    output = "container-id\n"
                elif "image" in command and "inspect" in command:
                    output = candidate["commit"] + "\n"
                elif "inspect" in command:
                    output = "sha256:" + "e" * 64 + "\n"
                else:
                    output = ""
                return subprocess.CompletedProcess(command, 0, output)

            stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(candidate).encode()))
            with patch.object(deploy, "ROOT", root), patch.object(deploy, "STATE", state), \
                 patch.object(deploy.os, "geteuid", return_value=0), patch.object(deploy.sys, "stdin", stdin), \
                 patch.object(Path, "lstat", return_value=SimpleNamespace(st_uid=0, st_mode=0o100644)), \
                 patch.object(deploy, "run", side_effect=fake_run), \
                 patch.object(deploy, "check_readiness", side_effect=ValueError("Pretix-backed availability failed")):
                with self.assertRaisesRegex(ValueError, "readiness failed"):
                    deploy.main()
            self.assertEqual(json.loads((state / "current.json").read_text()), previous)
            failed = json.loads((state / "failed.json").read_text())
            self.assertEqual(failed["manifest"], candidate)
            self.assertEqual(failed["phase"], "readiness")
            self.assertEqual(failed["running_image_ids"]["booking"], "sha256:" + "e" * 64)
            self.assertEqual(json.loads((state / "attempt.json").read_text())["status"], "failed")


if __name__ == "__main__":
    unittest.main()
