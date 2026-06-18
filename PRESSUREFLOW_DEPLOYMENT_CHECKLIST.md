# PressureFlow Deployment Checklist

Last Updated: June 17, 2026

Use this checklist before promoting PressureFlow to a production or beta production environment. Do not paste secret values into this file, tickets, screenshots, or chat logs.

For backup expectations, recovery playbooks, local JSON safety, destructive-action notes, export limits, and payment/webhook recovery procedures, use `PRESSUREFLOW_BACKUP_RECOVERY.md`.

For operational troubleshooting, safe log fields, and the post-deploy smoke checklist, use `PRESSUREFLOW_OPERATIONS_RUNBOOK.md`.

For the external-beta sandbox verification tracker and go/no-go checklist, use `PRESSUREFLOW_SANDBOX_VERIFICATION.md`.

## Required Production Variables

| Variable | Required in production | Sensitive | Default if missing | Depends on it |
| --- | --- | --- | --- | --- |
| `NODE_ENV=production` | Yes | No | Development behavior | Enables production startup validation and secure cookies |
| `PORT` | Render provides | No | `3000` | HTTP server binding |
| `APP_BASE_URL` | Yes | No | Request host fallback for some links | Public estimate, contract, proof, invoice, and webhook URL generation |
| `SESSION_SECRET` | Yes | Yes | Local development fallback only | Login session and CSRF signing |
| `DATABASE_URL` | Yes | Yes | Local JSON storage, blocked in production unless `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true` | Production account/customer/job/settings storage |
| `DATABASE_SSL` | Optional | No | SSL enabled for Postgres | Supabase/Postgres connection mode |
| `ADMIN_EMAIL` | Recommended | No | Any email accepted for env-admin password login | Owner fallback login when admin password is set |
| `ADMIN_PASSWORD` or `ADMIN_PASSWORD_SHA256` | Required if no active DB users exist | Yes | No env-admin fallback | Owner fallback login |

Production startup fails if `SESSION_SECRET`, `APP_BASE_URL`, or `DATABASE_URL` are missing, if `APP_BASE_URL` is not `https://`, or if test-only bypass flags are enabled.

## Test/Audit Flags

| Variable | Production use | Sensitive | Default if missing | Notes |
| --- | --- | --- | --- | --- |
| `ALLOW_AUTH_DISABLED` | Not allowed | No | `false` | Production startup fails when true |
| `PRESSUREFLOW_SKIP_EMAIL_DELIVERY` | Not allowed | No | `false` | Production startup fails when true |
| `PRESSUREFLOW_AUDIT_GOOGLE_MOCK` | Not allowed | No | `false` | Production startup fails when true |
| `PRESSUREFLOW_DATA_DIR` | Optional for local/test only | No | `data/` | Do not use local JSON as production storage |
| `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION` | Emergency only | No | `false` | Allows production without `DATABASE_URL`; document any temporary use |

## Claude/v0 Audit Render Service

Use a separate Render Web Service for Claude/v0 audit testing instead of flipping the production/beta service between production and audit mode.

Recommended audit service values:

```text
NODE_ENV=development
ALLOW_AUTH_DISABLED=false
APP_BASE_URL=https://pressure-flow-audit.onrender.com
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
SESSION_SECRET=<separate random audit secret>
```

Do not set `DATABASE_URL` for disposable audit testing unless a separate staging database is intentionally created. Never point the audit service at the production database. Do not copy live Google, SMTP, Stripe, or Square secrets into the audit service unless a specific sandbox integration test requires sandbox-only credentials.

Generate a Windows PowerShell-compatible `SESSION_SECRET` with:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Use the printed value as `SESSION_SECRET`; use a different value from production.

## Google / Email

| Variable | Required in production | Sensitive | Default if missing | Depends on it |
| --- | --- | --- | --- | --- |
| `GOOGLE_CLIENT_ID` | Required for Google connect/send | No | Account setting or blank | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Required for Google connect/send | Yes | Account setting or blank | Google OAuth/token refresh |
| `GOOGLE_REDIRECT_URI` | Required for Google connect/send | No | Account setting or blank | OAuth callback |
| `GOOGLE_REFRESH_TOKEN` | Optional fallback | Yes | Per-account setting | Gmail/Calendar send/schedule |
| `GOOGLE_CALENDAR_ID` | Optional fallback | No | Per-account setting or primary | Calendar events |

