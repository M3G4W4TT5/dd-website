#!/usr/bin/python3
"""Disposable config/capture entrypoint checks with synthetic credentials, no network.
Usage: python3 infra/verify-runtime-probe-images.py REVIEWED_RELEASE_MANIFEST.json
Database/availability network probes are separately required before owner rollout.
"""
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
import tempfile
HERE=Path(__file__).resolve().parent

def main():
 if len(sys.argv)!=2:raise ValueError('Reviewed release manifest required')
 manifest=runpy.run_path(str(HERE/'deploy.py'))['validate_manifest'](json.loads(Path(sys.argv[1]).read_text()))
 probes=runpy.run_path(str(HERE/'runtime-probes.py'))
 setup=runpy.run_path(str(HERE/'setup-hosted-runtime.py'))
 credentials=dict.fromkeys(setup['KEYS'],'a'*64)
 passwords=dict.fromkeys(('booking_web_runtime','booking_worker_runtime','booking_marketing_runtime'),'b'*64)
 with tempfile.TemporaryDirectory(prefix='dd-synthetic-probes-') as folder:
  configs=setup['runtime_files'](credentials,passwords)
  configs['primary-communications.env']=(10004,{'DD_MODE':'production','SERVICE_SITE':'primary','PAYMENT_ENVIRONMENT':'sandbox','MAIL_DELIVERY':'capture','MARKETING_DATABASE_URL':'postgresql://primary_marketing_runtime:synthetic@postgres/marketing','PAYLOAD_KEY':'a'*64,'PRIMARY_PROXY_KEY':'b'*64,'ALLOWED_ORIGINS':'https://didde-mie.com','MARKETING_ACTION_BASE_URL':'https://didde-mie.com'})
  for filename,(uid,config) in configs.items():
   path=Path(folder)/filename
   path.write_text(''.join(k+'='+v+'\n' for k,v in config.items()))
   path.chmod(0o444) # Public synthetic values only; allows the fixed container UID.
   subprocess.run(probes['command'](manifest['images'],filename,'config',path),check=True,timeout=30)
   if filename!='booking-web.env':subprocess.run(probes['command'](manifest['images'],filename,'capture'),check=True,timeout=30)
 print('PASS matching image entrypoints with synthetic config/capture, no network')
if __name__=='__main__':main()
