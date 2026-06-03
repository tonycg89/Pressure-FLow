# Deployment

PressureFlow is deployed as a Node web service on Render with Supabase/Postgres as the production database.

## Production URL

```text
https://pressure-flow.onrender.com
```

## Render

Render should be connected to the GitHub repository and main branch.

Build/start command:

```text
npm start
```

The app uses `process.env.PORT`, which Render provides automatically.

## Supabase

Set `DATABASE_URL` in Render to the Supabase connection string.

For Render free instances, use the Supabase pooler/session connection if the direct connection has IPv6 issues.

The app auto-creates/migrates needed columns through `db.js` when it starts.

## Required Production Environment Variables

App/login:

```text
APP_BASE_URL=https://pressure-flow.onrender.com
SESSION_SECRET=
ADMIN_EMAIL=
ADMIN_PASSWORD=
DATABASE_URL=
```

Google:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://pressure-flow.onrender.com/auth/google/callback
GOOGLE_REFRESH_TOKEN=
GOOGLE_CALENDAR_ID=
```

Mapbox:

```text
MAPBOX_PUBLIC_TOKEN=
```

## Deferred Production Environment Variables

Deferred Twilio owner text alerts:

```text
ENABLE_TWILIO_ALERTS=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_PHONE=
ADMIN_ALERT_PHONE=
```

Leave `ENABLE_TWILIO_ALERTS` unset or set to `false` while SMS is deferred. Set it to `true` only after the business has a valid terms/privacy web presence and Twilio A2P approval.

Optional/legacy payment integrations:

```text
SQUARE_ENV=sandbox
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_WEBHOOK_SIGNATURE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

## Google Console Requirements

OAuth redirect URI:

```text
https://pressure-flow.onrender.com/auth/google/callback
```

Enable APIs:

- Google Calendar API
- Gmail API

Add the business Gmail account as a test user while the Google app is in testing mode.

## Render Deploy Checklist

1. Commit changes in GitHub Desktop.
2. Push to GitHub.
3. Confirm Render starts a new deploy.
4. Confirm deploy is successful.
5. Open the production URL.
6. Log in.
7. Test:
   - dashboard loads
   - customer/job creation
   - estimate email
   - contract signing
   - deposit invoice
   - scheduling
   - completion photos/final invoice
   - notification dropdown

## Local vs Production Storage

Local without `DATABASE_URL`:

- JSON files in `data/`

Production with `DATABASE_URL`:

- Supabase/Postgres

Do not rely on local JSON files for production data.
