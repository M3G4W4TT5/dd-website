# Stripe and pretix test setup

## Current local state (25 September 2026)

- The local self-hosted pretix Community image includes the Stripe plugin. It is enabled for `studio`, `dance-with-dd-dev`, and `street-dance-workshop-dd-dev` in the local pretix database. The Compose default also enables it for newly created events.
- The intended TTD Stripe sandbox is connected to all three events with test publishable and secret keys stored in the local pretix database. Stripe is enabled for test payments with cards and wallet detection. MobilePay is disabled in the sandbox and in all three events. All events remain unpublished and in pretix test mode; no live keys, webhook destination, or public checkout have been configured. The booking site's event checkout gate remains off.
- The local pretix URL is `http://127.0.0.1:8345`. Stripe cannot send webhooks to that loopback address; a temporary forwarding tool or public HTTPS pretix URL is needed to validate asynchronous payment updates.

## Stripe account and live activation

The owner has created the TTD Stripe account and opened its sandbox. Use that sandbox for integration work; finish business verification, payout details, and any payment-method approval in the Dashboard before live payments. Do not put passwords, API keys, webhook secrets, identity documents, or bank details in Git, chat, screenshots, or logs.

## Connect the sandbox to each pretix event

1. In the Stripe Dashboard, select the intended sandbox and obtain its **test** publishable and secret API keys. Verify their test prefixes before entering them. Do not use live keys in the local instance. This step is complete for the three local events.
2. In each pretix event, open **Settings → Payment → Stripe**. Enter the sandbox keys in the testing fields. Keep the endpoint on **Testing**. Enable cards and wallet detection for Apple Pay where Stripe offers it for this account. Keep MobilePay, bank transfer, and other payment providers disabled. This local configuration is complete for the three events.
3. For each event, use the exact Stripe webhook URL displayed by pretix to create a Stripe event destination in the same sandbox. Follow pretix's current instruction to send all event types. A local loopback URL is unreachable from Stripe; set up secure forwarding for development, or wait for a public HTTPS pretix origin. Confirm delivery in both Stripe and pretix before relying on order status.
4. Stripe is enabled in the three private test events. Before relying on it for a booking, test a successful card payment, a decline, a refund, and an asynchronous state change; confirm the final order and refund state in pretix. Repeat for the event series date and the singular event.
5. Apple Pay requires a compatible device/browser and domain verification for the actual HTTPS checkout origin. It cannot be fully validated on this localhost HTTP preview. MobilePay is excluded because of its fixed monthly fee.

## Before any live sale

Complete Stripe's business and payout verification; review its actual payment-method availability and fees. Add live keys and a live webhook destination to the deployed pretix instance, switch the Stripe endpoint to **Live**, and test the deployed HTTPS checkout. Verify the one-room inventory, phone-verification gate, booking cancellation policy, refunds, and mail delivery described in [the events guide](../apps/booking/EVENTS.md) and the [project implementation plan](../../IMPLEMENTATION_PLAN.md). Only then publish events and enable the booking site's `PRETIX_EVENTS_CHECKOUT_ENABLED` gate. A browser return is not evidence of payment; pretix's authenticated order state is authoritative.

Sources: [pretix Stripe setup](https://docs.pretix.eu/guides/payment/stripe/), [Stripe account setup](https://docs.stripe.com/get-started/account/set-up), [Stripe testing](https://docs.stripe.com/testing), [Stripe MobilePay fees](https://docs.stripe.com/payments/mobilepay).
