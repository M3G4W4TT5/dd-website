# TTD Step 6 predeployment review — separate context handoff

## Owner release instruction — 1 October 2026

The owner explicitly authorized committing and pushing all candidate work and
deploying to the private VPS sandbox, with the planned review performed in situ
instead of a separate predeployment context. This supersedes the earlier hold
below; those entries are preserved as history. Required CI/PR/main and owner
installation processes still apply. Native settings/templates require fresh
effective inspection before activation. Access, sandbox payments, restricted
mail and public-launch gates remain intact. No hosted review or human acceptance
has passed yet. Application, native Pretix and provider identities/evidence must
be recorded separately after installation.

Fresh pre-push checks: 72 booking tests, 21 server tests, 5 adapter/settings tests,
1 response-CSP test, 3 native email tests and 9 mocked installer tests passed.
Existing final booking typecheck/build and isolated pinned Pretix runtime
evidence remain recorded below. Main still matches PR28 baseline be350a1.


## Latest candidate — desktop booking readability

This identity supersedes earlier candidates below; all review history is preserved.
Separate predeployment review, reconciliation and explicit owner approval remain
required before any push, PR, deployment or native activation.

- Exact commit: `36fba64a127f1983cd1d9436c40d27c2ae0f4709` on `codex/ttd-checkout-mobile`.
- Production booking build ID: `if-nibSY1tX8TWw1uy4jV`.
- Production candidate preview: http://127.0.0.1:3041/?lang=en (also ?lang=da).
- Contact: http://127.0.0.1:3041/contact?lang=en (also ?lang=da).
- Local email drafts: http://127.0.0.1:3040/ (local render evidence only).
- Latest change: `git diff f0beaa99b75675a4977ddaf2a4c7792b7d167d58 36fba64a127f1983cd1d9436c40d27c2ae0f4709`.
- Complete candidate: `git diff be350a1 36fba64a127f1983cd1d9436c40d27c2ae0f4709`; original implementation
  corrections: `git diff 961ee6d 36fba64a127f1983cd1d9436c40d27c2ae0f4709`.
- Implementation committed. Review document/log and candidate evidence remain
  uncommitted; original checkout has not been edited.

Review studio details label readability (17 px including Name/Email/Phone),
overview rows/studio facts (16 px), Total price label (17 px), larger 22 px icons,
removed Your studio time eyebrow and Overview alignment with the facts. At narrow
desktop widths facts stack alongside Overview to retain readable sizes. Inspect
both EN/DA and desktop widths 821, 1024 and 1440 px alongside existing mobile
journeys. Existing booking selection, pricing and field validation rules remain.
Fresh booking typecheck/build and desktop browser checks passed. No horizontal
overflow or title/fact overlap at 821 px in EN/DA; 1440 px heading and all facts
share the same vertical center. Desktop labels all measured 17 px. Screenshots:
`ttd-candidate/desktop-overview-readable.jpg`,
`ttd-candidate/desktop-details-readable.jpg`.

Earlier automated and isolated Pretix runtime evidence below remains distinct;
those suites were not rerun for this typography/layout-only change. Hosted and
real-phone human acceptance remains unverified. Keep hosted sandbox observations
separate from this local production build and the synthetic development fixtures.


## Latest candidate — desktop details and contact layout

This identity supersedes earlier candidates below; review history is preserved.
Separate predeployment review/reconciliation and explicit owner release approval
remain required. No push, PR, deployment or hosted activation occurred.

- Current commit: `f0beaa99b75675a4977ddaf2a4c7792b7d167d58`
- Current production build ID: `FtUisR8hPDn6Q_UM4zRhK`
- Preview: http://127.0.0.1:3041/?lang=en and
  http://127.0.0.1:3041/contact?lang=en (both also support ?lang=da).
- Latest owner changes: `git diff da760d4 f0beaa99b75675a4977ddaf2a4c7792b7d167d58`.
- Full review diff: `git diff be350a1 f0beaa99b75675a4977ddaf2a4c7792b7d167d58`.
- Implementation committed; review logs/evidence remain uncommitted.

