#!/usr/bin/env bash
# Owner-run host configuration installer. Does not install Docker or start apps.
set -euo pipefail
[[ "$EUID" == 0 ]] || { echo 'Run this installer as the owner using sudo.' >&2; exit 1; }
[[ "$#" == 1 ]] || { echo 'Usage: install-deployment.sh /path/to/ci-public-key.pub' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
key_file=$1
[[ -f "$key_file" ]] || { echo 'CI public key file is missing.' >&2; exit 1; }
ssh-keygen -l -f "$key_file" >/dev/null
[[ $(wc -l < "$key_file") == 1 ]] || { echo 'Supply exactly one public key line.' >&2; exit 1; }
[[ $(cut -d ' ' -f 1 "$key_file") == ssh-ed25519 ]] || { echo 'Supply an Ed25519 public key.' >&2; exit 1; }
[[ ! -e /etc/sudoers.d/dd-deploy && ! -e /etc/ssh/sshd_config.d/10-dd-deploy.conf ]] || {
 echo 'Deployment identity is already configured; review changes rather than overwriting.' >&2; exit 1;
}
if getent passwd dd-deploy >/dev/null; then
 echo 'dd-deploy already exists; inspect it before installing.' >&2
 exit 1
fi
install -d -m 755 -o root -g root /etc/dd-hosted
install -d -m 711 -o root -g root /etc/dd-hosted/secrets
install -d -m 700 -o root -g root /var/lib/dd-hosted
install -m 644 -o root -g root "$source_dir/compose.production.yaml" /etc/dd-hosted/compose.production.yaml
install -m 644 -o root -g root "$source_dir/compose.hosted.yaml" /etc/dd-hosted/compose.hosted.yaml
install -m 644 -o root -g root "$source_dir/proxy.conf" /etc/dd-hosted/proxy.conf
for config in pretix-nginx.conf pretix-settings.py pretix-task.conf; do
 install -m 644 -o root -g root "$source_dir/$config" "/etc/dd-hosted/$config"
done
install -m 750 -o root -g root "$source_dir/deploy.py" /usr/local/sbin/dd-deploy
adduser --disabled-password --gecos '' dd-deploy
install -d -m 755 -o root -g root /etc/ssh/authorized_keys
{ printf 'restrict,command="/usr/bin/sudo -n /usr/local/sbin/dd-deploy" '; cat "$key_file"; } \
 > /etc/ssh/authorized_keys/dd-deploy
chown root:root /etc/ssh/authorized_keys/dd-deploy
chmod 644 /etc/ssh/authorized_keys/dd-deploy
cat > /etc/ssh/sshd_config.d/10-dd-deploy.conf <<'EOF'
Match User dd-deploy
    AuthorizedKeysFile /etc/ssh/authorized_keys/dd-deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    DisableForwarding yes
    PermitTTY no
    PermitUserRC no
Match all
EOF
sudoers_temp=$(mktemp)
trap 'rm -f "$sudoers_temp"' EXIT
printf 'dd-deploy ALL=(root) NOPASSWD: /usr/local/sbin/dd-deploy ""\n' > "$sudoers_temp"
visudo -cf "$sudoers_temp"
install -m 440 -o root -g root "$sudoers_temp" /etc/sudoers.d/dd-deploy
/usr/sbin/sshd -t
systemctl reload ssh
echo 'Deployment identity installed. No applications started; readiness remains disabled.'
