# PressureFlow Production Checklist

Use this checklist before moving from local sandbox testing to real customers.

## Current local status

- Local backend: Node.js built-in HTTP server
- Local frontend: HTML, CSS, and browser JavaScript
- Local storage: JSON files in `data/`
- Square mode: Sandbox
- Google Calendar: Connected through local OAuth
- Webhooks: Endpoint implemented, not publicly reachable from localhost

## Must change before production

### 1. Hosting

Deploy the app to a public HTTPS host.

Good options:

- Render
- Railway
- Fly.io
- DigitalOcean App Platform
- A small VPS

The production app needs a stable URL, for example:

```text
https://app.precisionpowerwashing.com
```

### 2. Database

Replace local JSON files with a real database.

Recommended:

```text
Postgres
```

Good managed options:

- Supabase Postgres
- Neon
- Railway Postgres
- Render Postgres

Tables needed:

- users
- jobs
- settings
- webhook_events
- integration_tokens

### 3. Authentication

Add login before exposing the app online.

Recommended first version:

```text
Single admin login
```

Later options:

- Google login
- Email/password
- Multiple users and roles

Current implementation:

- Single-admin login exists in `server.js`
- It activates when `ADMIN_PASSWORD` or `ADMIN_PASSWORD_SHA256` is configured
- Use `ADMIN_EMAIL` to restrict login to one email address

### 4. Secrets

Move secrets out of local files and into hosting environment variables or encrypted database storage.

Secrets include:

- Square production access token
- Square webhook signature key
- Google client secret
- Google refresh token
- Session secret

Render should set:

```text
SESSION_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
```

Never commit or upload:

```text
data/settings.local.json
```

### 5. Square production setup

In Square Developer:

- Switch from Sandbox to Production
- Get production access token
- Get production location ID
- Configure production webhook URL
- Add webhook signature key to production settings

Production webhook URL:

```text
https://app.precisionpowerwashing.com/webhooks/square
```

Recommended Square events:

- Invoice updated
- Invoice payment made
- Invoice canceled/refunded, if available

### 6. Google production OAuth

Update Google OAuth client redirect URIs.

Add:

```text
https://app.precisionpowerwashing.com/auth/google/callback
```

Keep local dev URI only if you still want local development:

```text
http://localhost:3000/auth/google/callback
```

### 7. Email sending

Replace prepared `mailto:` links with server-side sending.

Recommended options:

- Gmail API
- SendGrid
- Mailgun
- Postmark
- Resend

First emails to automate:

- Completion notice
- Deposit reminder
- Final invoice reminder
- Payment thank-you

### 8. Backups

Before going live:

- Download local backup
- Export jobs CSV
- Store backups outside the project folder

Production backups:

- Automated daily database backup
- Manual export button remains available

### 9. Production safety test

Before real customers:

1. Create a test job using your own email.
2. Send a real $1 deposit invoice.
3. Pay it.
4. Confirm the job moves to `Deposit Paid`.
5. Schedule the job.
6. Complete the job.
7. Send a real small final invoice.
8. Pay it.
9. Confirm the job moves to `Paid`.

## Can stay manual at first

- Square estimate creation
- Square contract creation/sending
- Mark estimate signed
- Mark contract signed
- Scheduling date/time selection

## Should be automatic in production

- Square deposit invoice creation
- Square final invoice creation
- Square payment status updates through webhooks
- Google Calendar event creation
- Completion notice email
- Payment reminders

## Recommended go-live sequence

1. Test single-admin login locally.
2. Replace JSON storage with Postgres.
3. Deploy to HTTPS host on Render.
4. Configure production Google redirect URI.
5. Configure Square production token/location.
6. Configure Square production webhook URL.
7. Run the $1 live payment test.
8. Use with one real customer.
9. Add automatic email reminders.
