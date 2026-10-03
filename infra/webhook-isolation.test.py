import ast
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
HERE=Path(__file__).resolve().parent

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
release=module('release','apply-hosted-release.py');fixture=module('fixture','verify-hosted-compose-upgrade.py')

def compose(path):
 env={**os.environ,'DD_SECRET_DIRECTORY':'/tmp/synthetic-dd-not-hosted',**{key:'ghcr.io/m3g4w4tt5/dd-website-'+target+'@sha256:'+'a'*64 for key,target in [('DD_BOOKING_IMAGE','booking'),('DD_COMMUNICATIONS_IMAGE','communications'),('DD_WORKER_IMAGE','worker')]}}
 r=subprocess.run(['docker','compose','-f',str(path),'config','--format','json'],env=env,text=True,capture_output=True,check=True)
 return json.loads(r.stdout)

class IsolationTests(unittest.TestCase):
 def test_compose_producer_destination_and_secret_bindings(self):
  data=compose(HERE/'compose.production.yaml');services=data['services'];relay=services['pretix-webhook-relay'];proxy=services['proxy']
  self.assertEqual(set(relay['networks']),{'webhook-producer','webhook-destination'});self.assertFalse(relay.get('ports'))
  self.assertEqual(relay['user'],'101:101');self.assertIn('10006',relay['group_add']);self.assertTrue(relay['read_only'])
  self.assertEqual([s['source'] for s in relay['secrets']],['pretix-webhook-header']);self.assertFalse(any(s['source']=='pretix-webhook-header' for s in proxy['secrets']))
  for network,peers,ip in [('webhook-producer',{'pretix','pretix-webhook-relay'},'172.26.0.'),('webhook-destination',{'booking','pretix-webhook-relay'},'172.27.0.')]:
   self.assertEqual({name for name,s in services.items() if network in s.get('networks',{})},peers)
   self.assertTrue(data['networks'][network]['internal']);self.assertEqual(services['pretix-webhook-relay']['networks'][network]['ipv4_address'],ip+'3')
  self.assertEqual(services['pretix']['networks']['webhook-producer']['ipv4_address'],'172.26.0.2')
  self.assertEqual(services['booking']['networks']['webhook-destination']['ipv4_address'],'172.27.0.2')
  config=(HERE/'pretix-webhook-relay.conf').read_text();self.assertEqual(config.count('listen '),1);self.assertIn('listen 172.26.0.3:8081;',config);self.assertIn('allow 172.26.0.2;\n deny all;',config);self.assertIn('limit_req_status 429;',config);self.assertIn('proxy_pass http://172.27.0.2:3000;',config)
  public=(HERE/'proxy.conf').read_text();self.assertNotIn('8081',public);self.assertNotIn('pretix-webhook-header',public)
 def test_source_ssrf_exception_is_only_relay_producer_address(self):
  tree=ast.parse((HERE/'pretix-settings.py').read_text());fn=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='booking_webhook_private_access')
  class Socket:
   SOCK_STREAM=1
   @staticmethod
   def getaddrinfo(host,port,**_):
    if host!='pretix-webhook-relay':raise AssertionError('wrong lookup')
    return [(None,None,None,None,('172.26.0.3',port)),(None,None,None,None,('172.27.0.3',port))]
  scope={'socket':Socket,'upstream_should_block_access':lambda _:(True,'blocked')}
  exec(compile(ast.Module(body=[fn],type_ignores=[]),'fixture','exec'),scope)
  check=scope[fn.name];self.assertEqual(check(('172.26.0.3',8081)),(False,''))
  for address in [('172.27.0.3',8081),('172.26.0.3',80),('127.0.0.1',8081),('172.20.0.2',8081)]:self.assertTrue(check(address)[0])
  with patch.object(Socket,'getaddrinfo',side_effect=OSError):self.assertTrue(check(('172.26.0.3',8081))[0])
 def test_owner_subnet_guard_and_existing_target_transition(self):
  overlaps=[{'Name':'unrelated','IPAM':{'Config':[{'Subnet':'172.26.0.0/16'}]}}]
  with patch.object(release,'safe_run',side_effect=['id',json.dumps(overlaps)]),self.assertRaisesRegex(ValueError,'overlaps'):release.verify_relay_subnets()
  reviewed=[{'Name':'dd-hosted_webhook-producer','IPAM':{'Config':[{'Subnet':'172.26.0.0/29'}]}}]
  with patch.object(release,'safe_run',side_effect=['id',json.dumps(reviewed)]):release.verify_relay_subnets()
  commands=[]
  with patch.object(release,'safe_run',side_effect=lambda args,**_:commands.append(args)):release.migrate_webhook_target()
  code=commands[0][-1];self.assertIn("hook.save(update_fields=['target_url'])",code);self.assertIn("('http://proxy:8081/api/manage/pretix-webhook',target)",code);self.assertNotIn('objects.create',code);self.assertNotIn('listeners.',code)
 def test_builtin_networks_without_ipam_preserve_overlap_guard(self):
  builtin=[{'Name':'host','IPAM':{'Config':None}},{'Name':'none','IPAM':{'Config':None}}]
  with patch.object(release,'safe_run',side_effect=['host none',json.dumps(builtin)]):release.verify_relay_subnets()
  overlap={'Name':'unrelated','IPAM':{'Config':[{'Subnet':'172.27.0.0/16'}]}}
  with patch.object(release,'safe_run',side_effect=['host none other',json.dumps(builtin+[overlap])]),self.assertRaisesRegex(ValueError,'overlaps'):release.verify_relay_subnets()
  changed={'Name':'dd-hosted_webhook-producer','IPAM':{'Config':[{'Subnet':'172.26.0.0/28'}]}}
  with patch.object(release,'safe_run',side_effect=['host none producer',json.dumps(builtin+[changed])]),self.assertRaisesRegex(ValueError,'differs'):release.verify_relay_subnets()
 def test_disposable_fixture_uses_same_interface_bindings_and_no_sudo(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'compose.yaml';path.write_text(fixture.COMPOSE.format(project='synthetic',root=folder));data=compose(path)
   self.assertEqual(set(data['services']['pretix-webhook-relay']['networks']),{'webhook-producer','webhook-destination'})
   self.assertFalse(any(s.get('ports') for s in data['services'].values()))
  self.assertNotIn("('sudo',",(HERE/'verify-hosted-compose-upgrade.py').read_text())
if __name__=='__main__':unittest.main()
