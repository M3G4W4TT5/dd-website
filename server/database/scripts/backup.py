#!/usr/bin/env python3
import os,sys,json,hashlib
from pathlib import Path
from urllib.parse import urlparse
from pgtool import client
sys.excepthook=lambda kind,value,tb:print(str(value),file=sys.stderr)
if len(sys.argv)!=3:raise SystemExit('Usage: backup.py database /private/output-directory')
if sys.argv[1] not in ['marketing','booking_management','pretix'] and not (os.environ.get('BACKUP_FIXTURE_MODE')=='true' and sys.argv[1].startswith('dd_backup_fixture_') and sys.argv[1].replace('_','').isalnum()):raise SystemExit('Explicit scoped database required')
db,directory=sys.argv[1:];out=Path(directory).resolve();root=Path(__file__).resolve().parents[3]
if out.is_relative_to(root):raise SystemExit('Backup output must be outside Git repository')
if urlparse(os.environ['BACKUP_DATABASE_URL']).username!='dd_backup':raise SystemExit('Explicit scoped backup identity required')
out.mkdir(mode=0o700,parents=True,exist_ok=False)
with client(os.environ['BACKUP_DATABASE_URL']) as run:data=run('pg_dump',['--dbname',db,'--format=custom','--no-owner','--no-acl'])
target=out/(db+'.dump');target.write_bytes(data);target.chmod(0o600)
manifest={'database':db,'sha256':hashlib.sha256(data).hexdigest(),'format':'custom','integrations':'restore only into isolated DB with integrations disabled'}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));(out/'manifest.json').chmod(0o600)
print('Private scoped backup complete')
