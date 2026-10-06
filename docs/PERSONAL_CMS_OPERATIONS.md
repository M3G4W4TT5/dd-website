# Personal Sanity integration operations

## Verified identity and boundaries

Repository: M3G4W4TT5/dd-website. Local branch: codex/personal-sanity-integration, based on 8c79e511974682ba9321cd142ed0c911474a2607.
Sanity: didde-mie.com / i7lp8473 / production; org okjdmrql3, admin@didde-mie.com. Free plan, user confirmed.
Cloudflare: Memory(One), account b259f8a4a84c2435819ed369102f3724; Pages dd-personal-private; Worker target dd-personal-preview.memory-one.workers.dev. This Workers subdomain was verified through the Cloudflare API.

The existing Pages Git production deployment switch is off and branch previews are none. They must stay paused. Content deploy hooks are independent of Git-triggered deployments; prove this with an approved reversible publication before marking release complete.

No booking application, Pretix, subscriber/email backend, shared proxy or existing access policy has been changed. The owner approved a narrow CI safeguard: booking checks still run, but booking image publication skips a main-branch change only when its paths, shared dependencies and workflow comparison prove personal-only scope. Mixed changes and inconclusive comparisons retain normal booking CI behaviour. Main checkout modifications and web_clips are preserved. Source media remain recoverable in the repository.

## Local commands

From the repository root, use Node 24.20 or newer:

```
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck -w @dd/personal
npm run typecheck:studio
npm run test:personal-cms
npm run test:pages
npm run typecheck:pages
npm run build:personal
npm run build:studio
npm run build:personal-preview
npm run build:pages-functions
python3 infra/primary-release.test.py
```

The draft probe temporarily creates a homepage draft only if none exists, verifies published/draft query separation, and discards only its own unchanged revision. It never publishes.

`build:personal` is static and reads published Sanity content without a token. Missing/invalid required fields stop the build. There is no hardcoded runtime fallback. `src/content.ts` and migration fixture copy are retained only as migration/source evidence.

`build:personal-preview` is a separate Worker build. Its middleware, draft reads and visual editing run only in that build. Its server secrets never belong in PUBLIC_* variables or static Pages settings.

`build:studio` also extracts the external Studio manifest into `dist/static`. The preview bundle serves it beneath `/studio/static/` with the same Access protection as the editor. A local build or schema deployment does not register a hosted Studio in Sanity's dashboard.

Studio schema/type regeneration:

```
node tools/personal-sanity/run-cli.mjs schema extract --path ../../tools/personal-sanity/schema.json --force
node tools/personal-sanity/run-cli.mjs typegen generate
node tools/personal-sanity/run-cli.mjs documents validate --yes
npx --no-install tsx tools/personal-sanity/probe-drafts.ts
```

The CLI wrapper reads the ignored apps/studio/.env.local project token. It does not use the global CLI account, which may belong to an unrelated project. Never print credentials. Migration uses create-if-missing and legacy IDs; `--apply` is explicit. Re-running it does not overwrite existing published or draft editorial content.

## Protected preview release checklist

The owner approved pushing this branch for a review PR and hosting/registering the protected Studio and draft preview on 2026-10-06. Production merge/release and publishing activation still require final owner approval. The following preview steps remain pending; the Viewer token file is currently empty.

1. Obtain a separate Viewer/read token for i7lp8473. The local migration Developer token must not be deployed. Store the Viewer token in the Worker secret SANITY_PREVIEW_READ_TOKEN. Use a separate Viewer token for backups where practical.
2. Create a dedicated Cloudflare Access application for dd-personal-preview.memory-one.workers.dev. Reuse the approved editor identity restriction without modifying existing personal/booking applications. Verify its audience and place that non-secret value in wrangler.preview.jsonc. Generate a strong PREVIEW_SESSION_SECRET locally and provision it as a Worker secret. Keep preview URLs disabled.
3. Deploy the separate preview runtime only after Access exists. Set workers_dev true for that exact host, retaining application JWT verification before every asset/HTML response. No DNS or shared proxy changes are required. No KV, Cloudflare Images or paid streaming resource is required.
   Register the actual hosted Studio in the existing project, using the project-scoped CLI wrapper from apps/studio: `node ../../tools/personal-sanity/run-cli.mjs deploy --external --url https://dd-personal-preview.memory-one.workers.dev/studio --schema-required --yes`. This is an external Studio registration and schema deployment; it does not create a replacement Sanity project. Verify the registration with the Sanity plugin and open its dashboard link in Chrome. If a Sanity dashboard feature cannot retrieve the protected manifest, record that limitation and keep protection intact.
4. Sanity CORS: exact hosted preview origin with credentials, exact didde-mie.com and dd-personal-private.pages.dev origins without credentials for anonymous canvas media. No authenticated wildcard. Local test origins are 127.0.0.1:3333 (credentials) and 127.0.0.1:8765 (anonymous).
5. Authenticate Cloudflare and Sanity in the actual Chrome session. Verify Studio identity, draft enable/disable, desktop/mobile iframe, editing overlays and expired/anonymous sessions. Studio and iframe share an origin; CSP/X-Frame-Options permit only that origin. Headers are private/no-store, no-referrer and noindex; forms cannot deliver in preview.
6. Verify no draft text, token or preview script appears in static production output. Check remote MP4/poster CORS using the actual deployed origins and actual browser playback.

## Publishing and failure notification release checklist

