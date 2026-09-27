# Public repository and hosted sandbox CI/CD

The authoritative repository remains public at `M3G4W4TT5/dd-website`, owned by
the existing personal account. Its owner now uses GitHub Pro. No transfer or
visibility change is planned. The private hosted booking scope and release gates
remain those in [HOSTED_SANDBOX_PLAN.md](HOSTED_SANDBOX_PLAN.md).

## Current evidence and boundaries

Read-only SSH succeeded as `dd-setup` on `85.190.108.73:22`. The VPS reported
Ubuntu 26.04.1 LTS, amd64, about 4 GiB RAM, no swap and 94 GiB free disk. After
owner installation, Docker 29.8.1 and Compose 5.5.1 were verified and Docker is
active. nginx and cloudflared were not found in the initial inspection.

The GitHub `hosted-sandbox` environment now exists with a selected-branch policy
allowing only `main`, `DEPLOY_HOST` and the locally trusted Ed25519 host-key record.
Repository variable `DEPLOY_ENABLED=false` is configured. The separate CI key is
stored locally outside Git and its private half was uploaded directly to
environment secret `DEPLOY_SSH_KEY`. The public key and five reviewed installer/
configuration files are staged under `/home/dd-setup/dd-deployment-setup` on the
VPS; transferred file checksums match the local files. The owner has installed the
deployment account. A live CI-key connection reached the root-owned forced
command and rejected invalid input. Requesting a shell command still invoked
the forced command, and a valid-shaped manifest was rejected because the owner
readiness marker is absent. `dd-deploy` has no TTY, forwarding or password login.
[PR #3](https://github.com/M3G4W4TT5/dd-website/pull/3) is merged at
`07110aeffffc649ab4d66dfcd34ae879f0802e65`. Main workflow run
[36335038509](https://github.com/M3G4W4TT5/dd-website/actions/runs/36335038509)
passed all checks and published all three images. Anonymous OCI manifest reads
for their exact digests succeeded from the VPS. Deployment was skipped because
`DEPLOY_ENABLED=false`; no application has been deployed.

The owner confirmed the key-restriction helper completed for `dd-owner` and
`dd-setup`, a fresh owner login succeeded and the provider firewall now permits
public IPv4 TCP 22. Fresh setup and CI-key connections were independently
verified after the change. CI still reaches only its forced deployment command.

The local SSH client has a system include with invalid ownership/permissions.
The explicit `-F /dev/null` commands bypass client configuration, preserve strict
host-key verification and do not alter that file.

The workflow checks code and builds booking, communications and worker images on
GitHub-hosted amd64 runners. It publishes only on `main` using `GITHUB_TOKEN`,
with commit labels, SBOMs and build provenance. No runtime secrets are build
inputs. The deploy job runs only when repository variable `DEPLOY_ENABLED=true`
and uses the `hosted-sandbox` environment. Its candidate manifest contains only
commit and three registry digest references; it is not deployment evidence.

The root-owned remote command accepts only those image repositories and digests,
checks image revision labels and serializes deployments. CI cannot upload shell
scripts or Compose files to be executed as root. It has deployment authority over
the application images, which can access their configured runtime credentials;
the deployment key must therefore be protected as production access.

Server config is owner-installed under `/etc/dd-hosted`; secret files are never
stored in Git, Actions artifacts or CI logs. The owner separately provisions
databases/migrations, private HTTPS ingress, capture, resource/connection/log
limits and runtime secrets before creating `/etc/dd-hosted/ready`. Do not create
that marker during the steps below. Schema migration automation is not yet
wired into the workflow. Do not claim this is a completed application deployment.

## 1. Owner: install Docker on the VPS

Log in from the local computer; keep that session open during SSH changes:

```bash
ssh -F /dev/null -i ~/.ssh/dd-vps-owner dd-owner@85.190.108.73
```

These VPS commands add Docker's official package source and install/start Docker,
Compose and Buildx. They do not start booking, change DNS or open firewall ports.
They follow [Docker's Ubuntu installation](https://docs.docker.com/engine/install/ubuntu/).

```bash
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: resolute
Components: stable
Architectures: amd64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
```

Do not add `dd-setup` or `dd-deploy` to the Docker group. Docker-published ports
can bypass host UFW rules; hosted configuration binds ingress to loopback and
does not publish database/application ports.

## 2. Generate a separate CI key locally — complete

The key at `~/.ssh/dd-vps-ci` already exists with private-file mode 0600. Its
private half is already in the GitHub environment secret. Do not regenerate or
overwrite it; the commands below document its creation.

Run on the local computer, never on the VPS or in the repository. Do not overwrite
an existing key. CI requires an unattended key, so leave this key's passphrase
empty; it gets a forced command and restricted account on the server.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/dd-vps-ci -C 'dd-vps-github-actions'
chmod 600 ~/.ssh/dd-vps-ci
```

Only `dd-vps-ci.pub` is uploaded to the VPS. The private key will go directly to
the GitHub environment secret, not chat or documentation.

## 3. Owner: install reviewed deployment files

Transfer is complete using the temporary setup account. The public key and
installer configuration are staged under `/home/dd-setup/dd-deployment-setup`;
the private key was not uploaded to the VPS. The next commands run in the owner's
VPS terminal. They copy the reviewed configuration into a root-owned directory,
install the deployment account and restricted sudo/SSH configuration, and reload
SSH. They do not start applications or open the firewall:

```bash
sudo install -d -m 700 /root/dd-deployment-setup
sudo cp -a /home/dd-setup/dd-deployment-setup/. /root/dd-deployment-setup/
sudo chown -R root:root /root/dd-deployment-setup
sudo bash /root/dd-deployment-setup/install-deployment.sh /root/dd-deployment-setup/dd-vps-ci.pub
sudo /usr/sbin/sshd -T -C user=dd-deploy,host=localhost,addr=127.0.0.1 | \
  grep -E '^(authorizedkeysfile|authenticationmethods|disableforwarding|permittty|passwordauthentication|kbdinteractiveauthentication) '
sudo -l -U dd-deploy
```

Expected: the root-owned authorized-key path, publickey authentication, no TTY or
forwarding, and exactly one passwordless sudo command with no arguments. The
installer stops rather than silently replacing an existing deployment identity.

On the observed sudo-rs version the owner's `sudo -l -U dd-deploy` invocation
reported a syntax error. Inspect the installed allowlist without using that
option parser:

```bash
sudo cat /etc/sudoers.d/dd-deploy
```

Expected exact rule: `dd-deploy ALL=(root) NOPASSWD: /usr/local/sbin/dd-deploy ""`.
Live CI-key testing independently confirmed the root-owned command can run.

Test locally that the forced command is reached and refuses incomplete hosting:

```bash
printf '{}\n' | ssh -F /dev/null -T -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -i ~/.ssh/dd-vps-ci dd-deploy@85.190.108.73
```

Expected nonzero exit with `Expected commit and images only`. This is an
intentional rejection, not a successful deployment. Keep the IP-only firewall
until the identity and SSH hardening checks below pass.

## 4. Restrict owner/setup keys before opening public SSH

The one.com firewall can allow public TCP port 22 for changing GitHub-runner IPs.
First verify effective password/root/keyboard-interactive authentication is
disabled globally. Restrict every permanent owner and temporary setup public key
to the owner's current public source address using `from="IP"` before its key
type in `authorized_keys`. Multiple allowed source addresses are comma-separated.
An ISP address change requires editing this via an existing session or recovery
console. Check the administrator account's keys too; do not assume it is disabled.

For example, an owner key line becomes:

```text
from="YOUR_PUBLIC_IPV4" ssh-ed25519 PUBLIC_KEY_BODY owner-comment
```

Do not put that restriction on the CI key; it already has a forced command and
GitHub runners change IP. After testing a fresh owner connection, add **IPv4,
TCP, source 0.0.0.0/0, destination port 22** in one.com's firewall and remove the
now-redundant narrow IPv4 TCP 22 rule. No “All protocols” rule, IPv6 SSH exposure,
application port or DNS change is needed for this IPv4-only pipeline.

The owner-run `infra/restrict-admin-keys.py` helper applies the `from` restriction
to existing keys for `dd-owner`, `dd-setup` and `administrator`, preserves other
key options and saves mode-0600 backups. It refuses existing source restrictions,
unknown formats and existing backup files rather than replacing them. The
observed current source IPv4 is `2.104.42.212`; recheck if the connection changes.

## 5. Configure GitHub

Branch protection is configured for `main`: pull requests and the GitHub Actions
checks `checks`, `images (booking)`, `images (communications)` and `images (worker)`
are required, with the branch up to date. Protection applies to administrators;
force pushes and deletion are blocked, and conversations must be resolved.
No second-person approval is required for the solo owner. An owner cannot approve
their own PR. Review bypass access deliberately if adding collaborators.

Environment `hosted-sandbox` and its selected-branch `main` policy are already
configured. Keep repository-level variable `DEPLOY_ENABLED=false` initially.
Environment variables are `DEPLOY_HOST=85.190.108.73` and
`DEPLOY_KNOWN_HOSTS`, containing the verified host public-key record for that IP.
`DEPLOY_SSH_KEY` is the environment secret.

For the verified host-key record, inspect the locally trusted entry:

```bash
ssh-keygen -F 85.190.108.73
```

Copy its actual host-key line, excluding the comment. A hashed hostname is valid.
Do not populate this by blindly trusting fresh `ssh-keyscan` output. Compare the
fingerprint with the provider console if trust is uncertain.

The private key secret, host variables and disabled deployment flag are already
configured. These commands document direct secret upload from the local file
using the authenticated GitHub CLI; there is no need to run them again:

```bash
gh secret set DEPLOY_SSH_KEY --repo M3G4W4TT5/dd-website \
  --env hosted-sandbox < ~/.ssh/dd-vps-ci
gh variable set DEPLOY_HOST --repo M3G4W4TT5/dd-website \
  --env hosted-sandbox --body '85.190.108.73'
gh variable set DEPLOY_ENABLED --repo M3G4W4TT5/dd-website --body 'false'
```

Set `DEPLOY_KNOWN_HOSTS` through the environment UI using the verified public
record above. No GitHub account password/PAT or runtime service secret is needed
by this workflow. The three published application images are anonymously
accessible at their exact digests from the VPS; no persistent registry credential
is needed. Verify this for any new package because public source alone does not
guarantee public package visibility.

## 6. Activation and operations

The reviewed workflow is merged. Image publication is not deployment.
Continue with [HOSTED_SETUP.md](HOSTED_SETUP.md). Provision the private hosted stack prerequisites, verify database
roles/migrations and image hygiene, confirm private Access ingress and capture,
then create the root-owned readiness marker. Only then set `DEPLOY_ENABLED=true`
and trigger the workflow on `main` for the first application deployment.

Applications are never built on the VPS. Database migrations and structural host
configuration changes remain explicit reviewed operations at this initial stage.
Failed health checks fail the deployment job; no container logs are dumped into
public CI and no automatic database rollback occurs. Inspect actual container
state privately, since a failed deployment can leave changed containers running.
Successful manifests are recorded as `/var/lib/dd-hosted/current.json` and
`previous.json`; these record application images, not database recovery points.
Image rollback requires checking schema compatibility before deploying a prior
manifest. The owner retains recovery access throughout.

After handover, revoke `dd-setup` access independently of CI. To revoke CI later,
remove its key from `/etc/ssh/authorized_keys/dd-deploy`, terminate active CI
sessions/processes and delete the GitHub environment secret. Do not remove your
owner account or disable SSH globally to revoke a single identity.