SMTP credentials are stored per account in Settings, not as environment variables. If an account selects SMTP, Settings must include host, port, username, password, and from email.

## Test User Onboarding Checklist

Use this checklist for every PressureFlow beta/test user added to the deployed production-like service. Do not document passwords in repo files, tickets, screenshots, or chats after setup.

1. Create the PressureFlow app user.
   - Use a dedicated test login, not an owner/admin account unless owner behavior is specifically being tested.
   - Use a temporary password and rotate/delete it after verification.
   - Record only the test user's email and role in verification notes, never the password.

2. Decide which Google account will connect email/calendar.
   - The PressureFlow login email does not need to be a real Gmail inbox.
   - The Google account used in **Connect Google Calendar** must be real and accessible.
   - One Google test account can be reused across multiple PressureFlow test users if that is intentional.

3. Add the Google account as an OAuth test user while the Google app is in Testing mode.
   - In Google Cloud Console, select the PressureFlow OAuth project.
   - Go to **APIs & Services** -> **OAuth consent screen**.
   - Add the real Gmail account under **Test users** or **Audience/Test users**.
   - Save and wait a minute before retrying the OAuth flow.
   - If this is skipped, Google can show `Error 403: access_denied` with an app verification/testing message.

4. Confirm OAuth redirect configuration.
   - The OAuth client must include:

```text
https://pressure-flow.onrender.com/auth/google/callback
```

   - For a separate audit/staging service, also add that service's callback URL if Google OAuth is tested there.

5. Connect Google from the test user's PressureFlow Settings.
   - Log in as the PressureFlow test user.
   - Open Settings.
   - Click **Connect Google Calendar**.
   - Sign in with the approved real Google test account.
   - Confirm PressureFlow shows the connected state before sending estimates or scheduling jobs.

6. Configure payment readiness for invoice tests.
   - Add manual payment instructions for the test account unless Stripe/Square sandbox is being tested.
   - Do not use live payment credentials for test users.
   - Confirm Settings reports at least one configured customer payment path before invoice testing.

7. Run the per-user smoke check.
   - Log in successfully.
   - Confirm invalid login fails safely if testing auth.
   - Create a fake customer.
   - Create a fake job.
   - Send one estimate to an approved test inbox.
   - Confirm generated public links use `https://pressure-flow.onrender.com`.
   - Open the public estimate link and confirm it renders.
   - Review Render logs for `email_send_failed`, `request_failed`, or unexpected 500/502 responses.

8. Clean up after testing.
   - Delete or disable temporary test users that are no longer needed.
   - Rotate any shared temporary passwords.
   - Remove Google OAuth test users that should no longer have access.
   - Keep fake test records only if they are useful for regression verification.

## Maps

| Variable | Required in production | Sensitive | Default if missing | Depends on it |
| --- | --- | --- | --- | --- |
| `MAPBOX_PUBLIC_TOKEN` | Required for map/geocoding workflows | Public token | Account/platform setting or blank | Measure From Map and address/map features |

Startup warns when `MAPBOX_PUBLIC_TOKEN` is missing.

## Payments And Webhooks

| Variable | Required in production | Sensitive | Default if missing | Depends on it |
| --- | --- | --- | --- | --- |
| `STRIPE_SECRET_KEY` | Optional platform fallback | Yes | Per-account setting or blank | Stripe Checkout |
| `STRIPE_WEBHOOK_SECRET` | Required if using env Stripe key/webhook fallback | Yes | Per-account setting or blank | Stripe webhook verification |
| `SQUARE_ENV` | Optional | No | `sandbox` | Square API host |
| `SQUARE_ACCESS_TOKEN` | Optional platform fallback | Yes | Per-account setting or blank | Square invoice API |
| `SQUARE_LOCATION_ID` | Optional platform fallback | No | Per-account setting or blank | Square invoice API |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Required if using env Square webhook fallback | Yes | Per-account setting or blank | Square webhook verification |

