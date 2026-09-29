#!/usr/bin/env python3
"""Owner-only primary setup/release. Never redeploys booking or provisions its roles."""
import fcntl
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import secrets
import subprocess
import sys
import tempfile

ROOT = Path('/etc/dd-hosted')
STATE = Path('/var/lib/dd-hosted')
HERE = Path(__file__).resolve().parent
PRIMARY_FILES = ('compose.primary.yaml', 'proxy.primary.conf', 'primary-routes.inc')
PREFIX = 'ghcr.io/m3g4w4tt5/dd-website-communications@sha256:'
ROLES = ('primary_marketing_runtime', 'primary_marketing_migrator', 'primary_marketing_operator')
PHASE = 'arguments'

def phase(name):
    global PHASE
    PHASE = name

def run(args, env=None, input=None):
    result = subprocess.run(args, env=env, input=input, text=True, capture_output=True, timeout=300)
    if result.returncode:
        raise ValueError('Bounded command failed: ' + str(result.returncode))
    return result.stdout.strip()

def put(path, body, uid=0, mode=0o600):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
        os.fchmod(out.fileno(), mode)
        out.write(body.encode())
        temp = out.name
    os.chown(temp, uid, uid)
    os.replace(temp, path)

def trusted(path, uid=0):
    metadata = path.lstat()
    if path.is_symlink() or metadata.st_uid != uid or metadata.st_mode & 0o022:
        raise ValueError('Unsafe operational file: ' + path.name)

def psql_result(sql):
    phase('primary-database-inspection')
    password_file = ROOT / 'secrets/postgres-admin-password'
    # Bootstrap deliberately owns this bind-mounted secret by PostgreSQL's UID.
    postgres_uid = int(run(['docker','exec','dd-hosted-postgres-1','id','-u','postgres']))
    phase('database-private-file-ownership')
    trusted(password_file, postgres_uid)
    password = password_file.read_text().strip()
    if not re.fullmatch('[a-f0-9]{64}', password): raise ValueError('Private database credential format differs')
    temporary = '/tmp/dd-primary-' + secrets.token_hex(12)
    base = ['docker','exec','-i','dd-hosted-postgres-1']
    run(base + ['sh','-c','umask 077; cat > '+temporary], input='127.0.0.1:5432:*:dd_admin:'+password+'\n')
    try:
        return subprocess.run(base + ['env','PGPASSFILE='+temporary,'psql','-h','127.0.0.1','-X','-qAt',
                '-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-U','dd_admin','-d','marketing'],input=sql,text=True,capture_output=True,timeout=30)
    finally:
        run(base + ['rm','-f',temporary])

def psql(sql):
    result = psql_result(sql)
    if result.returncode:
        code = re.search(r'ERROR:\s+([A-Z0-9]{5})(?:\s|$)', result.stderr)
        phase('database-sqlstate-'+code.group(1) if code else 'database-connection-failed')
        raise ValueError('Private database query failed')
    phase('database-query-complete')
    return result.stdout.strip()

def applications():
    phase('booking-container-identity')
    result = {}
    for name in ('booking', 'booking-communications', 'booking-worker'):
        data = json.loads(run(['docker', 'inspect', 'dd-hosted-' + name + '-1']))[0]
        image = json.loads(run(['docker', 'image', 'inspect', data['Image']]))[0]
        result[name] = {'id': data['Id'], 'image_id': data['Image'], 'image': data['Config']['Image'],
                        'revision': image['Config'].get('Labels', {}).get('org.opencontainers.image.revision')}
    return result

def current_booking():
    phase('booking-release-record')
    data = json.loads((STATE / 'current.json').read_text())
    phase('installed-booking-helper')
    installed = runpy.run_path('/usr/local/sbin/dd-deploy')
    phase('booking-manifest-validation')
    installed['validate_manifest'](data)
    phase('booking-configuration-identity')
    if installed['config_version'](ROOT) != data['config_version'] or (STATE / 'failed.json').exists():
        raise ValueError('Booking host state is not a verified current release')
    before = applications()
    for target, name in (('booking', 'booking'), ('communications', 'booking-communications'), ('worker', 'booking-worker')):
        if before[name]['revision'] != data['commit'] or before[name]['image'] != data['images'][target]:
            raise ValueError('Running booking images differ from current release')
    return data, before

