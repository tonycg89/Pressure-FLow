# PressureFlow

PressureFlow is a pressure washing business dashboard for managing customers, estimates, contracts, scheduling, job photos, invoices, completion notices, and owner notifications.

The app currently supports an owner workspace plus isolated invited-user trial workspaces. It is not a complete self-service multi-tenant SaaS yet.

## Current Workflow

Lead -> Estimate Sent -> Estimate Signed -> Contract Sent -> Contract Signed -> Deposit Sent -> Deposit Paid -> Scheduled -> Completed -> Final Invoice Sent -> Paid

## Main Features

- Customer and job pipeline dashboard
- Customer files with contact info, service-area photos, saved map measurements, before/after photos, and job history
- Itemized estimates with service catalog, discounts, 25% default deposit, and 30-day estimate validity
- Customer estimate approval and rejection links
- PressureFlow-hosted contract signing with initials, signature, and executed contract link
- Deposit and final invoices generated directly in PressureFlow
- Before/after photo capture for job creation and completion
- Final completion certificate email
- Google Calendar scheduling and Gmail sending
- Mapbox property measurement with saved polygons and reusable square footage
- Dashboard revenue breakdown by lead source, service, or city
- Dashboard notification dropdown
- Deferred Twilio SMS owner alerts for a future scaled version
- Uploadable document templates

## Local Run

Double-click:

```text
Start PressureFlow.bat
```

Or run from PowerShell:

```powershell
.\run-local.ps1
```

Then open:

```text
http://localhost:3000
```

## Useful Files

- `server.js` - Node HTTP server, API routes, email/calendar/webhook logic
- `app.js` - browser dashboard behavior
- `index.html` - dashboard markup and dialogs
- `styles.css` - dashboard styling and mobile layout
- `db.js` - local JSON and Supabase/Postgres persistence
- `templates/pressure-washing-service-agreement.json` - service agreement clause data
- Company logos are uploaded per account from Settings
- `DEPLOYMENT.md` - Render/Supabase deployment notes
- `NEXT_STEPS.md` - current upgrade backlog
- `docs/integrations.md` - Google, Mapbox, Twilio, Square/Stripe notes

## Production Host

Render hosts the web service and deploys from GitHub.

Supabase/Postgres is used when `DATABASE_URL` is set. Local JSON files are used when `DATABASE_URL` is not set.

## Current Architecture

This is an early account-isolated app:

- Owner-managed invited-user logins
- Separate business settings, jobs, customers, expenses, photos, documents, saved services, and Google connections per account
- Company logos uploaded per account
- Twilio SMS alert plumbing is present but disabled by default

Before public signup, PressureFlow still needs password recovery, email verification, starter service packs, stronger roles, and production tenant administration.
