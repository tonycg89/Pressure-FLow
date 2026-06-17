# Deployment

PressureFlow is deployed as a Node web service on Render with Supabase/Postgres as the production database.

For the full production environment matrix, webhook setup, smoke test list, backup reminders, and rollback notes, use `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`.

For the backup/recovery playbook, local JSON fallback safety notes, destructive-action review, export limits, and payment/webhook recovery steps, use `PRESSUREFLOW_BACKUP_RECOVERY.md`.

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

Keep `ADMIN_EMAIL` and `ADMIN_PASSWORD` set as the owner fallback login. Additional tester/admin logins can be created inside PressureFlow under **Settings > Team access**; those invited users are stored in the app database with password hashes.

When `NODE_ENV=production`, PressureFlow will not start unless `SESSION_SECRET` is set and authentication is available through `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SHA256`, or at least one active app user. This prevents accidentally deploying the app with login disabled.

Production startup also validates:

- `DATABASE_URL` must be set unless `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true` is explicitly used for a temporary maintenance deployment.
- `APP_BASE_URL` must be set to a valid `https://` URL.
- `ALLOW_AUTH_DISABLED`, `PRESSUREFLOW_SKIP_EMAIL_DELIVERY`, and `PRESSUREFLOW_AUDIT_GOOGLE_MOCK` must not be enabled in production.
- Optional integration gaps are logged as warnings without printing secret values.

Google:

```text
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://pressure-flow.onrender.com/auth/google/callback
```

Each account saves its own calendar ID and connected Google refresh token from Settings.

Mapbox:

```text
MAPBOX_PUBLIC_TOKEN=
```

Claude/v0 audit mode:

```text
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Use these only for the audit/test deployment when the tester account is not connected to a dedicated Google test account. This lets Google-dependent send/schedule workflows run without sending real email or creating real calendar events. `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true` by itself does not represent a connected Google account.

Do not enable these flags with `NODE_ENV=production`; production startup validation fails closed when they are present.

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

Optional platform fallback payment variables:

```text
SQUARE_ENV=sandbox
SQUARE_ACCESS_TOKEN=
SQUARE_LOCATION_ID=
SQUARE_WEBHOOK_SIGNATURE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

For tester/customer accounts, enter Square, Stripe, and QuickBooks credentials inside PressureFlow Settings instead of adding them to Render.

QuickBooks credentials are currently stored per account in Settings; there are no QuickBooks environment variables used by the app.

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
8. Open `/health` and confirm it returns `{"ok":true,"service":"pressureflow"}` without configuration details.
9. Run the expanded post-deploy checklist in `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`.

## Local vs Production Storage

Local without `DATABASE_URL`:

- JSON files in `data/`
- Each write keeps the previous file beside it as `<name>.json.bak`

Production with `DATABASE_URL`:

- Supabase/Postgres

Do not rely on local JSON files or `.bak` files for production data or production backups.
