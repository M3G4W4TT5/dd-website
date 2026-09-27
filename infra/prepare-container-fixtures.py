#!/usr/bin/env python3
import os,json,secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1];os.chdir(root)
from_env=lambda name:dict(line.split('=',1) for line in (root/'infra/local'/name).read_text().splitlines() if line and not line.startswith('#') and '=' in line)
folder=root/'infra/local/container';folder.mkdir(mode=0o700,exist_ok=True);folder.chmod(0o755)
for name,uid in [('booking-web',10001),('booking-communications',10002),('booking-worker',10003)]:
 env=from_env(name+'.env');env.update({'DD_MODE':'production','PAYMENT_ENVIRONMENT':'sandbox','MAIL_DELIVERY':'capture','HOST':'0.0.0.0','PREVIEW':'false'})
 for key,value in list(env.items()):
  if key.endswith('_DATABASE_URL'):env[key]=value.replace('@127.0.0.1:5433','@postgres:5432')
 env['BOOKING_PUBLIC_BASE_URL']='https://booking.didde-mie.com'
 if name=='booking-web':
  env['CONTACT_BOOKING_ORIGIN']='https://booking.didde-mie.com';env['BOOKING_COMMUNICATIONS_URL']='http://booking-communications:3012'
  # Local authenticated webhook fixture secrets are generated if not configured.
  env['PRETIX_MANAGE_WEBHOOK_USER']=env.get('PRETIX_MANAGE_WEBHOOK_USER') or 'fixture'
  env['PRETIX_MANAGE_WEBHOOK_PASSWORD']=env.get('PRETIX_MANAGE_WEBHOOK_PASSWORD') or secrets.token_hex(32)
 if name=='booking-communications':env['ALLOWED_ORIGINS']='https://booking.didde-mie.com';env['MARKETING_ACTION_BASE_URL']='https://booking.didde-mie.com';env['CAPTURE_DIRECTORY']='/tmp/capture'
 if name=='booking-worker':env['CAPTURE_DIRECTORY']='/tmp/capture';env['PRETIX_SHOP_BASE']='https://checkout.didde-mie.com'
 if 'PRETIX_API_BASE' in env:env['PRETIX_API_BASE']='http://pretix:80'
 p=folder/(name+'.env');p.write_text(''.join(k+'='+v+'\n' for k,v in env.items()));p.chmod(0o400);os.chown(p,uid,uid)
print('Private per-UID production fixture configuration prepared; sandbox/capture only')