def inspect():
    current, apps = current_booking()
    sql = """SELECT json_build_object('roles', (SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper)) FROM pg_roles WHERE rolname LIKE 'primary_marketing_%'),
      'schema_owner',(SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='primary_marketing'),
      'tables',(SELECT count(*) FROM pg_tables WHERE schemaname='primary_marketing'),
      'primary_can_read_booking',has_schema_privilege('primary_marketing_runtime','booking_marketing','USAGE'),
      'booking_can_read_primary',has_schema_privilege('booking_marketing_runtime','primary_marketing','USAGE'),
      'backup_missing_table_select',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='primary_marketing' AND CASE WHEN c.relkind='r' THEN NOT has_table_privilege('dd_backup',c.oid,'SELECT') ELSE false END),
      'backup_missing_sequence_select',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='primary_marketing' AND CASE WHEN c.relkind='S' THEN NOT has_sequence_privilege('dd_backup',c.oid,'SELECT') ELSE false END));"""
    print(json.dumps({'booking_commit': current['commit'], 'host_config_version': current['config_version'],
                      'booking_images': apps, 'primary': json.loads(psql(sql))}, indent=2))

def configuration(image, revision, source=HERE):
    if not re.fullmatch(re.escape(PREFIX) + '[a-f0-9]{64}', image) or not re.fullmatch('[a-f0-9]{40}', revision):
        raise ValueError('An immutable communications image and source revision are required')
    return {'image': image, 'revision': revision,
            'files': {name: hashlib.sha256((source / name).read_bytes()).hexdigest() for name in PRIMARY_FILES}}

def arguments(current, image):
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root', 'DD_SECRET_DIRECTORY': str(ROOT / 'secrets'),
           'DD_BOOKING_IMAGE': current['images']['booking'], 'DD_COMMUNICATIONS_IMAGE': current['images']['communications'],
           'DD_WORKER_IMAGE': current['images']['worker'], 'DD_PRIMARY_COMMUNICATIONS_IMAGE': image}
    args = ['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.production.yaml'),
            '-f', str(ROOT / 'compose.hosted.yaml'), '-f', str(ROOT / 'compose.primary.yaml')]
    return args, env

