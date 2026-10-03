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
   self.assertNotIn('tsx',cmd);self.assertNotIn('-e',cmd);self.assertEqual(cmd[-1],'/app/probes/'+('primary-' if filename=='primary-communications.env' else '')+'config.mjs')
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
 def test_primary_credentials_and_uid_stay_with_primary_probe(self):
  filename='primary-communications.env'
  cfg={'MARKETING_DATABASE_URL':'postgresql://primary_marketing_runtime:x@postgres/marketing','PAYLOAD_KEY':'private','PRIMARY_PROXY_KEY':'private'}
  self.assertEqual(probes.BINDINGS[filename],('communications',10004,'MARKETING_DATABASE_URL','primary_marketing_runtime'))
  self.assertEqual(probes.subset(cfg,filename,'database'),{'MARKETING_DATABASE_URL':cfg['MARKETING_DATABASE_URL']})
  self.assertEqual(probes.command(IMAGES,filename,'database',Path('probe.env'))[-1],'/app/probes/primary-database.mjs')
  for source,target in [('primary_marketing_runtime','booking-communications.env'),('booking_marketing_runtime',filename)]:
   with self.assertRaises(ValueError):probes.subset({'MARKETING_DATABASE_URL':'postgresql://'+source+':x@postgres/marketing'},target,'database')
  with self.assertRaises(ValueError):probes.command(IMAGES,filename,'availability',Path('probe.env'),'dd-probe-'+'b'*32)
  commands=[]
  with tempfile.TemporaryDirectory() as folder,patch.object(probes,'read_private',return_value=cfg) as read,patch.object(probes.os,'chown') as chown:
   def run(args):
    commands.append(args)
    mount=next(a for a in args if a.startswith('type=bind,src='))
    self.assertEqual(Path(mount.split('src=')[1].split(',')[0]).read_text(),'MARKETING_DATABASE_URL='+cfg['MARKETING_DATABASE_URL']+'\n')
   probes.run_probe(run,IMAGES,filename,'database',folder,folder)
   read.assert_called_once_with(Path(folder)/'secrets'/filename,10004)
   self.assertEqual(chown.call_args.args[1:],(10004,10004))
   self.assertEqual(commands[0][-1],'/app/probes/primary-database.mjs')
   self.assertEqual(list(Path(folder).iterdir()),[])
 def test_primary_compiled_config_rejects_booking_identity(self):
  cfg={'DD_MODE':'production','SERVICE_SITE':'primary','PAYMENT_ENVIRONMENT':'sandbox','MAIL_DELIVERY':'capture',
   'MARKETING_DATABASE_URL':'postgresql://primary_marketing_runtime:x@localhost/marketing',
   'PAYLOAD_KEY':'a'*64,'PRIMARY_PROXY_KEY':'b'*64,'ALLOWED_ORIGINS':'https://didde-mie.com','MARKETING_ACTION_BASE_URL':'https://didde-mie.com'}
  file=HERE.parent/'artifacts/runtime-probes/communications/primary-config.mjs'
  def run(config):return subprocess.run(['node',str(file)],env={'PATH':os.environ['PATH'],**config},capture_output=True,text=True)
  self.assertEqual(run(cfg).returncode,0)
  for change in ({'SERVICE_SITE':'booking'},{'MARKETING_DATABASE_URL':'postgresql://booking_marketing_runtime:x@localhost/marketing'},{'PRIMARY_PROXY_KEY':''}):
   self.assertNotEqual(run({**cfg,**change}).returncode,0)
  booking=HERE.parent/'artifacts/runtime-probes/communications/config.mjs'
  self.assertNotEqual(subprocess.run(['node',str(booking)],env={'PATH':os.environ['PATH'],**cfg},capture_output=True).returncode,0)
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