Desktop studio details now remove the 04 / YOUR DETAILS eyebrow and use
Enter your details / Indtast dine oplysninger at that position (heading top margin
0 px). Desktop intro/payment reminder remain; compact mobile behavior is retained.
Contact removes the 01 / SEND A MESSAGE heading row and its adjacent arrow in
EN/DA on desktop/mobile. Contact layout top padding is 16 px, with measured
17 px from divider border to form; desktop two-column and mobile single-column
field layout retained. Submit-button arrow, field order, validation, privacy,
delivery and server behavior unchanged. No message submitted.

Fresh booking typecheck and production build passed; browser verified details
heading/eyebrow/top-margin at 1440 px in EN/DA, contact desktop at 1440×1000 and
mobile at 390×844, no mobile overflow, removed row and raised fields. Existing
72 booking and prior server/native test evidence below is preserved; those suites
were not rerun for this copy/spacing-only follow-up. Screenshots:
`ttd-candidate/desktop-details-heading.jpg`, `contact-desktop-compact.jpg`,
`contact-mobile-compact.jpg`. The temporary dev fixture component/style files
were refreshed to match this candidate.


## Current candidate — owner mobile refinements, 1 October 2026

This candidate supersedes the prepared 892b68b build below. Existing review
log/history is preserved; separate review and explicit release approval remain
pending.

- Current commit: `da760d44a12b3f24ec92d7f50558771210051acc`
- Current production build ID: `JgXXBXg-NuPa6sECrp_qJ`
- Preview remains http://127.0.0.1:3041/?lang=en (and ?lang=da).
- Exact follow-up diff: `git diff 892b68b da760d44a12b3f24ec92d7f50558771210051acc`.
- Complete baseline diff: `git diff be350a1 da760d44a12b3f24ec92d7f50558771210051acc`.
- Working-tree implementation is committed; review documents and evidence remain
  uncommitted as listed below. No hosted changes or push performed.

Mobile studio now loads visible-month availability in batches of four. Verified
no-times dates are red and disabled; loading/error dates are disabled with distinct
status, and Continue requires available times. Modification dates use available
starts for the retained duration and also block Continue when none exist. Start
hours that are unavailable are red. Start/end grids share 08:00–22:00 positions;
22:00 is a disabled start boundary, and end boundaries use existing quote rules.
Example: start 10:00, booked hour 12:00–13:00 permits end 12:00 but nothing later.
All invalid end boundaries are grey, including before the start and beyond a gap.

Mobile details remove the intro, divider and payment reminder; the form follows
the heading immediately. EN/DA checked, fields/consents retained, labels remain
17 px. Desktop retains original copy/reminder and label styling. Both one-hour
and multi-hour paths retain pricing/duration and compact layout.

Fresh verification: 72 booking tests, booking typecheck and production build
passed; fresh browser checks covered date disable/Continue, red start hour, exact
matching grids and grey disabled ends, EN/DA compact details, Back/Continue state
and modification calendar. Prior server/native results below remain separate
evidence; native package/adapter/server rules were not modified in this follow-up.
New screenshots: ttd-candidate/mobile-red-calendar.jpg, mobile-red-hours.jpg,
mobile-end-grid.jpg, mobile-details-compact.jpg and mobile-details-compact-da.jpg.

Status: **PENDING separate review. RELEASE HOLD.** Prepared 1 October 2026.
Do not infer approval from this document, passing tests or elapsed time. No push,
PR creation/merge, deployment or hosted adapter/settings/template activation until
(1) separate review finished, (2) findings reconciled and required corrections
verified, and (3) the owner explicitly approves proceeding. The separate review
of the existing hosted sandbox is distinct from final hosted acceptance of the
corrected release after installation.

## Exact candidate identity

