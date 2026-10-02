# TTD native activation package — held for release approval

**1 October owner instruction:** deployment to the private VPS sandbox and
in-situ review are now authorized. This supersedes the historical predeployment
hold below. Follow PR/main checks and root-owned exact-release installation;
inspect effective native packages before applying them. No public-launch,
live-payment or unrestricted-mail authorization is implied.


Do not run these hosted commands during Step 6 review. Separate predeployment
review, reconciliation/verification and explicit owner release approval are all
required first. The application release does not activate these native changes.

## Reviewed files and boundaries

- `pretix-settings.py`: pinned 2026.7.0 presentation/card/email adapter, installed
  by the normal owner `apply-hosted-release.py install` process. Its reviewed
  SHA-256 is `6f5090eeb05be4460299bdec3fdcbc98604e2bb69eb0dfee965a1038779d4123`.
- `ttd-checkout-settings.json` + `configure-ttd-checkout.py`: separately approved
  event policy/region/colours; five whitelisted setting names, sandbox events only.
- `ttd-event-email-settings.json` + `configure-ttd-event-emails.py`: separately
  approved exact EN/DA phrase replacement in seven message types for each ticket
  event. URLs/placeholders, remaining text and other languages are preserved.
  Both activators default to inspection; all events are validated before writes.
  Email activation rejects drift from either the inspected before or reviewed
  after values. Inspect again immediately before applying; reconcile drift first.

Read-only browser inspection on 1 October found 40 text fields on each event,
independently compared equal; both effective renderers were Classic. The saved
snapshot contains 20 relevant localized fields per event. The email patch changes
14 localized fields per event (seven message types), including free/custom/approval
messages as well as placement, paid and resent links. Native cancellation/failure/
download reminder text and paid approval instructions remain unchanged.

Local native verification uses actual pinned middleware, StripeCC, settings ORM,
ClassicMailRenderer, Markdown/templates/inliner and the candidate adapter in an
isolated no-network temporary SQLite container. It creates no orders/payments or
mail sends. It does not establish delivery, ticket attachments, Stripe sessions,
wallet/saved-card/SCA completion or hosted release identity.

## Owner phases after approval

1. Follow normal reviewed PR/main and owner exact-release processes. Preserve all
   deployment, Access, sandbox and restricted-mail gates. Use the normal trusted
   root-owned host-config installation source, not an arbitrary checkout.
2. Install the reviewed adapter using the owner installer. Recreate both `pretix`
   and `pretix-cron`, then independently compare their mounted adapter checksums,
   pinned image identity and running application revisions to the approved release.
3. From the approved repository release directory, as dd-owner, stage only the
   settings package into the running web container. Commands below contain no
   credentials. Use the already verified running web container directly; the
   deployment helper supplies immutable image references and the hosted/primary
   Compose overlays, so do not reconstruct a partial Compose invocation.

```bash
sudo docker exec dd-hosted-pretix-1 mkdir -p /tmp/ttd-native-review
sudo docker cp infra/configure-ttd-checkout.py dd-hosted-pretix-1:/tmp/ttd-native-review/configure-ttd-checkout.py
sudo docker cp infra/ttd-checkout-settings.json dd-hosted-pretix-1:/tmp/ttd-native-review/ttd-checkout-settings.json
sudo docker cp infra/configure-ttd-event-emails.py dd-hosted-pretix-1:/tmp/ttd-native-review/configure-ttd-event-emails.py
sudo docker cp infra/ttd-event-email-settings.json dd-hosted-pretix-1:/tmp/ttd-native-review/ttd-event-email-settings.json
# docker cp preserves root-only staging permissions. Give only the pinned
# Pretix group read access to these four non-secret, root-owned package files.
sudo docker exec -u 0 dd-hosted-pretix-1 chown -R 0:15371 /tmp/ttd-native-review
sudo docker exec -u 0 dd-hosted-pretix-1 chmod 0750 /tmp/ttd-native-review
sudo docker exec -u 0 dd-hosted-pretix-1 sh -c 'chmod 0440 /tmp/ttd-native-review/*.py /tmp/ttd-native-review/*.json'
sudo docker exec -w /pretix/src dd-hosted-pretix-1 python /tmp/ttd-native-review/configure-ttd-checkout.py
sudo docker exec -w /pretix/src dd-hosted-pretix-1 python /tmp/ttd-native-review/configure-ttd-event-emails.py
```

4. Review the inspection output. Only after the owner approves each native package,
   run its corresponding command (these are independent activations):

```bash
sudo docker exec -w /pretix/src dd-hosted-pretix-1 python /tmp/ttd-native-review/configure-ttd-checkout.py --apply
sudo docker exec -w /pretix/src dd-hosted-pretix-1 python /tmp/ttd-native-review/configure-ttd-event-emails.py --apply
```

5. Repeat both inspection commands. Inspect actual effective settings/templates
   in both ticket events and studio. Verify real response CSP and card behavior,
   native/app mail routes, approved inbox delivery and functional links/attachments.
   Then follow TTD_HUMAN_ACCEPTANCE.md one owner-performed scenario at a time.

These commands are prepared for review, not authorization to run them. No hosted
settings, templates, release or approval gates were changed by this local work.


## 2 October rendering correction — approved release plan

The owner approved the correction release plan on 2 October after reviewing its
root cause, local correction and regression evidence. This authorizes PR/checks,
merge, owner configuration install and exact-digest sandbox release.
Both actual payment paths failed rendering; see TTD_CHECKOUT_REVIEW.md for the
verified root cause, final diff/evidence and release plan. Current installed adapter
is 6f5090ee; new reviewed candidate is `64bc655a068f0bbe501ca8dfd93ee38a2d154cf51f65aa064d32443e94e1dbbd`.
The installer accepts the verified old adapter baseline and retains current running
images during configuration installation. Current hosted/main application identity
6014e46 must be preserved or superseded only by a reviewed descendant. The normal
exact-digest release must reconcile the new host-config manifest after install.
No native event policy/email reactivation is necessary for this presentation fix.
Installed corrective identity and hosted behavior remain unverified until
installation and direct hosted checks. Payment acceptance remains owner-performed.
