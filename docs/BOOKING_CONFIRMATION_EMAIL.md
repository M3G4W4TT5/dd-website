# TTD Studio booking emails

Prepared content for paid bookings, booking changes, and cancellations. These are drafts for the hosted test shop. The booking app now sends a paid-booking email with reference, studio time, amount, and a one-use management link after a verified pretix `order.paid` webhook. It uses the order locale for Danish or English. Its email-recovery flow sends another one-use link on request. Both currently use `booking@didde-mie.com` as From and Reply-To and need paid-order SMTP tests. Configure pretix's receipt and detailed order email separately under **Event → Settings → E-mail → E-mail content**. Keep placed-order/payment-pending copy distinct from confirmed payment.

The pretix `{url}` placeholder below opens pretix's order page, not the custom `/manage/booking` page. Do not publish the draft wording that says it opens the custom page. The app's paid-order email contains its own 15-minute one-use access URL, which opens the custom page after redemption. Choose which message carries booking detail and edit the templates before launch; avoid duplicate or contradictory confirmations. See [booking management deployment](BOOKING_MANAGEMENT_DEPLOYMENT.md).

## Sender and reply handling

- Display name: `TTD Studio`
- From: `noreply+booking@didde-mie.com`
- Reply-To: the monitored studio inbox set as the pretix organizer contact address (`booking@didde-mie.com`). Confirm its routing and delivery first. The From mailbox and delivery failures must also be monitored.
- Transport: pretix's custom SMTP using a server-only authorized Purelymail user. Do not put SMTP credentials in this file or the public app.

Purelymail symbolic subaddressing routes mail to `noreply+booking@didde-mie.com` to the base `noreply@didde-mie.com` user when enabled for the domain. The base user (or another explicitly authorized sender) must exist and be able to send with the exact From address. A webmail identity is useful if staff will manually send from it; it does not itself configure pretix SMTP. Verify the exact From with a test message because Purelymail checks SMTP sender authorization.

On 25 September 2026, the owner reported that the base user and tagged Webmail identity are set up, inbound mail to the tagged address reaches the `noreply` inbox, manual outbound mail shows the tagged From address, and `booking@didde-mie.com` receives mail. Pretix SMTP, Reply-To on an automated message, and paid-order delivery remain untested.

## Danish paid-order email

**Emne:** Din booking hos TTD Studio er bekræftet · {code}

```text
Hej

Din betaling er registreret, og din booking hos TTD Studio er bekræftet.

Bookingreference: {code}
Betalt i alt: {total_with_currency}
Sted: TTD Studio hos København Danser, Nygaardsvej 5a, 2. sal, 2100 København Ø.

Administrer din booking: se dine bookede timer og din kvittering, skift til et andet ledigt tidsrum eller afbestil her:
{url}

Linket er personligt og giver adgang til dine bookingoplysninger. Del det ikke med andre.

Når der er mere end 24 timer til den første bookede time, kan du ændre til et andet ledigt tidsrum. Du kan også afbestille din booking gratis. Ved rettidig afbestilling refunderer vi det fulde betalte beløb til den oprindelige betalingsmetode. Refusionen kan tage tid at blive gennemført. Hvis fristen er passeret, skal du kontakte studiet om eventuelle særlige forhold.

Læs bookingvilkårene: https://studio.didde-mie.com/terms?lang=da
Spørgsmål? Skriv til booking@didde-mie.com.

Venlig hilsen
TTD Studio
```

## English paid-order email

**Subject:** Your TTD Studio booking is confirmed · {code}

```text
Hello,

Your payment has been recorded and your TTD Studio booking is confirmed.

Booking reference: {code}
Total paid: {total_with_currency}
Location: TTD Studio at København Danser, Nygaardsvej 5a, 2nd floor, 2100 Copenhagen Ø, Denmark.

Manage your booking: view your booked hours and receipt, move to another available interval, or cancel here:
{url}

This personal link gives access to your booking details. Do not share it with others.

When more than 24 hours remain before the first booked hour, you can move to another available interval. You can also cancel your booking free of charge. If you cancel in time, we refund the full amount to the original payment method. The refund may take time to complete. If the deadline has passed, contact the studio about exceptional circumstances.

Booking terms: https://studio.didde-mie.com/terms?lang=en
Questions? Email booking@didde-mie.com.

Kind regards,
TTD Studio
```

## Change and cancellation confirmations

Send both kinds of confirmation from **TTD Studio <noreply+booking@didde-mie.com>**, with replies routed to `booking@didde-mie.com`. Send a change confirmation only after the entire new interval has been committed in pretix; send a cancellation confirmation only after pretix records the cancellation. Send once per successful state transition, including retries and webhook replays. A preview action must never send email. Use one notification owner per transition so pretix and the booking app do not both send the same confirmation. Pretix's order-change API has a `send_email` option; verify its rendered content and sender before deciding whether to use it or an app-rendered message. [pretix order-change API](https://docs.pretix.eu/dev/api/resources/orders.html)

