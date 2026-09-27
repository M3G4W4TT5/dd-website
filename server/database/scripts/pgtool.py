"""Use installed PostgreSQL clients or the local postgres container, without leaking credentials."""
import os,secrets,subprocess,shutil
from contextlib import contextmanager
from urllib.parse import urlparse,unquote
def pgpass(value):return value.replace("\\","\\\\").replace(":","\\:")
@contextmanager
def client(url):
 u=urlparse(url);user=unquote(u.username or '');docker=shutil.which('pg_dump') is None
 if docker:
  path='/tmp/dd-operator-'+secrets.token_hex(12);base=['docker','compose','exec','-T','postgres']
  data=f'127.0.0.1:5432:*:{pgpass(user)}:{pgpass(unquote(u.password or ""))}\n'
  subprocess.run(base+['sh','-c',f'umask 077; cat > {path}'],input=data.encode(),check=True,stdout=subprocess.DEVNULL)
  def run(tool,args,stdin=None):
   result=subprocess.run(base+['env','PGPASSFILE='+path,tool,'--host','127.0.0.1','--port','5432','--username',user,*args],input=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
   if result.returncode:raise RuntimeError('Scoped PostgreSQL operation failed (raw output withheld)')
   return result.stdout
  try:yield run
  finally:subprocess.run(base+['rm','-f',path],check=True,stdout=subprocess.DEVNULL)
 else:
  import tempfile
  from pathlib import Path
  with tempfile.TemporaryDirectory() as temporary:
   p=Path(temporary)/'pgpass';p.write_text(f'{u.hostname}:{u.port or 5432}:*:{pgpass(user)}:{pgpass(unquote(u.password or ""))}\n');p.chmod(0o600)
   def run(tool,args,stdin=None):
    r=subprocess.run([tool,'--host',u.hostname,'--port',str(u.port or 5432),'--username',user,*args],input=stdin,env={**os.environ,'PGPASSFILE':str(p)},stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    if r.returncode:raise RuntimeError('Scoped PostgreSQL operation failed (raw output withheld)')
    return r.stdout
   yield run
