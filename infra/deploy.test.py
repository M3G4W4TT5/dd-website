"""Validate the privilege boundary without Docker or remote changes."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("deploy", Path(__file__).with_name("deploy.py"))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


def manifest():
    return {"commit": "a" * 40, "images": {
        target: deploy.PREFIX + target + "@sha256:" + "b" * 64 for target in deploy.TARGETS}}


class ManifestTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
