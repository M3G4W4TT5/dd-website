#!/usr/bin/env python3
"""Isolated real-Compose regression for mounted files, rotation and proxy routes.

Run as a user with Docker access. Uses a unique project with no published ports,
separate ephemeral files and no shared volumes; it never addresses dd-platform.
The owner installer path is covered separately by apply-hosted-release.test.py.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import uuid

HERE = Path(__file__).resolve().parent

BOOKING = '''import http from 'node:http';
const password=process.env.WEBHOOK_PASSWORD,version=process.env.VERSION;
http.createServer((req,res)=>{
 const path=new URL(req.url,'http://local').pathname;
 if(path==='/api/manage/pretix-webhook'){
  if(req.headers.authorization!==`Basic ${Buffer.from('dd-booking:'+password).toString('base64')}`){res.writeHead(401);res.end();return;}
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
   try{const p=JSON.parse(body);res.writeHead(p.notification_id?200:400);}catch{res.writeHead(400);}res.end();
  });return;
 }
 if(path==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true}');return;}
 if(path==='/api/availability'&&version==='old'){res.writeHead(503);res.end();return;}
 if(path==='/api/availability'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({source:'pretix',slots:Array(14).fill({})}));return;}
 if(path==='/ip'){res.writeHead(200,{'x-observed-ip':req.headers['x-real-ip']||''});res.end();return;}
 if(path==='/'){res.writeHead(200,{'x-runtime-version':version});res.end('booking');return;}
 res.writeHead(404);res.end();
}).listen(3000,'0.0.0.0');
'''

COMPOSE = '''name: {project}
services:
  booking:
    image: node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
    user: "10001:10001"
    command: [node, --env-file=/run/secrets/runtime, /app/booking.mjs]
    volumes: ["{root}/booking.mjs:/app/booking.mjs:ro"]
    secrets:
      - source: booking-runtime
        target: runtime
    networks:
      ingress: {{}}
      booking-internal: {{}}
      webhook-destination: {{ipv4_address: 172.27.0.2}}
  booking-communications:
    image: node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
    command: [node, -e, "require('http').createServer((q,r)=>{{r.end('communications')}}).listen(3012,'0.0.0.0')"]
    networks: [ingress]
  pretix:
    image: pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02
    entrypoint: [python3, -m, http.server, "80", --bind, 0.0.0.0]
    volumes: ["{root}/pretix-settings.py:/pretix/src/production_settings.py:ro"]
    networks:
      ingress: {{}}
      webhook-producer: {{ipv4_address: 172.26.0.2}}
  proxy:
    image: nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
    group_add: ["10006"]
    volumes: ["{root}/proxy.conf:/etc/nginx/conf.d/default.conf:ro"]
    secrets: [booking-ingress-header]
    networks: [ingress, booking-internal]
  pretix-webhook-relay:
    image: nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
    user: "101:101"
    group_add: ["10006"]
    volumes: ["{root}/pretix-webhook-relay.conf:/etc/nginx/conf.d/default.conf:ro"]
    secrets: [pretix-webhook-header]
    networks:
      webhook-producer: {{ipv4_address: 172.26.0.3}}
      webhook-destination: {{ipv4_address: 172.27.0.3}}

networks:
  ingress: {{}}
  booking-internal: {{}}
  webhook-producer:
    internal: true
    ipam: {{config: [{{subnet: 172.26.0.0/29, gateway: 172.26.0.1}}]}}
  webhook-destination:
    internal: true
    ipam: {{config: [{{subnet: 172.27.0.0/29, gateway: 172.27.0.1}}]}}
secrets:
  booking-ingress-header: {{file: "{root}/secrets/ingress-header.conf"}}
  booking-runtime: {{file: "{root}/secrets/booking.env"}}
  pretix-webhook-header: {{file: "{root}/secrets/webhook-header.conf"}}
'''


def run(*args, input=None, check=True):
    command = args  # Docker permission must already exist; never escalate fixture runs.
    result = subprocess.run(command, input=input, text=True, capture_output=True,
                            timeout=240, check=False)
    if check and result.returncode:
        # This harness uses only synthetic fixtures, but still bound and redact
        # diagnostics so a copied command cannot reveal fixture credentials.
        detail = (result.stderr or result.stdout)[-1200:].replace('a' * 64, '[redacted]').replace('b' * 64, '[redacted]')
        raise RuntimeError('isolated command failed: ' + args[0] + ' exit ' + str(result.returncode) + ': ' + detail)
    return result


def write_atomic(path, body, mode=0o644, gid=None):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        stream.write(body)
        os.fchmod(stream.fileno(), mode)
        if gid is not None and os.geteuid() == 0:
            os.fchown(stream.fileno(), 0, gid)
        temporary = Path(stream.name)
    if gid is not None and os.geteuid() != 0:
        run('docker', 'run', '--rm', '--user', '0:0',
            '--mount', 'type=bind,src=' + str(temporary) + ',dst=/target',
            '--entrypoint', 'chown', 'pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02',
            '0:' + str(gid), '/target')
    temporary.replace(path)


def header(password):
    return ('proxy_set_header Authorization "Basic ' +
            base64.b64encode(('dd-booking:' + password).encode()).decode() + '";\n').encode()


def cid(compose, service):
    return run(*compose, 'ps', '-q', service).stdout.strip()


def image_id(container):
    return run('docker', 'inspect', '--format', '{{.Image}}', container).stdout.strip()


def mounted_hash(container, path):
    return run('docker', 'exec', container, 'sha256sum', path).stdout.split()[0]


def request(project, url, method='GET', host='booking.didde-mie.com', claimed_ip=''):
    script = '''import urllib.request,urllib.error,sys
headers={'Host':sys.argv[3],'Content-Type':'application/json'}
if sys.argv[4]: headers['CF-Connecting-IP']=sys.argv[4]
request=urllib.request.Request(sys.argv[1],data=(b'{}' if sys.argv[2]=='POST' else None),method=sys.argv[2],headers=headers)
try:
 response=urllib.request.urlopen(request,timeout=8)
 print(response.status, response.headers.get('X-Observed-IP',response.headers.get('X-Runtime-Version','')))
except urllib.error.HTTPError as error:
 print(error.code,'')
'''
    result = run('docker', 'exec', project + '-pretix-1', 'python3', '-c', script, url, method, host, claimed_ip)
    pieces = result.stdout.strip().split(' ', 1)
    return int(pieces[0]), pieces[1] if len(pieces) > 1 else ''


def wait_request(project, url, expected, method='GET', host='booking.didde-mie.com'):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            result = request(project, url, method, host)
            if result[0] == expected:
                return result
        except RuntimeError:
            pass
        time.sleep(0.3)
    raise AssertionError('Isolated route did not reach expected status')


def main():
    project = 'dd-upgrade-' + uuid.uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix=project + '-') as directory:
        root = Path(directory)
        root.chmod(0o755)
        secret = root / 'secrets'
        secret.mkdir(mode=0o711)
        (root / 'booking.mjs').write_text(BOOKING)
        (root / 'pretix-webhook-relay.conf').write_bytes((HERE / 'pretix-webhook-relay.conf').read_bytes())
        write_atomic(secret / 'ingress-header.conf', b'proxy_set_header X-DD-Booking-Ingress-Key "synthetic";\n', 0o440, 10006)
        (root / 'proxy.conf').write_bytes((HERE / 'proxy.conf').read_bytes())
        (root / 'pretix-settings.py').write_bytes((HERE / 'pretix-settings.py').read_bytes())
        old, new = 'a' * 64, 'b' * 64
        write_atomic(secret / 'booking.env', ('VERSION=old\nWEBHOOK_PASSWORD=' + old + '\n').encode())
        write_atomic(secret / 'webhook-header.conf', header(old), 0o440, 10006)
        (root / 'compose.yaml').write_text(COMPOSE.format(project=project, root=root))
        compose = ('docker', 'compose', '--project-name', project, '-f', str(root / 'compose.yaml'))
        try:
            run(*compose, 'up', '-d', '--wait', '--wait-timeout', '120')
            before = {service: cid(compose, service) for service in ('booking', 'pretix', 'proxy', 'pretix-webhook-relay')}
            images = {service: image_id(container) for service, container in before.items()}
            wait_request(project, 'http://proxy:8080/', 200)
            private_access = '''import os,requests,urllib3
os.environ['DJANGO_SETTINGS_MODULE']='production_settings'
import django
django.setup()
from django.conf import settings
assert settings.ALLOW_HTTP_TO_PRIVATE_NETWORKS is False
session=requests.Session(); session.trust_env=False
assert session.post('http://pretix-webhook-relay:8081/api/manage/pretix-webhook',data=b'{}',timeout=5).status_code==400
assert session.post('http://pretix-webhook-relay:8081/api/manage/pretix-webhook',json={'notification_id':'fixture'},timeout=5).status_code==200
try: session.get('http://booking:3000/api/health',timeout=5)
except (requests.exceptions.RequestException, urllib3.exceptions.HTTPError) as error: assert 'blocked' in str(error)
else: raise AssertionError('Unrelated private HTTP target was accepted')
print('PASS pinned Pretix private HTTP exception')
'''
            assert 'PASS pinned Pretix private HTTP exception' in run(
                'docker', 'exec', project + '-pretix-1', 'python3', '-c', private_access).stdout
            actual_ip = run('docker', 'inspect', '--format',
                            '{{(index .NetworkSettings.Networks "' + project + '_ingress").IPAddress}}',
                            project + '-pretix-1').stdout.strip()
            observed = request(project, 'http://proxy:8080/ip', claimed_ip='203.0.113.9')
            assert observed == (200, actual_ip), (observed, actual_ip)
            assert request(project, 'http://proxy:8080/api/availability')[0] == 503
            wait_request(project, 'http://proxy:8080/', 200, host='checkout.didde-mie.com')
            assert request(project, 'http://pretix-webhook-relay:8081/api/manage/pretix-webhook', 'POST')[0] == 400
            proxy_detail=json.loads(run('docker','inspect',before['proxy']).stdout)[0]
            assert not any(m.get('Destination')=='/run/secrets/pretix-webhook-header' for m in proxy_detail['Mounts'])
            peer_probe="""import urllib.request,urllib.error,sys