1. Push the focused branch and open/attach a PR after approval. Verify the remote PR head and required checks. Merge/release only with explicit authorization covering that release.
2. Resolve the privacy provider disclosure before release; current migrated text still mentions Storyblok. Do not silently rewrite legal wording.
3. Create a Pages deploy hook on dd-personal-private for main. Store its URL as a secret outside Git/logs; place it only in the intended Sanity webhook. Do not print the returned hook URL or put it in documentation.
4. Apply tools/personal-sanity/webhook.ts configuration. It includes create/update/delete for the five published personal document types; excludes drafts, versions and assets/booking documents. No webhook is currently active. Keep unrelated webhooks intact.
5. Configure a native Cloudflare pages_event_alert notification, scoped to this Pages project and production failure, to admin@didde-mie.com. Pages alerts are available on all Cloudflare plans. Verify the exact event filter against the provider before creating it, then test provider dispatch. Inbox receipt requires owner confirmation if inbox access is unavailable. Do not change mail routing or delivery infrastructure.
6. Publish a reversible visible personal-only field edit, track the Sanity delivery and Pages deployment, verify the deployed main revision and actual changed authenticated page. Restore the original field with a revision guard, publish it, then verify the second deployed page. HTTP 200 or successful webhook delivery alone is insufficient.
7. Prove draft saves and an excluded booking-shaped test delta do not trigger builds. Do not create or edit real booking content. Test deletion/unpublication filters locally; any required live test must use disposable personal content.
8. Record measured publication delay and final Studio, preview, deployment URLs/revisions here.

For a build failure, inspect the named CMS validation error or personal build log; correct/re-publish the affected field or retry the exact personal deployment. Never re-enable general Git deployments as a workaround. If the preview runtime fails, keep the public static deployment untouched and inspect the private runtime configuration without exposing request URLs or credentials.

## Backups and verified recovery

Local verification on 2026-10-06: 23 personal documents, 34 standard assets, 14,572,815 bytes including documents/schema. Original asset SHA1/size and all stored SHA256 checksums match. Recovery into the isolated private personal-restore-20261006 dataset matched all 23 documents and 34 assets. This test dataset occupies the second Free dataset slot until cleaned up. Production has not been overwritten.

The backup script exports personal published/draft documents and their referenced original assets only. Images use authenticated dlRaw, because a regular image CDN download can re-encode an image. A revision check prevents accepting an export if an editor changes content during download. Failed exports remain marked incomplete and are never accepted as completed backups.

The prepared GitHub workflow runs weekly and manually, but is disabled until repository variable PERSONAL_CMS_BACKUPS_ENABLED is true. Provision PERSONAL_SANITY_BACKUP_READ_TOKEN, confirm included Actions storage/minutes and spending limits before activation, and enable failed-run notifications. No recurring paid service is authorized. Four weekly backups at current size require roughly 60 MB with 28-day retention; this uses an account-wide quota shared with other repositories. Larger future media need an explicit quota/retention review. Keep a downloaded local backup as well. Run a manual remote backup and download/validate it before claiming off-PC protection is active.

To create a local backup, supply SANITY_AUTH_TOKEN only in the process environment and run:

```
npx --no-install tsx tools/personal-sanity/backup.ts
```

For recovery, download/unpack the backup, then validate it without a credential:

```
npx --no-install tsx tools/personal-sanity/restore.ts /absolute/path/to/backup personal-restore-review
```

Create a separate private personal-restore-* dataset in i7lp8473, ensuring a Free dataset slot is available. With a project Developer credential in the environment, restore into the empty test dataset:

```
npx --no-install tsx tools/personal-sanity/restore.ts /absolute/path/to/backup personal-restore-review --apply
```

The tool refuses production and nonempty targets; uploads assets, rewrites asset references, and compares recovered document values. Review the recovered content in a Studio pointed at that test dataset. Before applying selected recovery to production, take a fresh backup, compare intervening editorial changes and use revision-guarded document patches. Do not bulk overwrite production. Remove only the dedicated test dataset after its recovery evidence is retained and its cleanup is authorized.

Deployment rollback: disable only the personal Sanity webhook, restore the last known-good personal Pages deployment through Cloudflare, and verify the actual authenticated page. A Pages rollback restores built output, not Sanity content. Recover the CMS separately as above; restore the matching preview Worker version if needed. Preserve all booking deployments and shared controls.

## Evidence still required

Local checkpoint, 2026-10-06: the signed-in Chrome Studio opened the migrated homepage with populated hero images, reel and selected-work references. Sanity's project Studio listing still reported no registered applications. Studio build and external manifest extraction passed; the migration credential was absent from that output. The six CMS/session/webhook/CI-scope tests passed. Comparing all five static pages with the original build preserved displayed copy, headings, links and functional form attributes. Earlier local checks passed personal/Studio type checks, Pages checks and primary-release tests; remote reel playback, keyboard controls, pause and reduced-motion poster fallback were verified in Chrome. Physical mobile touch and authenticated hosted draft embedding remain unverified. No GitHub push or hosted release has occurred.

Hosted Studio/preview authentication and embedding, production-origin media, notification delivery/inbox, recurring remote backup, remote PR checks/head, full publish/restore deployment and hosted revision are unverified until approved remote work is completed. Local screenshots or builds do not establish those results.

Provider references: https://www.sanity.io/docs/apis-and-sdks/schema-deployment ; https://developers.cloudflare.com/pages/configuration/deploy-hooks/ ; https://developers.cloudflare.com/notifications/notification-available/ ; https://docs.github.com/en/billing/concepts/product-billing/github-actions
