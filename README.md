# PressureFlow

PressureFlow is a pressure washing business dashboard for managing customers, estimates, contracts, scheduling, job photos, invoices, completion notices, and owner notifications.

The app currently serves Precision Power Washing as a single-business tool. It is not multi-tenant SaaS yet.

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
- `assets/logo.png` - Precision Power Washing logo
- `DEPLOYMENT.md` - Render/Supabase deployment notes
- `NEXT_STEPS.md` - current upgrade backlog
- `docs/integrations.md` - Google, Mapbox, Twilio, Square/Stripe notes

## Production Host

Render hosts the web service and deploys from GitHub.

Supabase/Postgres is used when `DATABASE_URL` is set. Local JSON files are used when `DATABASE_URL` is not set.

## Current Architecture

This is a single-business app:

- One admin login
- One shared business profile
- One shared customer/job database
- One Google connection
- One template library
- Twilio SMS alert plumbing is present but disabled by default

For multiple businesses/users, the app needs a multi-tenant database and account model before inviting outside users.
