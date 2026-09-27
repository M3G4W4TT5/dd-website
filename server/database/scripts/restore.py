#!/usr/bin/env python3
import os,sys,json,hashlib
from pathlib import Path
from urllib.parse import urlparse
from pgtool import client
sys.excepthook=lambda kind,value,tb:print(str(value),file=sys.stderr)
if len(sys.argv)!=3:raise SystemExit('Usage: restore.py private-backup-directory dd_restore_name')
directory,name=sys.argv[1:]
if not name.startswith('dd_restore_') or not name.replace('_','').isalnum():raise SystemExit('Disposable dd_restore_ database required')
if os.environ.get('RESTORE_INTEGRATIONS')!='disabled':raise SystemExit('RESTORE_INTEGRATIONS=disabled required')
url=os.environ['RESTORE_DATABASE_URL']
if urlparse(url).username not in ['dd_local_admin','dd_admin','dd_restore_operator']:raise SystemExit('Explicit restore operator identity required')
manifest=json.loads((Path(directory)/'manifest.json').read_text());
if manifest.get('format')!='custom' or not isinstance(manifest.get('database'),str) or not manifest['database'].replace('_','').isalnum():raise SystemExit('Invalid backup manifest')
dump=(Path(directory)/(manifest['database']+'.dump')).read_bytes()
if hashlib.sha256(dump).hexdigest()!=manifest['sha256']:raise SystemExit('Backup checksum mismatch')
with client(url) as run:
 run('createdb',[name]);run('psql',['--dbname',name,'-Xq','-v','ON_ERROR_STOP=1'],f'REVOKE CONNECT ON DATABASE {name} FROM PUBLIC;'.encode());run('pg_restore',['--dbname',name,'--no-owner','--no-acl','--exit-on-error'],dump)
print('Isolated restore complete; no outgoing services started')