def setup_runtime(image):
    phase('existing-primary-credential-registry')
    # The initial bootstrap already created primary schema/roles, then disabled their logins.
    # Adopt only those exact primary credentials; never run the shared provision job.
    registry = STATE / 'provisioning/provisioning-private.json'
    trusted(registry)
    passwords = json.loads(registry.read_text())['passwords']
    for role in ROLES:
        if not re.fullmatch('[a-f0-9]{64}', passwords.get(role, '')):
            raise ValueError('Existing primary credential registry is incomplete')
    expected = psql("SELECT count(*) FROM pg_roles WHERE rolname IN ('primary_marketing_runtime','primary_marketing_migrator','primary_marketing_operator') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls; SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='primary_marketing';")
    phase('existing-primary-role-ownership')
    if expected != '3\nprimary_marketing_migrator':
        raise ValueError('Inspect existing primary provisioning before applying setup')
    # Credentials remain the original primary values; only their LOGIN flag is enabled.
    psql('BEGIN;\n' + '\n'.join("ALTER ROLE " + role + " LOGIN PASSWORD '" + passwords[role] + "';" for role in ROLES) + '\nCOMMIT;')
    phase('primary-private-runtime-configuration')
    capture = STATE / 'primary-capture'
    capture.mkdir(mode=0o700, exist_ok=True)
    if capture.is_symlink(): raise ValueError('Unsafe capture directory')
    os.chown(capture, 10004, 10004); capture.chmod(0o700)
    path = ROOT / 'secrets/primary-communications.env'
    if path.exists():
        trusted(path, 10004)
        values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
        if values.get('SERVICE_SITE') != 'primary' or values.get('MAIL_RELEASE_ENABLED') != 'false':
            raise ValueError('Existing primary runtime differs')
    else:
        key_file = Path('/home/dd-owner/dd-primary-proxy-key')
        if key_file.exists():
            trusted(key_file, 1002)
            if key_file.stat().st_mode & 0o077: raise ValueError('Private proxy key file permissions differ')
            proxy_key = key_file.read_text().strip()
        else:
            proxy_key = getpass.getpass('Dedicated PRIMARY_PROXY_KEY (64 lowercase hex; also store as production Pages secret, hidden): ').strip()
        if not re.fullmatch('[a-f0-9]{64}', proxy_key): raise ValueError('Invalid private proxy key')
        values = {'DD_MODE':'production','SERVICE_SITE':'primary','HOST':'0.0.0.0','PORT':'3011',
                  'ALLOWED_ORIGINS':'https://didde-mie.com','MARKETING_ACTION_BASE_URL':'https://didde-mie.com',
                  'MARKETING_DATABASE_URL':'postgresql://primary_marketing_runtime:' + passwords['primary_marketing_runtime'] + '@postgres/marketing',
                  'PAYLOAD_KEY':secrets.token_hex(32),'PRIMARY_PROXY_KEY':proxy_key,'PAYMENT_ENVIRONMENT':'sandbox',
                  'MAIL_DELIVERY':'capture','MAIL_RELEASE_ENABLED':'false','MAIL_RECIPIENT_ALLOWLIST':'dev@memoryone.eu',
                  'CAPTURE_DIRECTORY':'/capture','TRUSTED_PROXY_IPS':''}
        put(path, ''.join(k+'='+v+'\n' for k,v in values.items()), 10004, 0o400)
    migrate = STATE / 'primary-migration.env'
    put(migrate, 'MIGRATION_DATABASE_URL=postgresql://primary_marketing_migrator:' + passwords['primary_marketing_migrator'] + '@postgres/marketing\n', 10004, 0o400)
    try:
        phase('primary-schema-migrations')
        run(['docker','run','--rm','--user','10004:10004','--network','dd-hosted_database','--mount','type=bind,src='+str(migrate)+',dst=/run/primary-migration,readonly',
             '--entrypoint','node',image,'--env-file=/run/primary-migration','--import','tsx','server/database/scripts/migrate.ts','primary'])
    finally:
        migrate.unlink(missing_ok=True)
    check_isolation()

def check_isolation():
    sql = """SELECT has_schema_privilege('primary_marketing_runtime','booking_marketing','USAGE') OR
      has_schema_privilege('booking_marketing_runtime','primary_marketing','USAGE') OR
      has_database_privilege('primary_marketing_runtime','booking_management','CONNECT') OR
      has_database_privilege('primary_marketing_runtime','pretix','CONNECT');
      SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='primary_marketing' AND
       ((CASE WHEN c.relkind='r' THEN NOT has_table_privilege('dd_backup',c.oid,'SELECT') ELSE false END) OR
        (CASE WHEN c.relkind='S' THEN NOT has_sequence_privilege('dd_backup',c.oid,'SELECT') ELSE false END));
      SELECT count(*) FROM primary_marketing.schema_migrations;"""
    output = psql(sql).splitlines()
    phase('primary-isolation-and-backup-grants')
    if len(output) != 3 or output[0:2] != ['f','0'] or int(output[2]) < 1:
        raise ValueError('Primary isolation or backup coverage failed')
    for role, forbidden in [('primary_marketing_runtime','booking_marketing'),('booking_marketing_runtime','primary_marketing')]:
        result = psql_result('SET ROLE '+role+'; SELECT 1 FROM '+forbidden+'.marketing_subscriptions LIMIT 1;')
        phase('primary-negative-schema-read')
        if result.returncode == 0 or not re.search(r'ERROR:\s+42501(?:\s|$)', result.stderr):
            raise ValueError('Negative cross-schema read failed')
    print('PASS primary schema migrations, negative cross-schema/database privileges and backup table/sequence coverage')

