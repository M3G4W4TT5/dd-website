# Stripe and pretix test setup

## Current local state (25 September 2026)

- The local self-hosted pretix Community image includes the Stripe plugin. It is enabled for `studio`, `dance-with-dd-dev`, and `street-dance-workshop-dd-dev` in the local pretix database. The Compose default also enables it for newly created events.
- The intended TTD Stripe sandbox is connected to all three events with test publishable and secret keys stored in the local pretix database. Stripe is enabled for test payments with cards and wallet detection. MobilePay is disabled in the sandbox and in all three events. All events remain unpublished and in pretix test mode; no live keys, webhook destination, or public checkout have been configured. The booking site's event checkout gate remains off.
- The local pretix URL is `http://127.0.0.1:8345`. Stripe cannot send webhooks to that loopback address. The owner has chosen to defer webhook setup and the next end-to-end sandbox payment tests until pretix is hosted on the VPS in a private HTTPS preview.

## Stripe account and live activation

The owner has created the TTD Stripe account and opened its sandbox. Use that sandbox for integration work; finish business verification, payout details, and any payment-method approval in the Dashboard before live payments. Do not put passwords, API keys, webhook secrets, identity documents, or bank details in Git, chat, screenshots, or logs.

## Sandbox configuration already in place

1. In the Stripe Dashboard, select the intended sandbox and obtain its **test** publishable and secret API keys. Verify their test prefixes before entering them. Do not use live keys in the local instance. This step is complete for the three local events.
2. In each pretix event, open **Settings → Payment → Stripe**. Enter the sandbox keys in the testing fields. Keep the endpoint on **Testing**. Enable cards and wallet detection for Apple Pay where Stripe offers it for this account. Keep MobilePay, bank transfer, and other payment providers disabled. This local configuration is complete for the three events.

Stripe is enabled in the three private test events. Keep the events unpublished, in test mode, and behind the booking site's disabled checkout gate until the hosted preview checks below pass. MobilePay is excluded because of its fixed monthly fee.

## When the VPS private preview is online

1. Host pretix at a stable HTTPS origin. Keep the human-facing preview private, but make the exact pretix Stripe webhook path reachable by Stripe without an interactive login or VPN. Check how the endpoint is protected before exposing it; if it cannot be safely reachable, use temporary webhook forwarding instead.
2. For each event, copy the exact webhook URL displayed by pretix and create a destination in the **same Stripe sandbox**. Follow pretix's instruction to send all event types. Confirm delivery in Stripe and the corresponding order state in pretix.
3. Using test cards and synthetic customer details, test a successful payment, a decline, a refund initiated in pretix, and an asynchronous state change. Check the final order and refund states in both systems, including repeated callback delivery. Repeat for an event-series date and the singular event.
4. Test Apple Pay on a compatible device/browser after verifying the actual HTTPS checkout domain. Keep MobilePay disabled. Leave all events unpublished and the public booking checkout gate off during these tests.

Before testing customer-initiated changes or cancellations, complete the server-side mutation and refund gates in [Booking management: deployment and remaining work](BOOKING_MANAGEMENT_DEPLOYMENT.md). The current eligibility endpoint is read-only and the local management preview changes no pretix order.

## Before any live sale

Complete Stripe's business and payout verification; review its actual payment-method availability and fees. Add live keys and a live webhook destination to the deployed pretix instance, switch the Stripe endpoint to **Live**, and test the deployed HTTPS checkout. Verify the one-room inventory, phone-verification gate, booking cancellation policy, refunds, and mail delivery described in [the events guide](../apps/booking/EVENTS.md) and the [project implementation plan](../../IMPLEMENTATION_PLAN.md). Only then publish events and enable the booking site's `PRETIX_EVENTS_CHECKOUT_ENABLED` gate. A browser return is not evidence of payment; pretix's authenticated order state is authoritative.

Sources: [pretix Stripe setup](https://docs.pretix.eu/guides/payment/stripe/), [Stripe account setup](https://docs.stripe.com/get-started/account/set-up), [Stripe testing](https://docs.stripe.com/testing), [Stripe MobilePay fees](https://docs.stripe.com/payments/mobilepay).
