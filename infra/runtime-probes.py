"""Fixed image/file/UID/probe/network bindings. Owner helpers only; never deploys."""
from contextlib import contextmanager
import os
from pathlib import Path
import re
import tempfile
import uuid
from urllib.parse import urlsplit,unquote

BINDINGS = {
 'booking-web.env': ('booking',10001,'BOOKING_DATABASE_URL','booking_web_runtime'),
 'booking-communications.env': ('communications',10002,'MARKETING_DATABASE_URL','booking_marketing_runtime'),
 'booking-worker.env': ('worker',10003,'BOOKING_DATABASE_URL','booking_worker_runtime'),
 'primary-communications.env': ('communications',10004,'MARKETING_DATABASE_URL','primary_marketing_runtime'),
}
AVAILABILITY_KEYS = ('BOOKING_DATABASE_URL','PRETIX_API_BASE','PRETIX_ORGANIZER_SLUG',
 'PRETIX_EVENT_SLUG','PRETIX_ITEM_ID','PRETIX_API_TOKEN','PRETIX_SHOP_BASE')

def trusted_source(source):
 path=Path(source)/'runtime-probes.py'
 st=path.lstat()
 if path.is_symlink() or not path.is_file() or st.st_uid!=0 or st.st_mode & 0o022:
  raise ValueError('Unsafe probe helper source')

def binding(images,filename,mode):
 if filename not in BINDINGS or mode not in ('config','database','capture','availability'):
  raise ValueError('Unsupported service probe')
 target,uid,key,role=BINDINGS[filename]
 image=images.get(target,'')
 if not re.fullmatch('ghcr.io/m3g4w4tt5/dd-website-'+target+r'@sha256:[a-f0-9]{64}',image):
  raise ValueError('Image differs from service binding')
 if mode=='availability' and target!='booking' or mode=='capture' and target=='booking':
  raise ValueError('Probe differs from service binding')
 return target,uid,key,role,image

def subset(config,filename,mode):
 _,_,key,_=BINDINGS[filename]
 keys=(key,) if mode=='database' else AVAILABILITY_KEYS if mode=='availability' else ()
 result={k:config[k] for k in keys}
 if keys:
  database=urlsplit(result[key])
  expected=BINDINGS[filename][3]
  if database.scheme not in ('postgres','postgresql') or unquote(database.username or '')!=expected:
   raise ValueError('Database credential differs from service binding')
 if any(not v or '\n' in v or '\r' in v for v in result.values()):raise ValueError('Missing probe credential/configuration')
 if mode=='availability':
  result.update(NODE_ENV='production',PREVIEW='true',PAYMENT_ENVIRONMENT='sandbox',
   PAYMENT_RELEASE_ENABLED='false',PRETIX_EVENTS_CHECKOUT_ENABLED='false')
 return result

def read_private(path,uid):
 st=path.lstat()
 if path.is_symlink() or not path.is_file() or st.st_uid!=uid or st.st_mode & 0o077:
  raise ValueError('Unsafe probe runtime file')
 result={}
 for line in path.read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#'):continue
  if '=' not in line:raise ValueError('Unsupported runtime file syntax')
  k,v=line.split('=',1)
  if not re.fullmatch('[A-Z][A-Z0-9_]*',k) or k in result or v.startswith(('"',"'")):
   raise ValueError('Unsupported runtime file syntax')
  result[k]=v
 return result

@contextmanager
def minimal_file(directory,uid,config):
 with tempfile.TemporaryDirectory(prefix='runtime-probe-',dir=directory) as folder:
  path=Path(folder)/'probe.env'
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o400)
  with os.fdopen(fd,'w') as out:out.write(''.join(k+'='+v+'\n' for k,v in config.items()))
  os.chown(path,uid,uid)
  yield path

def command(images,filename,mode,path=None,name=None):
 _,uid,_,_,image=binding(images,filename,mode)
 # Only availability gets both networks; it needs shared admission and Pretix reads.
 network='dd-hosted_database' if mode in ('database','availability') else 'none'
 args=['docker','create' if mode=='availability' else 'run','--read-only','--user',f'{uid}:{uid}',
  '--network',network,'--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','256m','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,noexec,size=64m,mode=1777']
 if mode=='availability':
  if not name or not re.fullmatch('dd-probe-[a-f0-9]{32}',name):raise ValueError('Probe container name required')
  args+=['--name',name]
 else:args+=['--rm']
 if mode=='capture':
  if path is not None:raise ValueError('Capture probe needs no credentials')
  args+=['--tmpfs',f'/capture:rw,nosuid,noexec,size=32m,mode=0700,uid={uid},gid={uid}']
 else:
  if path is None:raise ValueError('Probe environment required')
  if Path(path).name != (filename if mode=='config' else 'probe.env'):
   raise ValueError('Environment file differs from probe binding')
  args+=['--mount',f'type=bind,src={path},dst=/run/secrets/runtime,readonly']
 args+=['--entrypoint','node',image]
 if path is not None:args+=['--env-file=/run/secrets/runtime']
 probe=('primary-'+mode) if filename=='primary-communications.env' and mode in ('config','database') else mode
 return args+['/app/probes/'+probe+'.mjs']

def run_probe(run,images,filename,mode,root,private):
 _,uid,_,_,_=binding(images,filename,mode)
 if mode=='capture':run(command(images,filename,mode));return
 runtime=Path(root)/'secrets'/filename
 config=read_private(runtime,uid)
 if mode=='config':run(command(images,filename,mode,runtime));return
 with minimal_file(private,uid,subset(config,filename,mode)) as path:
  if mode!='availability':run(command(images,filename,mode,path));return
  name='dd-probe-'+uuid.uuid4().hex
  try:
   run(command(images,filename,mode,path,name))
   run(['docker','network','connect','dd-hosted_ingress',name])
   run(['docker','start','--attach',name])
   # docker start --attach does not propagate container exit status.
   status=run(['docker','inspect','--format','{{.State.ExitCode}}',name],capture=True)
   if status!='0':raise ValueError('Availability probe failed')
  finally:run(['docker','rm','--force',name])