Stripe and Square webhooks fail closed without a valid stored or environment webhook secret. Configure webhook URLs:

```text
https://<production-host>/webhooks/stripe
https://<production-host>/webhooks/square
```

## Optional Admin Text Alerts

| Variable | Required in production | Sensitive | Default if missing | Depends on it |
| --- | --- | --- | --- | --- |
| `ENABLE_TWILIO_ALERTS` | Optional | No | Disabled | Admin SMS alerts |
| `TWILIO_ACCOUNT_SID` | Required only when Twilio enabled | Yes | Alerts skipped | Twilio API |
| `TWILIO_AUTH_TOKEN` | Required only when Twilio enabled | Yes | Alerts skipped | Twilio API |
| `TWILIO_FROM_PHONE` | Required only when Twilio enabled | No | Alerts skipped | Twilio sender |
| `ADMIN_ALERT_PHONE` | Required only when Twilio enabled | Personal data | Alerts skipped | Alert recipient |

Startup warns when Twilio is enabled but any Twilio variable is missing.

## Database Setup

1. Create or confirm the Supabase/Postgres database.
2. Set `DATABASE_URL` in the deployment platform.
3. Leave `DATABASE_SSL` unset unless the provider requires `DATABASE_SSL=false`.
4. Start PressureFlow once; `db.js` initializes and migrates required tables/columns.
5. Confirm no production data is being written to local JSON files.

## Pre-Deploy Checklist

1. Confirm all required production variables above are set.
2. Confirm test/audit flags are absent or false.
3. Confirm owner fallback login exists through `ADMIN_PASSWORD_SHA256` or a known active app user.
4. Confirm `APP_BASE_URL` is the exact deployed HTTPS origin.
5. Confirm Google OAuth redirect URI matches `<APP_BASE_URL>/auth/google/callback`.
6. Confirm Stripe/Square webhook endpoints and secrets are configured.
7. Confirm `MAPBOX_PUBLIC_TOKEN` is available for field map workflows.
8. Confirm backup access for Supabase/Postgres before beta testing.

## Post-Deploy Smoke Tests

Run these after every production deploy. See `PRESSUREFLOW_OPERATIONS_RUNBOOK.md` for the expanded operator checklist.

1. Open `/health`; expect `{ "ok": true, "service": "pressureflow" }`.
2. Log in with an owner/test account.
3. Create a customer.
4. Create a job.
5. Send an estimate using a test email path.
6. Open the public estimate page and approve it.
7. Sign a contract.
8. Send or create a deposit invoice.
9. Confirm Stripe/Square sandbox webhook updates only the intended invoice.
10. Schedule a job and confirm Google Calendar behavior.
11. Complete a job with before/after photos.
12. Confirm final invoice and completion proof render.
13. Confirm exports only include the logged-in account's jobs.
14. Check Render logs for unexpected `request_failed`, `email_send_failed`, `webhook_signature_rejected`, or `follow_up_send_failed` entries.
15. Before inviting external beta users, complete `PRESSUREFLOW_SANDBOX_VERIFICATION.md` and confirm the go/no-go criteria are met.

## Backup And Rollback

- Confirm Supabase/Postgres point-in-time recovery or backup export before beta traffic.
- Read `PRESSUREFLOW_BACKUP_RECOVERY.md` and confirm the operator knows how to recover accidental deletion, failed deployment, corrupted settings, missed webhooks, local JSON corruption, database outage, and full environment rebuild.
- Do not treat local JSON files or `.bak` files as production backups. They are local/test safety nets only.
- If production temporarily uses `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true`, document the reason, data path, time window, and rollback plan before allowing beta traffic.
- Keep the previous known-good deployment available for rollback.
- If a deployment fails startup validation, fix environment variables instead of disabling production validation.
- If webhook signatures fail after deploy, check provider endpoint URLs and proxy headers before rotating secrets.
