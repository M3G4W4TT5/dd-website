"""Private config activation regression with fake SMTP; no network or credentials."""
import configparser
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('native_mail_config',Path(__file__).with_name('configure-ttd-native-mail.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)

class FakeSMTP:
    sent=False
    def __init__(self,*args,**kwargs):pass
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def login(self,user,password):assert user=='booking@didde-mie.com'
    def mail(self,address):assert address=='noreply+booking@didde-mie.com';return 250,b''
    def rcpt(self,address):assert address=='dev@memoryone.eu';return 250,b''
    def rset(self):pass
    def data(self,*args):raise AssertionError('No sends allowed')

class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.root=Path(self.directory.name);(self.root/'secrets').mkdir()
        self.runtime=self.root/'secrets/pretix-runtime.cfg'
        self.original='[mail]\nhost=mail-capture\nport=1025\n[database]\npassword=synthetic-db-secret\n[pretix]\nurl=https://example.test\n'
        self.runtime.write_text(self.original);self.runtime.chmod(0o400)
        (self.root/'current.json').write_text(json.dumps({'commit':'synthetic-reviewed-commit'}))
        (self.root/'pretix-settings.py').write_text('reviewed adapter')
        self.digest=hashlib.sha256(b'reviewed adapter').hexdigest()
        original_stat=Path.stat
        def fixture_stat(path,*args,**kwargs):
            result=original_stat(path,*args,**kwargs)
            if path==self.root/'backups':
                fields=list(result);fields[4]=0;return os.stat_result(fields)
            return result
        self.patches=[patch.object(Path,'stat',fixture_stat),patch.object(helper,'ROOT',self.root),patch.object(helper,'STATE',self.root),patch.object(helper,'BACKUPS',self.root/'backups'),patch.object(helper.os,'geteuid',return_value=0),patch.object(helper.os,'chown'),patch.object(helper.os,'fchown'),patch.object(helper.smtplib,'SMTP_SSL',FakeSMTP)]
        for p in self.patches:p.start();self.addCleanup(p.stop)
    def inspect(self):return helper.inspect('synthetic-reviewed-commit',self.digest)
    def test_inspection_changes_nothing(self):
        self.inspect();self.assertEqual(self.runtime.read_text(),self.original)
    def test_activation_preserves_all_other_settings_and_permissions(self):
        args=self.inspect();helper.activate(*args,'synthetic-private-app-password')
        cfg=configparser.ConfigParser(interpolation=None);cfg.read(self.runtime)
        self.assertEqual(cfg['database']['password'],'synthetic-db-secret')
        self.assertEqual(cfg['mail']['host'],'mail-capture')
        self.assertEqual(cfg['pretix']['url'],'https://example.test')
        self.assertEqual(cfg['ttd-mail']['release_enabled'],'false')
        self.assertEqual(cfg['ttd-mail']['recipient_allowlist'],'dev@memoryone.eu')
        self.assertEqual(self.runtime.stat().st_mode & 0o777,0o400)
        backups=list((self.root/'backups').glob('*.cfg'));self.assertEqual(len(backups),1)
        self.assertEqual(backups[0].read_text(),self.original)
        self.assertEqual(backups[0].stat().st_mode & 0o777,0o600)
        with self.assertRaises(RuntimeError):self.inspect()
    def test_release_and_adapter_drift_rejected(self):
        with self.assertRaises(RuntimeError):helper.inspect('other',self.digest)
        with self.assertRaises(RuntimeError):helper.inspect('synthetic-reviewed-commit','other')
    def test_concurrent_runtime_change_rejected(self):
        args=self.inspect();self.runtime.chmod(0o600);self.runtime.write_text(self.original+'\n# another context\n')
        with self.assertRaises(RuntimeError):helper.activate(*args,'synthetic-private-app-password')
        self.assertFalse((self.root/'backups').exists())
    def test_unsafe_file_rejected(self):
        self.runtime.chmod(0o644)
        with self.assertRaises(RuntimeError):self.inspect()

if __name__=='__main__':unittest.main()
