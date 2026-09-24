# DD website

A website for Didde-Mie Lykke From, a dancer and choreographer. It brings together her personal portfolio of selected performance, film and modelling work and a separate TTD Studio booking preview for the room she owns with Toniah Pedersen at København Danser.

<p align="center">
  <a href="docs/screenshots/personal-hero.png"><img src="docs/screenshots/personal-hero.png" width="48%" alt="DD personal site hero with portrait and IN MOTION heading"></a>
  <a href="docs/screenshots/personal-work.png"><img src="docs/screenshots/personal-work.png" width="48%" alt="DD personal site selected work section"></a>
</p>

The personal site uses **Astro, React, TypeScript and CSS**. The studio site uses **Next.js, React and TypeScript**, with a local **pretix Community** availability preview backed by PostgreSQL and Redis. Hourly studio booking and payment are not yet live. The studio events calendar reads pretix events and dates, while event checkout remains gated until the payment and one-room inventory setup is verified. See [events integration](apps/booking/EVENTS.md).

## Contact forms

Both forms send through the booking app's `/api/contact` route, which must run on the VPS. The personal site can remain a static Cloudflare deployment; its browser code posts to `PUBLIC_BOOKING_URL/api/contact`. The booking app sends each message from and to the matching Purelymail mailbox, with the visitor in `Reply-To`. It sends no automatic reply.

1. Set `PUBLIC_BOOKING_URL` in the personal site's build environment to the public HTTPS origin of the booking app. Rebuild the static site after changing it.
2. Set `CONTACT_PERSONAL_ORIGIN` and `CONTACT_BOOKING_ORIGIN` in the booking app's server environment to the exact HTTPS origins of the two deployed sites. Origins have no path or trailing slash. Local defaults and placeholders are in `apps/booking/.env.local.example`.
3. Set `CONTACT_SMTP_PASSWORD` for `contact@didde-mie.com` and `BOOKING_SMTP_PASSWORD` for `booking@didde-mie.com` in the booking app's server environment. Use the corresponding Purelymail mailbox password or an app password. These values must remain server-only and outside Git.
4. Send one test inquiry through each deployed form and check the matching inbox and `Reply-To`. If a message fails, the form keeps its contents and shows an error.

The route uses Purelymail SMTP at `smtp.purelymail.com:465` with TLS. Cross-origin requests are allowed only from the configured personal origin; each origin can submit only for its own mailbox. The form includes a hidden spam trap and validates fields on the server. Production mail delivery cannot be verified until the server has the mailbox credentials.