- Worktree: `/home/megawatts/Projects/DD_website/dd-platform-ttd-checkout-mobile`
- Branch: `codex/ttd-checkout-mobile`
- PR28/main baseline: `be350a1d320136abdc1592b350e5f32257f91a17`
- Starting implementation: `961ee6d`
- Corrected local candidate commit: `892b68b04605a6099f19c1caa36d5ce6171b5dc3`
- Booking production Next build ID: `NDuWlv9KP8yBfxVrusiMQ`
- Build uses the candidate application source. It was built before the local
  commit was assigned, with no subsequent application source edits. Served by
  the generated standalone server from this worktree, bound to localhost only.
- Adapter SHA-256: `6f5090eeb05be4460299bdec3fdcbc98604e2bb69eb0dfee965a1038779d4123`
- Pinned local native runtime: Pretix 2026.7.0 image ID
  `sha256:5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02`.

The commit contains implementation/tests, native activation package and generated
email drafts. Review documents remain uncommitted. Expected working-tree status:

```text
 M docs/review/TTD_CHECKOUT_REVIEW.md
?? docs/review/TTD_HUMAN_ACCEPTANCE.md
?? docs/review/TTD_STEP6_PREDEPLOY_REVIEW.md
?? docs/review/ttd-candidate/
```

`ttd-candidate/` contains fresh local screenshots, sanitized verification summary
and the exact corrections patch (961ee6d → candidate). Preserve all review logs.
The unrelated original checkout was left untouched.

## Preview URLs and evidence boundaries

| URL | Purpose / limitations |
| --- | --- |
| http://127.0.0.1:3041/?lang=en | Corrected production candidate; demo availability; responsive studio UI. No hosted proof. |
| http://127.0.0.1:3041/?lang=da | Same candidate, Danish UI. |
| http://127.0.0.1:3040/ttd-emails/ | Actual app constructor drafts; event-prefixed native drafts from actual pinned ClassicMailRenderer + both inspected event settings. Unprefixed native files are copy specimens. Placeholder links, delivery and attachments remain unverified. |
| http://127.0.0.1:3042/manage/preview?lang=en | Synthetic local modification fixture using candidate components; dev-only preview; no actual order/modification. |
| http://127.0.0.1:3042/review-fixtures/events?lang=en | Temporary event fixture with two same-price ticket alternatives; candidate EventSignupForm, no real inventory/payment. |
| http://127.0.0.1:3042/review-fixtures/events?lang=da | Same fixture in Danish. |
| http://127.0.0.1:3038/?lang=en | Existing earlier demo preview; left running. Do not mistake it for the corrected build. |
| https://checkout.didde-mie.com/control/event/dd-studio/dance-with-dd-dev/settings/cancel | Existing hosted sandbox settings, unchanged by local corrections. |
| https://booking.didde-mie.com | Existing hosted application, independently identify its running release before drawing conclusions. |

All four local ports were independently found listening; candidate/drafts/fixture
URLs returned HTTP 200. That establishes local availability only. The temporary
fixture lives under `/tmp/ttd-candidate-dev`, outside the implementation worktree;
its relevant component/style files were byte-compared to the candidate. Its added
route and synthetic signing key are not part of the release. Browser tests stop
before payment/change/cancellation/subscription submission.

## Review instructions

1. Read applicable repository instructions, TTD_CHECKOUT_REVIEW.md (including
   preserved independent continuation and owner additions), TTD_HUMAN_ACCEPTANCE.md
   and infra/TTD_NATIVE_ACTIVATION.md. Revalidate status/identity before reviewing.
2. Inspect the complete PR28-to-candidate diff and then this correction diff:

```bash
cd /home/megawatts/Projects/DD_website/dd-platform-ttd-checkout-mobile
git status --short
git rev-parse HEAD
git diff be350a1d320136abdc1592b350e5f32257f91a17 892b68b04605a6099f19c1caa36d5ce6171b5dc3
git diff 961ee6d 892b68b04605a6099f19c1caa36d5ce6171b5dc3
cat apps/booking/.next/BUILD_ID
```

3. Review studio at 390×844 and desktop; run both No (one hour) and Yes/end paths.
   Inspect whole-month date grid, selected/availability/limit states, heading/
   Back spacing, readable labels, EN/DA and Back/Continue persistence. Retain
   original desktop calendar/copy. Review event fixture with alternate ticket
   quantity 3 to distinguish same-price names. Review modification Date/Start/
   Review focus, close/reopen at initial Date and retained interval. No submission.
