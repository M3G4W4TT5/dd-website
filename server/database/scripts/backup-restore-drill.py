#!/usr/bin/env python3
"""Owner-run disposable fixture backup and isolated restore proof; never touches app data."""
import os,sys,json,secrets,subprocess,tempfile,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[3];os.chdir(root)
sys.excepthook=lambda kind,value,tb:print('Restore drill stopped: '+str(value),file=sys.stderr)
name='dd_restore_'+secrets.token_hex(6);fixture='dd_backup_fixture_'+secrets.token_hex(6)
def cmd(args,input=None):
 r=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode:raise RuntimeError('PostgreSQL drill command failed (credentials and SQL output withheld)')
 return r.stdout
base=['docker','compose','exec','-T','postgres']
def sql(db,text):return cmd(base+['psql','-U','dd_local_admin','-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],text.encode())
# The fixture databases have no service connections, mail configuration or provider credentials.
saved=json.loads((root/'infra/local/provisioning-private.json').read_text())
sql('postgres',f'CREATE DATABASE {fixture};')
try:
 sql(fixture,f"REVOKE CONNECT ON DATABASE {fixture} FROM PUBLIC; GRANT CONNECT ON DATABASE {fixture} TO dd_backup; CREATE TABLE proof(id integer PRIMARY KEY,value text NOT NULL); INSERT INTO proof VALUES(1,'isolated fixture'),(2,'restore proof'); GRANT SELECT ON proof TO dd_backup;")
 parent=Path(tempfile.mkdtemp(prefix='dd-backup-drill-'));parent.chmod(0o700);directory=parent/'snapshot'
 backup_url='postgresql://dd_backup:'+saved['passwords']['dd_backup']+'@127.0.0.1:5433/postgres'
 restore_url='postgresql://dd_local_admin:'+saved['admin']+'@127.0.0.1:5433/postgres'
 env={**os.environ,'BACKUP_DATABASE_URL':backup_url,'BACKUP_FIXTURE_MODE':'true','RESTORE_DATABASE_URL':restore_url,'RESTORE_INTEGRATIONS':'disabled'}
 subprocess.run(['python3','server/database/scripts/backup.py',fixture,str(directory)],env=env,check=True)
 subprocess.run(['python3','server/database/scripts/restore.py',str(directory),name],env=env,check=True)
 query="SELECT count(*)||':'||md5(string_agg(id::text||value,',' ORDER BY id)) FROM proof;"
 if sql(fixture,query)!=sql(name,query):raise RuntimeError('Restore content fingerprint mismatch')
 print('PASS actual scoped backup/restore tools, private custom-format artifact and content fingerprint; integrations disabled')
finally:
 sql('postgres',f'DROP DATABASE IF EXISTS {name}; DROP DATABASE {fixture};')