The `{{...}}` fields below are **application-rendered values**, not pretix placeholders. Fill them from the verified order, format all times in Europe/Copenhagen, and include the secure order-specific management link. If pretix sends these messages instead, configure and preview the corresponding pretix templates using only placeholders offered for those email types.

### Danish change confirmation

**Emne:** Din booking hos TTD Studio er ændret · {{reference}}

```text
Hej

Din booking hos TTD Studio er ændret.

Bookingreference: {{reference}}
Tidligere tidspunkt: {{old_interval}}
Nyt tidspunkt: {{new_interval}}
Sted: TTD Studio hos København Danser, Nygaardsvej 5a, 2. sal, 2100 København Ø.

Se og administrer din opdaterede booking her:
{{manage_url}}

Du kan ændre eller afbestille din booking, når der er mere end 24 timer til den første bookede time. Spørgsmål? Skriv til booking@didde-mie.com.

Venlig hilsen
TTD Studio
```

### English change confirmation

**Subject:** Your TTD Studio booking has changed · {{reference}}

```text
Hello,

Your TTD Studio booking has been changed.

Booking reference: {{reference}}
Previous time: {{old_interval}}
New time: {{new_interval}}
Location: TTD Studio at København Danser, Nygaardsvej 5a, 2nd floor, 2100 Copenhagen Ø, Denmark.

View and manage your updated booking here:
{{manage_url}}

You can change or cancel your booking when more than 24 hours remain before the first booked hour. Questions? Email booking@didde-mie.com.

Kind regards,
TTD Studio
```

### Danish cancellation confirmation

**Emne:** Din booking hos TTD Studio er afbestilt · {{reference}}

```text
Hej

Din booking hos TTD Studio er afbestilt.

Bookingreference: {{reference}}
Afbestilt tidspunkt: {{cancelled_interval}}
Beløb til refusion: {{refund_amount}}

Vi har igangsat refusionen til den oprindelige betalingsmetode. Det kan tage tid, før beløbet er tilbage på din konto. Vi giver besked, hvis refusionen kræver yderligere handling.

Se status for din booking og refusion her:
{{manage_url}}

Spørgsmål? Skriv til booking@didde-mie.com.

Venlig hilsen
TTD Studio
```

### English cancellation confirmation

**Subject:** Your TTD Studio booking has been cancelled · {{reference}}

```text
Hello,

Your TTD Studio booking has been cancelled.

Booking reference: {{reference}}
Cancelled time: {{cancelled_interval}}
Refund amount: {{refund_amount}}

We have initiated the refund to your original payment method. It may take time for the funds to appear in your account. We will contact you if the refund needs further action.

View your booking and refund status here:
{{manage_url}}

Questions? Email booking@didde-mie.com.

Kind regards,
TTD Studio
```

If cancellation succeeds but refund initiation is still pending or fails, replace the refund paragraph with an accurate status message and alert DD. Never say a refund has been initiated until pretix confirms that step. A later refund-completed notice can be configured separately.

## Before enabling delivery

1. Confirm the final public shop hostname, monitored studio address, and whether the final pretix Paid order template includes the full multi-hour interval and receipt/order details. The documented pretix placeholders include `{code}`, `{total_with_currency}`, and `{url}`; they do not provide a confirmed single placeholder for an aggregated multi-hour interval. The secure order page is the reliable detail source until this is verified in the rendered email.
2. Configure the From address and organizer contact address in pretix, then preview the Danish and English **Paid order** emails. Check that every placeholder is accepted for that email type, that the order link resolves on the chosen HTTPS origin, and that receipt delivery is enabled.
3. Send only synthetic sandbox orders to test inboxes. Verify delivery, spam placement, Reply-To, delivery failures, duplicate payment callbacks, and that no paid confirmation is sent before verified payment.
4. Configure and test change, cancellation, and refund-status notices when the order/refund workflow is connected. The app asks pretix to send the change email; test its actual content. A cancelled order and a completed refund are different states; do not say money was returned merely because cancellation succeeded. Verify the exact From address on all three message types.

Sources: [pretix email settings and placeholders](https://docs.pretix.eu/guides/email/), [Purelymail symbolic subaddressing](https://support.purelymail.com/support/solutions/articles/159000406702-symbolic-subaddressing), [Purelymail sender authorization](https://support.purelymail.com/support/solutions/articles/159000433207-error-530-5-7-1-you-x-are-not-authorized-to-send-mail-as-y-).
