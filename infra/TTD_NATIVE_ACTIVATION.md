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
   credentials. `DCP` is a Bash array to keep the fixed Compose paths exact.

```bash
DCP=(sudo docker compose --env-file /etc/dd-hosted/compose.env -f /etc/dd-hosted/compose.production.yaml)
"${DCP[@]}" exec -T pretix mkdir -p /tmp/ttd-native-review
"${DCP[@]}" cp infra/configure-ttd-checkout.py pretix:/tmp/ttd-native-review/configure-ttd-checkout.py
"${DCP[@]}" cp infra/ttd-checkout-settings.json pretix:/tmp/ttd-native-review/ttd-checkout-settings.json
"${DCP[@]}" cp infra/configure-ttd-event-emails.py pretix:/tmp/ttd-native-review/configure-ttd-event-emails.py
"${DCP[@]}" cp infra/ttd-event-email-settings.json pretix:/tmp/ttd-native-review/ttd-event-email-settings.json
"${DCP[@]}" exec -T -w /pretix/src pretix python /tmp/ttd-native-review/configure-ttd-checkout.py
"${DCP[@]}" exec -T -w /pretix/src pretix python /tmp/ttd-native-review/configure-ttd-event-emails.py
```

4. Review the inspection output. Only after the owner approves each native package,
   run its corresponding command (these are independent activations):

```bash
"${DCP[@]}" exec -T -w /pretix/src pretix python /tmp/ttd-native-review/configure-ttd-checkout.py --apply
"${DCP[@]}" exec -T -w /pretix/src pretix python /tmp/ttd-native-review/configure-ttd-event-emails.py --apply
```

5. Repeat both inspection commands. Inspect actual effective settings/templates
   in both ticket events and studio. Verify real response CSP and card behavior,
   native/app mail routes, approved inbox delivery and functional links/attachments.
   Then follow TTD_HUMAN_ACCEPTANCE.md one owner-performed scenario at a time.

These commands are prepared for review, not authorization to run them. No hosted
settings, templates, release or approval gates were changed by this local work.