4. Review exact CSP output/headers and preserved upstream payment handling;
   meaningful response test and isolated actual-runtime evidence are available.
   Verify both native packages separately, exact copy-only changes, all affected
   template keys, drift/atomicity/sandbox safeguards and organizer scope.
5. Review existing hosted sandbox read-only; record its actual identity/config
   and effective settings separately. Existing hosted flaws remain expected until
   an approved release; do not label local fixtures as hosted passes or perform
   human financial/subscription actions on the owner's behalf.
6. Record findings below, reconcile every required correction in this worktree,
   rerun appropriate checks and update candidate commit/build identity if changed.
   Then report to the owner and wait for explicit approval. Final installed-release
   acceptance follows the human acceptance queue and actual inbox delivery later.

## Fresh local results and remaining limits

72 booking + 21 server + 5 adapter/settings + 1 CSP response + 3 email package +
9 mocked installer tests passed; all workspace typechecks, booking production
build and server builds passed. Actual isolated no-network temporary Pretix runtime
verified native card rendering/CSP for all three events in both languages; both
activators with real ORM; actual native email construction for both ticket events.
No hosted secrets/volumes, orders, payments or mail sends were used.

Real phone zoom/orientation/keyboard/footer, actual screen reader, hosted release
identity/mounts/settings, Stripe payment/SCA/saved-card/wallet/gift-card handling,
refunds, actual mail delivery/functional links/ticket attachments and all required
human acceptance cases remain unverified. They are mandatory later phases.

## Separate-context review log (append; do not overwrite)

No separate-context findings or verdict recorded yet.

| Finding / scenario | Environment and identity | Result | Evidence / reconciliation |
| --- | --- | --- | --- |
| Original Step 6 predeployment review | Existing hosted sandbox + corrected local candidate, evidence separated | Unverified | Awaiting separate review context |

Owner release approval: **NOT GIVEN**.


## Hosted pre-installation baseline — owner status received 2 October 2026

Owner checksum-verified the root-owned b285cbf package and ran its sanitized
status helper. Booking, communications and worker are healthy at c02936ab;
primary communications remains independently at PR28 be350a1. Host config is
076a1b0ea63269b1ec670b1ed46ec946967cb5bcd07953bc96a7d1c09f32e698.
Pretix web/cron use pinned 2026.7.0 image 5df3b7aa852ee2d067b6756b6023e719dc53e039b9fdde58d631547dc7a1dc02;
all three events are published test-mode. Booking roots, health and Pretix-backed
availability respond 200. Backup reported fresh (19.4 hours) with active timer;
supervised Pretix processes run. Sandbox/live-payment/unrestricted-mail gates
remain restricted; communications/worker are controlled and booking captures.
This is baseline evidence, not corrected-release or human acceptance.

Found before installation: the installer did not accept the running adapter
hash e1b875ac535b52a69f3be42f64c873de6294642ca889e930652b1a52c6cad983.
Independent git comparison confirms exact matching bytes at c02936ab and PR28
be350a1. Added only this identified baseline to the strict upgrade allowlist.
Two new real install-path tests verify upgrade/recreation and reject a modified
baseline before any host-file write or service command. All 11 mocked installer
tests pass. Candidate target hashes, runtime gates and application behavior are
unchanged. Do not run the old b285cbf installer; stage the corrected package.
Safe baseline evidence: ttd-candidate/vps-before-ttd-release.json.


## Hosted adapter installed — 2 October 2026

