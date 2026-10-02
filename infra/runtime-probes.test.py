import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('probes',HERE/'runtime-probes.py');probes=importlib.util.module_from_spec(spec);spec.loader.exec_module(probes)
setup_spec=importlib.util.spec_from_file_location('setup',HERE/'setup-hosted-runtime.py');setup=importlib.util.module_from_spec(setup_spec);setup_spec.loader.exec_module(setup)
IMAGES={k:'ghcr.io/m3g4w4tt5/dd-website-'+k+'@sha256:'+'a'*64 for k in ('booking','worker','communications')}
class ProbesTests(unittest.TestCase):
 def test_exact_service_bindings_and_rejected_crossings(self):
  for filename,(target,uid,key,role) in probes.BINDINGS.items():
   cmd=probes.command(IMAGES,filename,'config',Path('/synthetic')/filename)
   self.assertIn(IMAGES[target],cmd);self.assertIn(f'{uid}:{uid}',cmd);self.assertIn('none',cmd)
   self.assertNotIn('tsx',cmd);self.assertNotIn('-e',cmd);self.assertEqual(cmd[-1],'/app/probes/config.mjs')
   crossed={**IMAGES,target:IMAGES['worker' if target!='worker' else 'booking']}
   with self.assertRaises(ValueError):probes.command(crossed,filename,'config',Path(filename))
   with self.assertRaises(ValueError):probes.command(IMAGES,filename,'config',Path('wrong-runtime.env'))
   db=probes.command(IMAGES,filename,'database',Path('/synthetic/probe.env'))
   self.assertIn('dd-hosted_database',db);self.assertNotIn('dd-hosted_ingress',db)
  with self.assertRaises(ValueError):probes.command(IMAGES,'booking-web.env','capture')
  with self.assertRaises(ValueError):probes.command(IMAGES,'booking-worker.env','availability',Path('probe.env'),'dd-probe-'+'b'*32)
 def test_minimum_credentials_and_networks(self):
  config={k:'synthetic' for k in probes.AVAILABILITY_KEYS}
  config.update(BOOKING_DATABASE_URL='postgresql://booking_web_runtime:synthetic@postgres/booking_management',PAYLOAD_KEY='private-not-for-probe',SMTP_PASSWORD='private-not-for-probe',PRETIX_MANAGE_API_TOKEN='private-not-for-probe')
  self.assertEqual(set(probes.subset(config,'booking-web.env','database')),{'BOOKING_DATABASE_URL'})
  reduced=probes.subset(config,'booking-web.env','availability')
  self.assertFalse({'PAYLOAD_KEY','SMTP_PASSWORD','PRETIX_MANAGE_API_TOKEN'} & set(reduced))
  self.assertEqual(reduced['PRETIX_EVENTS_CHECKOUT_ENABLED'],'false')
  with self.assertRaises(ValueError):probes.subset({**config,'BOOKING_DATABASE_URL':'postgresql://booking_worker_runtime:x@postgres/booking_management'},'booking-web.env','database')
  commands=[];snapshots=[]
  with tempfile.TemporaryDirectory() as folder,patch.object(probes,'read_private',return_value=config),patch.object(probes.os,'chown'):
   def run(args,capture=False):
    commands.append(args)
    for item in args:
     if item.startswith('type=bind,src='):
      path=Path(item.split('src=')[1].split(',')[0]);snapshots.append(path.read_text())
    return '0' if capture else None
   probes.run_probe(run,IMAGES,'booking-web.env','availability',Path(folder),folder)
   self.assertEqual(len(commands),5)
   self.assertIn(['docker','network','connect','dd-hosted_ingress',commands[0][commands[0].index('--name')+1]],commands)
   self.assertFalse(any('private-not-for-probe' in s for s in snapshots))
   self.assertEqual(list(Path(folder).iterdir()),[])
 def test_failure_still_removes_probe_and_private_subset(self):
  cfg={k:'synthetic' for k in probes.AVAILABILITY_KEYS};cfg['BOOKING_DATABASE_URL']='postgresql://booking_web_runtime:x@postgres/booking_management'
  commands=[]
  with tempfile.TemporaryDirectory() as folder,patch.object(probes,'read_private',return_value=cfg),patch.object(probes.os,'chown'):
   def run(args,capture=False):
    commands.append(args)
    if args[:2]==['docker','start']:raise RuntimeError('synthetic start failure')
   with self.assertRaises(RuntimeError):probes.run_probe(run,IMAGES,'booking-web.env','availability',Path(folder),folder)
   self.assertEqual(commands[-1][:3],['docker','rm','--force']);self.assertEqual(list(Path(folder).iterdir()),[])
 def test_helpers_use_binding_and_readiness_marker_follows_checks(self):
  for name in ('setup-hosted-runtime.py','prepare-hosted-readiness.py','complete-hosted-rental-configuration.py'):
   source=(HERE/name).read_text();self.assertIn("probes['run_probe']",source)
   self.assertNotIn("manifest['images']['communications']",source);self.assertNotIn("'--import', 'tsx'",source)
  readiness=(HERE/'prepare-hosted-readiness.py').read_text()
  self.assertLess(readiness.index("probes['run_probe']"),readiness.index("fd = os.open(ROOT / 'ready'"))
 def test_compiled_config_runs_without_typescript_or_tsx(self):
  credentials=dict.fromkeys(setup.KEYS,'a'*64);passwords={r:'b'*64 for r in ('booking_web_runtime','booking_worker_runtime','booking_marketing_runtime')}
  for filename,(uid,config) in setup.runtime_files(credentials,passwords).items():
   service=probes.BINDINGS[filename][0]
   env={'PATH':os.environ['PATH'],**config}
   file=HERE.parent/'artifacts/runtime-probes'/service/'config.mjs'
   result=subprocess.run(['node',str(file)],env=env,capture_output=True,text=True)
   self.assertEqual(result.returncode,0,result.stderr)
   result=subprocess.run(['node',str(file)],env={**env,'BOOKING_DATABASE_URL':'postgresql://wrong:x@localhost/x'},capture_output=True,text=True)
   self.assertNotEqual(result.returncode,0)
if __name__=='__main__':unittest.main()