def release(image, revision, setup=False, source=HERE):
    current, before = current_booking()
    phase('primary-image-validation')
    trusted(source)
    for name in PRIMARY_FILES: trusted(source / name)
    candidate = configuration(image, revision, source)
    run(['docker','pull',image])
    actual = run(['docker','image','inspect','--format','{{ index .Config.Labels "org.opencontainers.image.revision" }}',image])
    if actual != revision: raise ValueError('Published primary image revision differs')
    if setup: setup_runtime(image)
    pin = ROOT / 'primary-image.json'
    old = json.loads(pin.read_text()) if pin.exists() else None
    # Preserve the exact prior configuration before replacing any mounted files.
    if old and old != candidate:
        trusted(pin)
        prior = STATE / 'primary-rollback'
        prior.mkdir(mode=0o700, exist_ok=True); trusted(prior)
        for name in PRIMARY_FILES:
            trusted(ROOT / name)
            if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != old['files'][name]:
                raise ValueError('Prior primary configuration identity differs')
            put(prior / name, (ROOT / name).read_text())
        put(STATE/'primary-previous.json',json.dumps(old)+'\n')
    phase('primary-configuration-install')
    for name in PRIMARY_FILES: put(ROOT / name, (source / name).read_text(), mode=0o644)
    put(pin, json.dumps(candidate)+'\n')
    put(STATE/'primary-attempt.json',json.dumps({**candidate,'status':'applying'})+'\n')
    args, env = arguments(current, image)
    run(args + ['config','--quiet'],env)
    phase('primary-container-readiness')
    # Only primary and proxy are reconciled; never apply the booking image manifest.
    run(args + ['--profile','primary','up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','--wait-timeout','180','primary-communications'],env)
    run(args + ['up','-d','--no-deps','--no-build','--pull','never','--force-recreate','proxy'],env)
    run(['docker','exec','dd-hosted-proxy-1','nginx','-t'])
    phase('booking-readiness-after-primary')
    installed = runpy.run_path('/usr/local/sbin/dd-deploy')
    installed['check_readiness'](args,env)
    if applications() != before: raise ValueError('Booking identity changed during primary release')
    state = json.loads(run(['docker','inspect','dd-hosted-primary-communications-1']))[0]
    if state['State'].get('Health',{}).get('Status') != 'healthy' or state['Config']['Image'] != image:
        raise ValueError('Primary is not healthy on the intended image')
    put(STATE/'primary-current.json',json.dumps({**candidate,'booking_preserved':before,'health':'healthy'})+'\n')
    put(STATE/'primary-attempt.json',json.dumps({**candidate,'status':'succeeded'})+'\n')
    print('PASS independent primary release '+revision+' '+image+'; booking images and container identities preserved')

def rollback():
    record = STATE / 'primary-previous.json'; trusted(record)
    previous = json.loads(record.read_text())
    source = STATE / 'primary-rollback'; trusted(source)
    # Read all prior bytes before release archives the current configuration.
    with tempfile.TemporaryDirectory(dir=STATE, prefix='primary-rollback-') as directory:
        copied = Path(directory)
        for name in PRIMARY_FILES:
            trusted(source / name)
            put(copied / name, (source / name).read_text())
        if configuration(previous['image'], previous['revision'], copied) != previous:
            raise ValueError('Rollback configuration differs')
        release(previous['image'], previous['revision'], source=copied)

def install_helpers():
    current, before = current_booking()
    attempt = json.loads((STATE/'attempt.json').read_text())
    if attempt.get('status') != 'succeeded' or attempt.get('manifest') != current:
        raise ValueError('Booking attempt record differs')
    # Update only the deployment helper, not the other existing host files.
    trusted(HERE)
    for name in ('deploy.py','apply-hosted-release.py','primary-release.py'):
        trusted(HERE / name)
    backup = STATE / 'primary-helper-backup'
    if not backup.exists():
        backup.mkdir(mode=0o700)
        put(backup/'dd-deploy',Path('/usr/local/sbin/dd-deploy').read_text(),mode=0o700)
        put(backup/'current.json',json.dumps(current)+'\n')
        put(backup/'attempt.json',json.dumps(attempt)+'\n')
    put(Path('/usr/local/sbin/dd-deploy'),(HERE/'deploy.py').read_text(),mode=0o755)
    for name in ('apply-hosted-release.py','primary-release.py', *PRIMARY_FILES):
        put(Path('/usr/local/lib/dd-hosted')/name,(HERE/name).read_text(),mode=0o700)
    updated = {**current,'config_version':runpy.run_path('/usr/local/sbin/dd-deploy')['config_version'](ROOT)}
    if applications() != before: raise ValueError('Booking images changed during helper installation')
    put(STATE/'current.json',json.dumps(updated)+'\n')
    put(STATE/'attempt.json',json.dumps({**attempt,'manifest':updated})+'\n')
    print('PASS host helper/configuration record updated; booking image manifest preserved; host_config_version='+updated['config_version'])