PR29 merged as 3e72b830ff4d927f5237e4cafbb191b471326d67 after all CI checks
and three image builds passed. Owner ran the checksum-verified corrected
a787c81 host package, independently compared byte-for-byte to merged main.
Installer PASS reports host configuration 148e0d8d70c75ea806d6a5c2734870a015269938102b82832dbb0728c560ba91
and preservation of application images. Independent owner commands found both
Pretix web/cron mounted adapter hashes equal the reviewed
6f5090eeb05be4460299bdec3fdcbc98604e2bb69eb0dfee965a1038779d4123.
Pinned Pretix image unchanged; web supervised processes RUNNING. Booking,
communications/worker remain healthy at c02936ab; primary remains independently
at be350a1. Roots/health/Pretix availability are 200, all 16 existing orders and
configuration cardinalities unchanged, backup fresh and sandbox/restricted-mail
gates preserved. Successful current application manifest still records the old
configuration as expected between adapter install and new image deployment;
config-install.json separately records the installed target.

Application publication/deployment, native settings/email activation, actual
response CSP/card behavior and final hosted human acceptance remain pending.
Safe evidence: ttd-candidate/vps-after-adapter-install.json.

Main publication 36933094466 succeeded for exact merge 3e72b830ff4d927f5237e4cafbb191b471326d67; validated three immutable artifact digests and host config148e0d8d against the installed owner status. Manual exact-digest deployment dispatched with release_run_id36933094466, while DEPLOY_ENABLED remains false. Running-release owner verification is still pending. Manifest: ttd-candidate/main-3e72b83-release.json.

Manual exact-digest deployment 36933697419 completed successfully for merge 3e72b830ff4d927f5237e4cafbb191b471326d67 and publication36933094466. The workflow validated the successful source publication and used all three immutable digests without rebuilding. Independent owner running-image/config/mount verification and native settings inspection remain required; CI success is not human acceptance.


## Running application release verified; native inspection permission issue — 2 October 2026

Owner status independently verifies all three running revisions/image references/
image IDs exactly match the published merge3e72b83 manifest, healthy with zero
restarts. Actual mounted runtime hashes and startup match host files. Current/
successful attempt manifests and installed host config148e0d8d agree; failed.json
is absent. Primary remains healthy on be350a1/digest45d721e8. Sandbox/payment/mail
gates and webhook restrictions remain preserved; Pretix order count16 and all
configuration cardinalities unchanged. Probes200, backup fresh, supervised
Pretix processes RUNNING. Evidence: ttd-candidate/vps-after-application-deploy.json.

Native inspection failed before script execution: docker cp preserved staged
root-only permissions and the unprivileged pinned-image user could not read
configure-ttd-checkout.py. Neither activator ran and no settings/templates
changed. Correct only the four temporary non-secret package files: root-owned,
Pretix group15371, directory0750/files0440. Then rerun read-only inspection.
This is a staging/instructions issue, not an application/payment failure.
Actual native policy/email and CSP/card/mail acceptance remain unverified.


## Native inherited email defaults correction — 2 October 2026

Owner policy inspection succeeded and reports only approved DK/colour/customer
policy deltas. No apply flag was used. Native email inspection failed before
any writes because default LazyI18nString.data is upstream LazyGettextProxy,
not the explicit dictionary seeded in the earlier local fixture. Independent
inspection of pinned 2026.7.0 confirms this representation. Corrected reader
resolves all supported native translations via localize(); explicit mappings
retain all their existing keys. EN/DA before/after drift validation remains
strict and both events validate atomically before writes. Only the originally
approved EN/DA phrase changes; non-EN/DA effective copy remains identical.
Inherited defaults become explicit snapshots on approved activation to retain
all supported translations. Setting keys, placeholders, artwork, signatures,
attachments, payments and application release identity are unchanged.

Five email tests pass, including inherited-default handling, extra-language
preservation, idempotence and late inherited drift rejecting all writes. A new
isolated no-network/read-only pinned Pretix runtime with ephemeral SQLite
passed real inherited-default inspection/apply/idempotence, checking every
supported language before and after; also passed explicit snapshots/extra
German copy/idempotence, actual native email constructors/settings in both
events, actual card/response CSP in all three events EN/DA and scoped checkout
settings activation. No orders/payments/mail sends. Separate 5 adapter/settings,
1 response-CSP and 11 mocked installer tests also pass. The earlier test
coverage limitation is preserved as review history; hosted inspection and
activation remain pending. Evidence: ttd-candidate/inherited-email-runtime.txt.
