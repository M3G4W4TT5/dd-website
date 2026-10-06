# Personal website editor guide

Status: local integration prepared; hosted release and URLs still require owner approval.

Local Studio: http://127.0.0.1:3333/studio/
Planned protected Studio: https://dd-personal-preview.memory-one.workers.dev/studio/
Planned protected preview: https://dd-personal-preview.memory-one.workers.dev/
Website: https://didde-mie.com (existing access protection remains).

Sign into the Didde-Mie project using admin@didde-mie.com. Cloudflare sign-in protects the hosted Studio and preview; Sanity sign-in grants editing permission. The project is i7lp8473, production. The integration uses the Free plan.

## Editing and ordering

- **Homepage and ordering** contains the hero, introduction, reel biography/source, ordered reel selection, ordered work selection, contact section and follow heading.
- **Reel clips** holds reusable clips. Upload a prepared silent 16:9 MP4 and its poster, enter its title and accessible description, then publish it. Add its reference to the homepage reel and drag references into the desired order.
- **Work entries** holds reusable projects. Change the title, category, role, description, project image and full film link. Image source/credits stay with the image. Publish the entry, then add or reorder its reference in Homepage and ordering.
- **Settings, branding and interface copy** contains navigation, social handles, footer, search/social metadata, approved branding and form labels/messages. Keep `{title}` and `{count}` placeholders where indicated.
- The four supporting pages are listed individually. Their routes stay fixed.

Removing a reference hides an item from the homepage after publication. It does not delete the reusable entry or its media. Referenced entries cannot be deleted until their references are removed. Avoid unpublishing required documents: the website build will stop and keep the previous deployment.

## Images and clips

Hero and contact have separate desktop and mobile image placements. They start with the actual approved assets, including the existing distinct mobile portraits/backgrounds. Each placement has its own horizontal/vertical focus percentages. Smaller phones can have a separate horizontal focus. Start at the seeded values and check both widths in Preview.

The image crop tool selects the crop; the Framing fields select its position inside the existing layout. Brand geometry and the animated flower model are preserved. Replacing brand assets is a design decision and needs review.

Keep replacement clips compact and prepared before upload. Existing clips are silent H.264 MP4, 960 × 540 at 24 fps. A poster ensures the reel remains readable before playback and when motion is reduced. The site uses standard Sanity assets; no paid video service is configured.

## Preview and publication

Changes autosave as drafts. Open **Presentation** / **Preview** to see unpublished content. Use its desktop/mobile views. Click editable text or images where visual overlays are available; canvas reel content remains editable through Reel clips and the homepage selection.

Preview is read-only for website forms. Do not use it to send an inquiry or manage a newsletter subscription. Preview access expires after at most one hour; reopen it from Studio to renew it. Copying its URL does not grant another person access.

Publish reusable entries first, then the homepage selection. Publishing updates Sanity immediately; the website changes only after its static build and deployment complete. Expect a short build delay, usually measured in minutes; the actual delay must be recorded during release verification. Draft saves never rebuild production. Booking documents never trigger this personal-site workflow.

If the website does not change, check the personal Pages deployment status. A failed build leaves the previous version online. Fix the field named in the build error and publish again, or have the maintainer retry the personal build. Do not change deployment controls for booking or shared services.

Newsletter purpose/consent wording is locked to the version recorded by the backend. A wording change requires coordination with that backend; ordinary form labels and status messages remain editable.

## Recovery

Before a substantial edit, create a personal content backup. The prepared weekly backup workflow stores documents, drafts, original assets and checksums off the PC after activation; Git source alone does not preserve CMS content.

For a small mistake, use the document history where your plan makes it available, or restore the previous field value and republish. For larger recovery, ask the maintainer to validate a backup and restore it into an isolated test dataset first. The verified procedure and deployment rollback are in PERSONAL_CMS_OPERATIONS.md. Never import a backup over production without reviewing current editorial changes.