def controlled_mail():
    path = ROOT/'secrets/primary-communications.env'; trusted(path,10004)
    values = dict(line.split('=',1) for line in path.read_text().splitlines() if '=' in line)
    if values.get('MAIL_RELEASE_ENABLED')!='false' or values.get('SERVICE_SITE')!='primary':
        raise ValueError('Primary mail gates differ')
    if input('Confirm contact@didde-mie.com is an owner-controlled approved test inbox [type contact@didde-mie.com]: ').strip()!='contact@didde-mie.com':
        raise ValueError('Owner inbox approval required')
    password=getpass.getpass('Primary contact SMTP password (hidden): ').strip()
    newsletter=getpass.getpass('Primary newsletter SMTP password (hidden): ').strip()
    if not password or not newsletter or password==newsletter or any('\n' in x or '\r' in x for x in (password,newsletter)):
        raise ValueError('Distinct valid primary SMTP credentials required')
    for name in ('booking-communications.env','booking-worker.env'):
        booking=dict(line.split('=',1) for line in (ROOT/'secrets'/name).read_text().splitlines() if '=' in line)
        if booking.get('SMTP_PASSWORD') in (password,newsletter): raise ValueError('Booking SMTP credential reuse denied')
    values.update(SMTP_HOST='smtp.purelymail.com',SMTP_PORT='465',SMTP_USER='contact@didde-mie.com',SMTP_PASSWORD=password,
                  MARKETING_SMTP_USER='newsletter@didde-mie.com',MARKETING_SMTP_PASSWORD=newsletter,
                  MAIL_DELIVERY='controlled',MAIL_RELEASE_ENABLED='false',MAIL_RECIPIENT_ALLOWLIST='dev@memoryone.eu,contact@didde-mie.com')
    put(path,''.join(k+'='+v+'\n' for k,v in values.items()),10004,0o400)
    current=json.loads((STATE/'current.json').read_text()); pin=json.loads((ROOT/'primary-image.json').read_text())
    args,env=arguments(current,pin['image'])
    before=applications()
    run(args+['--profile','primary','up','-d','--no-deps','--no-build','--pull','never','--force-recreate','--wait','primary-communications'],env)
    run(args+['restart','proxy'],env)
    if applications()!=before: raise ValueError('Booking changed during controlled primary mail setup')
    print('PASS separate primary SMTP identities installed; controlled dev/contact recipients only; mail release false. Inbox authentication and sender-scope evidence remain required.')

def main():
    if os.geteuid()!=0: raise ValueError('Owner sudo required')
    if sys.argv[1:]==['inspect']: inspect(); return
    with (STATE/'deploy.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if sys.argv[1:]==['install-helpers']: install_helpers()
        elif sys.argv[1:]==['rollback']: rollback()
        elif len(sys.argv)==5 and sys.argv[1] in ('setup','release'):
            expected=sys.argv[4]
            if current_booking()[0]['config_version']!=expected: raise ValueError('Expected host configuration changed')
            release(sys.argv[2],sys.argv[3],sys.argv[1]=='setup')
        elif sys.argv[1:]==['controlled-mail']: controlled_mail()
        else: raise ValueError('Expected inspect | install-helpers | setup/release IMAGE REVISION HOST_CONFIG_VERSION | rollback | controlled-mail')

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Primary operation stopped: phase='+PHASE+'; category='+type(error).__name__+
              '. No secrets or raw provider/container output are printed.',file=sys.stderr)
        sys.exit(1)
