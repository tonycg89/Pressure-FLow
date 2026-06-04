# Integrations

This document summarizes the external services used by PressureFlow.

## Google Calendar and Gmail

Purpose:

- Create calendar events when a job is scheduled
- Send estimate, contract, invoice, schedule confirmation, and completion emails

Platform environment variables:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
```

Per-account settings:

- Google calendar ID
- Google refresh token from the account's Connect Google Calendar flow

Production redirect URI:

```text
https://pressure-flow.onrender.com/auth/google/callback
```

Required APIs:

- Google Calendar API
- Gmail API

Notes:

- The connected Google account is the account that sends customer emails.
- If Gmail API was newly enabled, wait several minutes and reconnect Google from Settings.
- If the Google app is in testing mode, the sending account must be listed as a test user.

## Mapbox

Purpose:

- Geocode customer addresses
- Show satellite map
- Draw/edit/delete service-area polygons
- Calculate square footage using Turf.js
- Save map measurements to the customer file

Environment variable:

```text
MAPBOX_PUBLIC_TOKEN
```

Recommended restriction:

- Restrict the public token to the production Render domain.
- Keep only the public scopes needed for styles/tiles/geocoding.

## Twilio

Status:

- Deferred until PressureFlow is ready to scale.
- SMS alerts are disabled by default, even if Twilio credentials are present.
- Re-enable only after the business has a valid public terms/privacy web presence and A2P 10DLC approval.

Purpose:

- Send owner/admin text alerts for major events

Events:

- Estimate accepted
- Estimate rejected
- Contract signed
- Job scheduled
- Deposit paid
- Final invoice paid

Platform environment variable:

```text
ENABLE_TWILIO_ALERTS=true
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_PHONE
ADMIN_ALERT_PHONE
```

Notes:

- Leave `ENABLE_TWILIO_ALERTS` unset or set to `false` while SMS is deferred.
- `TWILIO_FROM_PHONE` is the Twilio number texts are sent from.
- `ADMIN_ALERT_PHONE` is the owner cell phone.
- Use full E.164 format, for example `+19515551234`.
- U.S. business SMS may require A2P 10DLC campaign approval before texts deliver reliably.

## PressureFlow Invoices

The current preferred flow is PressureFlow-generated invoices sent by Gmail.

Payment methods can be shown in invoice emails/settings:

- Zelle
- Cash App
- Venmo
- Manual payment instructions

Credit card payments are not the current priority.

## Square

Square can now be saved per account from Settings.

Optional platform fallback variables:

```text
SQUARE_ENV
SQUARE_ACCESS_TOKEN
SQUARE_LOCATION_ID
SQUARE_WEBHOOK_SIGNATURE_KEY
```

Per-account settings:

- Square environment
- Square location ID
- Square access token
- Square webhook signature key

## Stripe

Stripe checkout can use each account's saved Stripe secret key. The webhook secret can be saved per account for readiness, while the current shared webhook endpoint still supports the Render fallback secret.

Optional platform fallback variables:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Per-account settings:

- Stripe secret key
- Stripe webhook secret

## QuickBooks

QuickBooks profile fields are stored per account so each tester can prepare their own accounting connection without Render changes.

Per-account settings:

- QuickBooks company/realm ID
- QuickBooks client ID
- QuickBooks client secret
- QuickBooks redirect URI

OAuth token exchange and invoice/customer sync are still the next integration step.

## Supabase

Purpose:

- Production Postgres database

Environment variable:

```text
DATABASE_URL
```

Notes:

- Use the pooler/session connection if Render has IPv6/direct connection issues.
- `db.js` handles schema creation/column additions at startup.
- Long-term, photos/templates/contracts should move to Supabase Storage or another object storage service.
