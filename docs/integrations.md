# Integrations

This document summarizes the external services used by PressureFlow.

## Google Calendar and Gmail

Purpose:

- Create calendar events when a job is scheduled
- Send estimate, contract, invoice, schedule confirmation, and completion emails

Environment variables:

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI
GOOGLE_REFRESH_TOKEN
GOOGLE_CALENDAR_ID
```

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

Purpose:

- Send owner/admin text alerts for major events

Events:

- Estimate accepted
- Estimate rejected
- Contract signed
- Job scheduled
- Deposit paid
- Final invoice paid

Environment variables:

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_PHONE
ADMIN_ALERT_PHONE
```

Notes:

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

Square was used earlier for sandbox invoice testing and can remain as optional/legacy plumbing.

Environment variables:

```text
SQUARE_ENV
SQUARE_ACCESS_TOKEN
SQUARE_LOCATION_ID
SQUARE_WEBHOOK_SIGNATURE_KEY
```

Current recommendation:

- Keep Square optional for now.
- Use PressureFlow invoices while the workflow is being polished.

## Stripe

Stripe checkout/webhook foundation may exist in the code, but credit card processing is intentionally postponed.

Environment variables:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

Current recommendation:

- Revisit Stripe after the core workflow and mobile experience are polished.

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
