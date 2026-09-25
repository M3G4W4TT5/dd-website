# Legal pages and cookie release check

The current pages are reviewable drafts for the DD portfolio and TTD Studio. They contain visible placeholders because the legal operator and some production services are not yet confirmed. Do not treat these placeholders as publication-ready facts.

## Fill before public launch

- The owner supplied DD Production (CVR 42234958, Rathsacksvej 3, 3., 1862 Frederiksberg C) for `didde-mie.com` and TOTAL ENTERTAINMENT (CVR 21285870, Skydebanegade 10, st., 1709 København V) for `ttd.didde-mie.com`. These identities and addresses are now in the policies and booking terms. Confirm the final controller arrangement for TTD Studio and fill the remaining phone placeholder in the booking terms before checkout opens.
- Confirm which monitored email address handles privacy, booking and cancellation requests. Update the policy, terms and transactional emails consistently.
- Confirm the consumer complaint body for the final legal entity and service. The current terms point to Nævnenes Hus as a likely route, subject to the service and price.
- Enforce the exact 24-hour boundary as written: self-service change or free cancellation is allowed only while **more than 24 elapsed hours** remain before the first booked hour. At exactly 24 hours or less, self-service closes. Verify this against the final pretix/customer flow, including multi-hour bookings and daylight-saving transitions. Show the applicable terms and total price immediately before payment and include the terms in a durable confirmation.
- Confirm the operational retention schedule for inquiries, order data, email, security logs, SMS verification and backups. The draft chooses 12 months for ordinary inquiries and follows the five-year accounting rule for records that qualify as accounting material.
- Verify hosting, email, pretix, Stripe, SMS, calendar, and any Meta/Instagram roles; sign necessary processing agreements and document any third-country transfer grounds. Update the policy with the actual recipients and transfers.

## Cookie and similar-technology work at integration freeze

1. Audit **both domains and the external pretix checkout origin** in a fresh browser. Record every cookie, local/session storage entry, pixel, embedded frame and third-party request before consent, after each consent choice, and after withdrawal. Record name, provider, purpose, lifetime and legal category. Repeat on mobile and through a payment return.
2. Current source review finds `ttd-language` in local storage on the booking site, a YouTube frame only after a visitor selects a film on the portfolio, and one remote Storyblok image. No analytics or newsletter integration is present in the inspected source. These observations are not a production cookie inventory. Review pretix, Stripe, hosting/CDN protections, future Instagram display and any newsletter tool separately once configured.
3. Strictly necessary storage may run without cookie consent if it is genuinely needed for the requested service. Optional analytics, marketing and non-essential embeds must wait for an informed, specific, active choice. Provide equally accessible **Accept optional**, **Reject optional** and **Settings** choices, with no preselected optional category. Store the choice, keep a persistent way to change or withdraw it, and prevent optional scripts or frames from loading before consent.
4. Publish a Danish and English cookie/technology policy on the relevant domains from the verified inventory. Link it from the footer and the consent interface. Update the privacy policies to match. Keep newsletter consent separate from cookie consent and from booking acceptance if a newsletter is added.
5. Re-test after every new integration and before public launch. A banner by itself does not make an already-loaded tracker compliant.

## Official references used for the drafts

- [Datatilsynet: information duty for small businesses](https://www.datatilsynet.dk/regler-og-vejledning/gdpr-univers-for-smaa-virksomheder/trin-4-oplys-om-at-du-behandler-personoplysninger)
- [Datatilsynet: deletion and accounting retention](https://www.datatilsynet.dk/regler-og-vejledning/gdpr-univers-for-smaa-virksomheder/trin-3-husk-at-slette)
- [Digitaliseringsstyrelsen: cookie guidance](https://digst.dk/tilsyn/sporingsteknologiomraadet/cookievejledningen/)
- [Forbrugerombudsmanden: dated leisure services and withdrawal](https://forbrugerombudsmanden.dk/find-sager/sager/forbrugeraftaleloven/ehandel/ej-fortrydelsesret-paa-billetter-til-trampolinpark-til-bestemt-dato)
- [Forbrug.dk: business complaint information](https://forbrug.dk/regler/virksomheder-vejledning-om-koebeloven/husk-at-oplyse-dine-kunder-om-deres-klageadgang)