try:
 response=urllib.request.urlopen(urllib.request.Request(sys.argv[1],data=b'{}',method='POST'),timeout=3)
 raise SystemExit(1)
except urllib.error.HTTPError as error:
 raise SystemExit(0 if error.code in (403,404) else 1)
except urllib.error.URLError:raise SystemExit(0)
"""
            for peer,network,ip,url in (
                ('communications','ingress',None,'http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('worker','ingress',None,'http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('primary','ingress',None,'http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('public-proxy','booking-internal',None,'http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('destination-only','webhook-destination',None,'http://172.27.0.3:8081/api/manage/pretix-webhook'),
                ('destination-cross-interface','webhook-destination',None,'http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('wrong-producer','webhook-producer','172.26.0.4','http://172.26.0.3:8081/api/manage/pretix-webhook'),
                ('old-public-injector','ingress',None,'http://proxy:8081/api/manage/pretix-webhook')):
                args=['docker','run','--rm','--name',project+'-'+peer+'-fixture','--network',project+'_'+network]
                if ip:args+=['--ip',ip]
                run(*args,'--entrypoint','python3','pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02','-c',peer_probe,url)
            # Root-only plus proxy group: an unprivileged host identity cannot read it.
            denied = run('docker', 'run', '--rm', '--user', '65534:65534',
                         '--mount', 'type=bind,src=' + str(secret / 'webhook-header.conf') + ',dst=/target,readonly',
                         '--entrypoint', 'test', 'pretix/standalone:2026.7.0@sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02', '-r', '/target', check=False)
            assert denied.returncode != 0
            write_atomic(secret / 'booking.env', ('VERSION=new\nWEBHOOK_PASSWORD=' + new + '\n').encode())
            write_atomic(secret / 'webhook-header.conf', header(new), 0o440, 10006)
            write_atomic(root / 'pretix-settings.py', (HERE / 'pretix-settings.py').read_bytes() + b'\n# recreated\n')
            # Ordinary up has an unchanged Compose hash and retains old mounts.
            run(*compose, 'up', '-d', '--no-deps', 'booking', 'pretix', 'proxy', 'pretix-webhook-relay')
            assert all(cid(compose, service) == before[service] for service in before)
            assert request(project, 'http://proxy:8080/api/availability')[0] == 503
            # Deliberately interrupt between booking and proxy recreation.
            run(*compose, 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'booking')
            assert request(project, 'http://pretix-webhook-relay:8081/api/manage/pretix-webhook', 'POST')[0] == 401
            run(*compose, 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'pretix')
            run(*compose, 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'proxy')
            run(*compose, 'up', '-d', '--no-deps', '--force-recreate', '--wait', 'pretix-webhook-relay')
            after = {service: cid(compose, service) for service in before}
            assert all(after[service] != before[service] for service in before)
            assert all(image_id(after[service]) == images[service] for service in before)
            assert mounted_hash(after['pretix'], '/pretix/src/production_settings.py') == hashlib.sha256(
                (HERE / 'pretix-settings.py').read_bytes() + b'\n# recreated\n').hexdigest()
            wait_request(project, 'http://proxy:8080/api/availability', 200)
            wait_request(project, 'http://pretix-webhook-relay:8081/api/manage/pretix-webhook', 400, 'POST')
            print('PASS isolated Compose: pinned Pretix, atomic mounts, explicit recreation, credential denial and retry, image preservation, proxy routing')
        except Exception:
            for service in ('booking', 'pretix', 'proxy', 'pretix-webhook-relay'):
                container = cid(compose, service)
                if container:
                    state = run('docker', 'inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', container,
                                check=False).stdout.strip()
                    log = run('docker', 'logs', '--tail', '8', container, check=False).stderr[-500:]
                    print('fixture_diagnostic', service, state, log.replace(old, '[redacted]').replace(new, '[redacted]'))
            print('fixture_dns', run('docker', 'exec', project + '-pretix-1', 'getent', 'hosts', 'proxy', check=False).stdout.strip())
            print('fixture_proxy_local', run('docker', 'exec', project + '-proxy-1', 'wget', '-S', '-O', '/dev/null',
                                            'http://127.0.0.1:8080/', check=False).stderr[-500:])
            print('fixture_nginx_test', run('docker', 'exec', project + '-proxy-1', 'nginx', '-t',
                                            check=False).stderr[-500:])
            print('fixture_proxy_process', run('docker', 'exec', project + '-proxy-1', 'ps', check=False).stdout[-500:])
            print('fixture_proxy_listen', run('docker', 'exec', project + '-proxy-1', 'sh', '-c',
                                               "nginx -T 2>/dev/null | grep 'listen 8080'", check=False).stdout[-500:])
            raise
        finally:
            run(*compose, 'down', '--volumes', '--remove-orphans', check=False)


if __name__ == '__main__':
    main()
