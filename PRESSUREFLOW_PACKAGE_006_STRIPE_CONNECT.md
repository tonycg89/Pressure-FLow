# Package 006 - Stripe Connect for Contractor Card Payments

Status: Implemented on branch `claude/stripe-connect`. Awaiting Tony's review and live test-mode verification.
Approved by Tony: 2026-11-14 (chose "Connect button first").

## Objective

A contractor clicks **Connect with Stripe** in Settings, finishes Stripe's hosted onboarding, and from then on their customers can pay deposits and final invoices by card, with no API keys pasted and no webhook set up by the contractor.

## Repository Context (verified at 0306eb0)

- Card payments already existed: `integrations/stripe.js`, `payment-workflows.js`, `/api/public/invoices/:id/pay-card`, `/webhooks/stripe`.
- Each account pasted a raw `stripeSecretKey` and `stripeWebhookSecret` into Settings. They were stored in plain text in settings.
- The webhook did not check how old an event's timestamp was, so it could not refuse a replayed event.
- `checkout.session.async_payment_succeeded` (delayed payment methods such as ACH) was ignored.

## Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| Stripe API | v1 Accounts with `controller` properties, v1 Account Links | Stripe's Accounts v2 examples need a `.preview` API version. Payment code should not rely on a preview API. |
| Account shape | `stripe_dashboard=full`, `fees.payer=account`, `losses.payments=stripe` | Same as a Standard account. The contractor owns their Stripe account, Stripe fees and disputes. PressureFlow does not carry their negative-balance risk. |
| Charge type | Direct charge (Checkout Session created with `Stripe-Account` header) | The money lands in the contractor's account. The contractor is the merchant of record. |
| Platform fee | `STRIPE_APPLICATION_FEE_PERCENT`, default `0` | A platform fee is a pricing decision for Tony. Off by default. |
| Webhook | One platform Connect endpoint `/webhooks/stripe-connect`, secret in env only | Contractors never touch webhooks. |
| Legacy path | Pasted-key flow kept working, used only when the account is not connected | Don't break any tester who already pasted keys. Connect takes priority when both exist. |

## Scope

1. `integrations/stripe-connect.js`: platform Stripe client, create account, create account link, retrieve account, status summary, connected-account checkout session.
2. Settings: store `stripeAccountId` + `stripeConnectStatus` server-side only (never accepted from client input). Expose `stripeConnect` status to the UI.
3. Routes:
   - `POST /api/stripe/connect/start` (session + CSRF): create the account if missing, return a one-time onboarding URL.
   - `GET /auth/stripe/connect/refresh` (session): new onboarding link for an existing account, then redirect.
   - `GET /auth/stripe/connect/return` (session): re-fetch account status from Stripe, save, redirect to the app.
   - `POST /webhooks/stripe-connect` (public, signature-verified).
4. Webhook events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`, `account.application.deauthorized`.
5. Tenant check on every Connect event: `event.account` must equal the `stripeAccountId` saved for the PressureFlow account named in metadata.
6. Replay protection: refuse signatures with a timestamp more than 5 minutes off, on both Stripe endpoints.
7. Invoice page shows **Pay by Credit Card** when Connect charges are enabled, or a legacy key exists.
8. Settings UI: Connect button + status line. Legacy key fields moved under a collapsed "Advanced: use your own Stripe keys" disclosure.

## Out of Scope (follow-ups)

- PressureFlow subscription billing (Stripe Billing).
- Refund and dispute handling inside PressureFlow.
- Encrypting the legacy pasted keys at rest (becomes low-urgency once testers move to Connect; remove the legacy path later).
- Renaming `square*InvoiceId` fields used by Stripe payments.
- Disconnect button inside PressureFlow (contractors can disconnect from their Stripe dashboard, which sends `account.application.deauthorized`).

## Tony's Setup Steps (cannot be done in code)

1. In the Stripe Dashboard (test mode first), enable **Connect** for the PressureFlow platform account and complete the platform profile.
2. Copy the platform test secret key → Render env `STRIPE_PLATFORM_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint `https://pressure-flow.onrender.com/webhooks/stripe-connect`, choose **Events on connected accounts**, and select the four events above. Copy its signing secret → Render env `STRIPE_CONNECT_WEBHOOK_SECRET`.
4. Optional: `STRIPE_APPLICATION_FEE_PERCENT` (for example `1` = 1%). Leave unset for no platform fee.
5. Repeat with live keys only after a full test-mode payment works end to end.

## Acceptance Criteria

- Connect button creates the account once (a second click reuses it) and redirects to Stripe onboarding.
- Return URL saves `chargesEnabled` / `detailsSubmitted` / `payoutsEnabled` read from Stripe, not from the URL.
- Paid Connect checkout moves the job to Deposit Paid / Paid exactly once. A duplicate event is ignored.
- A Connect event whose `event.account` doesn't match the tenant's saved account is ignored.
- A bad, missing, or stale signature gets 401.
- All existing tests still pass. New tests cover the above.
