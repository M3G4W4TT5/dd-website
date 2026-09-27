#!/usr/bin/env bash
# Owner-run installation. The tunnel credential is entered privately on the VPS.
set -euo pipefail
if [[ $EUID -ne 0 ]]; then
  echo 'Run this installer through sudo as the VPS owner.' >&2
  exit 1
fi
if [[ -e /etc/systemd/system/dd-cloudflared.service || -e /etc/dd-cloudflared/token ]]; then
  echo 'Existing DD tunnel installation found; inspect it before reinstalling.' >&2
  exit 1
fi
if systemctl is-active --quiet cloudflared.service; then
  echo 'An existing cloudflared service is active; inspect it first.' >&2
  exit 1
fi
install -d -m 0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
chmod 0644 /usr/share/keyrings/cloudflare-main.gpg
printf '%s\n' 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' > /etc/apt/sources.list.d/cloudflared.list
apt-get update
apt-get install -y cloudflared
cloudflared tunnel run --help | grep -- '--token-file' > /dev/null
install -d -m 0700 /etc/dd-cloudflared
python3 - <<'PY'
import base64
import getpass
import json
import os

token = getpass.getpass('Paste ONLY the dd-hosted-sandbox tunnel token (hidden): ').strip()
try:
    payload = json.loads(base64.b64decode(token + '=' * (-len(token) % 4), validate=True))
    assert payload['t'] == '7c39829f-b117-4294-9424-bf422d88966f'
    assert payload['a'] == 'b259f8a4a84c2435819ed369102f3724'
    assert payload['s']
except Exception:
    raise SystemExit('Invalid token or token belongs to another tunnel. No credential saved.')
fd = os.open('/etc/dd-cloudflared/token', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(token)
print('Matching tunnel credential saved privately; value not displayed.')
PY
cat > /etc/systemd/system/dd-cloudflared.service <<'UNIT'
[Unit]
Description=DD private hosted sandbox Cloudflare Tunnel
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
DynamicUser=yes
LoadCredential=token:/etc/dd-cloudflared/token
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --loglevel warn --metrics 127.0.0.1:20245 run --token-file %d/token
Restart=on-failure
RestartSec=5s
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK
MemoryMax=256M
CPUQuota=50%
TasksMax=128
LogRateLimitIntervalSec=30s
LogRateLimitBurst=100

[Install]
WantedBy=multi-user.target
UNIT
chmod 0644 /etc/systemd/system/dd-cloudflared.service
systemd-analyze verify /etc/systemd/system/dd-cloudflared.service
systemctl daemon-reload
systemctl enable --now dd-cloudflared.service
cloudflared --version
systemctl is-active dd-cloudflared.service
echo 'Connector installed. Tunnel readiness must be verified; this does not deploy applications.'
