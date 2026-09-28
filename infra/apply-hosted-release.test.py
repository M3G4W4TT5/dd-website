"""Check that the owner package can only install the reviewed host-file bytes."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
