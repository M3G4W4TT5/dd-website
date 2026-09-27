#!/usr/bin/env python3
"""Owner-run scoped development provision. No credentials are printed."""
import os,secrets,subprocess,sys,json,re
from pathlib import Path
root=Path(__file__).resolve().parents[3];os.chdir(root)
# Sanitized failures without dumping source statements or generated credentials.
sys.excepthook=lambda kind,value,tb: print('Provisioning stopped: '+re.sub(r'[0-9a-fA-F]{32,}', '[redacted]',str(value)),file=sys.stderr)
def run(args,stdin=None):
 r=subprocess.run(args,input=stdin,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode:
  message=r.stderr.splitlines()[0] if r.stderr else "No diagnostic"
  message=re.sub(r"[0-9a-fA-F]{32,}","[redacted]",message)
  raise RuntimeError("Command failed: "+" ".join(args[:4])+"; "+message)
 return r.stdout
admin='pretix'
try:
 flags=run(['docker','compose','exec','-T','postgres','psql','-U',admin,'-d','pretix','-Atc',"SELECT rolsuper FROM pg_roles WHERE rolname=current_user"]).strip()
 if flags!='t':admin='dd_local_admin'
except RuntimeError: admin='dd_local_admin'
def sql(db,text): return run(['docker','compose','exec','-T','postgres','psql','-U',admin,'-d',db,'-XqAt','-v','ON_ERROR_STOP=1'],text)

roles=['primary_marketing_migrator','booking_marketing_migrator','booking_management_migrator','pretix_migrator','primary_marketing_runtime','booking_marketing_runtime','booking_web_runtime','booking_worker_runtime','pretix_runtime','primary_marketing_operator','booking_marketing_operator','dd_backup']
private=root/'infra/local';private.mkdir(parents=True,exist_ok=True);private.chmod(0o700)
registry=private/'provisioning-private.json'
if registry.exists(): saved=json.loads(registry.read_text())
else:
 saved={'passwords':{r:secrets.token_hex(32) for r in roles},'admin':secrets.token_hex(32),'keys':{k:secrets.token_hex(32) for k in ['primary','booking','management']},'internal':secrets.token_hex(32)}
 registry.write_text(json.dumps(saved));registry.chmod(0o600)
 if 'SUDO_UID' in os.environ:os.chown(registry,int(os.environ['SUDO_UID']),int(os.environ['SUDO_GID']))
passwords=saved['passwords']
print('Provisioning runtime and migration roles')
for role,pw in passwords.items():
 command='ALTER' if sql('pretix',f"SELECT count(*) FROM pg_roles WHERE rolname='{role}';").strip()!='0' else 'CREATE'
 sql('pretix',f"{command} ROLE {role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '{pw}';")
if sql('pretix',"SELECT count(*) FROM pg_database WHERE datname='booking_management';").strip()=='0':sql('pretix',"CREATE DATABASE booking_management OWNER booking_management_migrator;")
for db in ['marketing','booking_management','pretix','postgres']:sql(db,f'REVOKE CONNECT,TEMPORARY ON DATABASE {db} FROM PUBLIC; REVOKE CREATE ON SCHEMA public FROM PUBLIC;')
print('Checking marketing migrations')
for site in ['primary','booking']:
 schema=site+'_marketing';owner=schema+'_migrator';runtime=schema+'_runtime';operator=schema+'_operator'
 if sql('marketing',f"SELECT count(*) FROM pg_namespace WHERE nspname='{schema}';").strip()!='0':continue
 sql('marketing',f"BEGIN; GRANT CONNECT ON DATABASE marketing TO {owner},{runtime},{operator},dd_backup; CREATE SCHEMA {schema} AUTHORIZATION {owner}; SET ROLE {owner}; SET search_path TO {schema},pg_catalog; CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());"+(root/'server/database/migrations/001-marketing.sql').read_text()+f"INSERT INTO schema_migrations(version) VALUES('001'); GRANT USAGE ON SCHEMA {schema} TO {runtime},{operator},dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA {schema} TO {runtime}; REVOKE ALL ON schema_migrations FROM {runtime}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA {schema} TO {runtime}; GRANT SELECT,UPDATE,DELETE ON marketing_subscriptions,marketing_action_tokens TO {operator}; GRANT SELECT ON ALL TABLES IN SCHEMA {schema} TO dd_backup; ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO {runtime}; ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT USAGE,SELECT ON SEQUENCES TO {runtime}; ALTER DEFAULT PRIVILEGES IN SCHEMA {schema} GRANT SELECT ON TABLES TO dd_backup; RESET ROLE; ALTER ROLE {runtime} IN DATABASE marketing SET search_path={schema},pg_catalog; ALTER ROLE {operator} IN DATABASE marketing SET search_path={schema},pg_catalog; COMMIT;")
if sql('booking_management',"SELECT count(*) FROM information_schema.tables WHERE table_name='schema_migrations';").strip()=='0':sql('booking_management',"BEGIN; GRANT CONNECT ON DATABASE booking_management TO booking_management_migrator,booking_web_runtime,booking_worker_runtime,dd_backup; ALTER SCHEMA public OWNER TO booking_management_migrator; SET ROLE booking_management_migrator; CREATE TABLE schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());"+(root/'server/database/migrations/001-management.sql').read_text()+"INSERT INTO schema_migrations VALUES('001',now()); GRANT USAGE ON SCHEMA public TO booking_web_runtime,booking_worker_runtime,dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON manage_link_requests,manage_link_tokens,manage_sessions,operations,webhook_inbox,order_snapshots,deliveries,abuse_limits TO booking_web_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON manage_link_tokens,operations,webhook_inbox,order_snapshots,deliveries,delivery_attempts,abuse_limits TO booking_worker_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO booking_web_runtime,booking_worker_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO dd_backup; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dd_backup; COMMIT;")
print('Configuring Pretix ownership and runtime grants')
sql('pretix',"GRANT CONNECT ON DATABASE pretix TO pretix_migrator,pretix_runtime,dd_backup; GRANT USAGE ON SCHEMA public TO pretix_runtime,dd_backup; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO pretix_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO pretix_runtime; GRANT SELECT ON ALL TABLES IN SCHEMA public TO dd_backup; ALTER DATABASE pretix OWNER TO pretix_migrator; ALTER SCHEMA public OWNER TO pretix_migrator;"+"DO $$ DECLARE r record; BEGIN FOR r IN SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') ORDER BY (c.relkind='S') LOOP EXECUTE format('ALTER %s public.%I OWNER TO pretix_migrator',CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,r.relname); END LOOP; END $$; SET ROLE pretix_migrator; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO pretix_runtime; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE,SELECT ON SEQUENCES TO pretix_runtime; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dd_backup;")
# Retire the previous application role, preserving its disposable old tables for now.
sql('marketing',"ALTER ROLE dd_marketing NOLOGIN; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='dd_marketing' AND pid<>pg_backend_pid();")
# Create an explicitly operational administrator; PostgreSQL forbids renaming the session user.
adminpw=saved['admin']
if admin=='pretix':
 command='ALTER' if sql('pretix',"SELECT count(*) FROM pg_roles WHERE rolname='dd_local_admin';").strip()!='0' else 'CREATE'
 sql('pretix',f"{command} ROLE dd_local_admin LOGIN SUPERUSER CREATEDB CREATEROLE PASSWORD '{adminpw}';")
 admin='dd_local_admin'
 sql('pretix',"ALTER ROLE pretix RENAME TO dd_bootstrap_admin; ALTER ROLE dd_bootstrap_admin NOLOGIN;")
private=root/'infra/local';private.mkdir(parents=True,exist_ok=True);private.chmod(0o700)
def save(name,text):
 p=private/name;p.write_text(text);p.chmod(0o600)
 if 'SUDO_UID' in os.environ:os.chown(p,int(os.environ['SUDO_UID']),int(os.environ['SUDO_GID']))
def url(role,db):return f'postgresql://{role}:{passwords[role]}@127.0.0.1:5433/{db}'
shared={'DD_MODE':'development','MAIL_DELIVERY':'capture','PAYMENT_ENVIRONMENT':'sandbox'}
keys=saved['keys'];internal=saved['internal']
for site,port,origin in [('primary',3011,'http://127.0.0.1:4321'),('booking',3012,'http://127.0.0.1:3000')]:
 env={**shared,'SERVICE_SITE':site,'PORT':str(port),'ALLOWED_ORIGINS':origin,'MARKETING_ACTION_BASE_URL':origin,'MARKETING_DATABASE_URL':url(site+'_marketing_runtime','marketing'),'PAYLOAD_KEY':keys[site],'CAPTURE_DIRECTORY':str(private/'capture'/site)}
 if site=='booking':env['BOOKING_MARKETING_BEARER']=internal
 save(site+'-communications.env',''.join(k+'='+v+'\n' for k,v in env.items()))
# Read only permitted existing booking config. Never copy SMTP/legacy DB credentials.
old={}
p=root/'apps/booking/.env.local'
if p.exists():
 for line in p.read_text().splitlines():
  if '=' in line and not line.startswith('#'):
   k,v=line.split('=',1)
   if k.startswith('PRETIX_') or k.startswith('NEXT_PUBLIC_') or k in ['BOOKING_SELF_SERVICE_ENABLED','MANAGE_RECOVERY_HASH_KEY','MANAGE_PREVIEW_SIGNING_KEY']:old[k]=v
old.update(shared);old.update({'BOOKING_DATABASE_URL':url('booking_web_runtime','booking_management'),'BOOKING_PUBLIC_BASE_URL':'http://127.0.0.1:3000','BOOKING_COMMUNICATIONS_URL':'http://127.0.0.1:3012','BOOKING_MARKETING_BEARER':internal,'PAYLOAD_KEY':keys['management'],'CONTACT_BOOKING_ORIGIN':'http://127.0.0.1:3000','BOOKING_SELF_SERVICE_ENABLED':'false'})
save('booking-web.env',''.join(k+'='+v+'\n' for k,v in old.items()))
worker={k:v for k,v in old.items() if k.startswith('PRETIX_') and 'WRITE' not in k and 'WEBHOOK' not in k}
worker.update(shared);worker.update({'BOOKING_DATABASE_URL':url('booking_worker_runtime','booking_management'),'BOOKING_PUBLIC_BASE_URL':'http://127.0.0.1:3000','PAYLOAD_KEY':keys['management'],'CAPTURE_DIRECTORY':str(private/'capture'/'worker'),'MANAGE_RECOVERY_HASH_KEY':old.get('MANAGE_RECOVERY_HASH_KEY',secrets.token_hex(32))})
save('booking-worker.env',''.join(k+'='+v+'\n' for k,v in worker.items()))
save('migration.env',''.join(role.upper()+'_DATABASE_URL='+url(role,'pretix' if role.startswith('pretix') else 'booking_management' if role.startswith('booking_management') else 'marketing')+'\n' for role in roles if role.endswith('_migrator')))
save('operator.env',''.join(site.upper()+'_DATABASE_URL='+url(site+'_marketing_operator','marketing')+'\n' for site in ['primary','booking']))
save('backup.env','BACKUP_DATABASE_URL='+url('dd_backup','postgres')+'\n')
save('admin.env','LOCAL_ADMIN_PASSWORD='+adminpw+'\nRESTORE_DATABASE_URL=postgresql://dd_local_admin:'+adminpw+'@127.0.0.1:5433/postgres\nRESTORE_INTEGRATIONS=disabled\n')
# Root compose interpolation is private. Keep existing postgres password only for PG bootstrap env.
p=root/'.env';text=p.read_text() if p.exists() else '';text+='\nPRETIX_RUNTIME_PASSWORD='+passwords['pretix_runtime']+'\nPRETIX_MIGRATION_PASSWORD='+passwords['pretix_migrator']+'\n';p.write_text(text);p.chmod(0o600)
if 'SUDO_UID' in os.environ:os.chown(private,int(os.environ['SUDO_UID']),int(os.environ['SUDO_GID']));os.chown(p,int(os.environ['SUDO_UID']),int(os.environ['SUDO_GID']))
print('Scoped roles, marketing schemas and management database provisioned. Private process env files written. Old app roles retired. No events or volumes removed.')
