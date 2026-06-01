# Pressure Washing Workflow MVP

This folder contains a local prototype for a pressure washing job automation tool.

Double-click this file to run the local dashboard:

```text
Start PressureFlow.bat
```

Or run it from PowerShell:

```powershell
.\run-local.ps1
```

Then open:

```text
http://localhost:3000
```

## Workflow

Lead -> Estimate Sent -> Estimate Signed -> Contract Sent -> Contract Signed -> Deposit Sent -> Deposit Paid -> Scheduled -> Completed -> Final Invoice Sent -> Paid

## Planned integrations

- Square for estimate approval, deposit invoices, and final invoices
- Square Contracts for contract signing
- Google Calendar for scheduling
- Email for customer notifications and reminders

## Current setup status

- Square developer access created
- Google Cloud access created
- `.env.example` created for future backend credentials
- `next-steps.md` created for safe integration setup
- `production-checklist.md` created for moving safely from sandbox/local to live production

## Current approval flow

Estimate approval happens through Square. After the estimate is approved/signed, the app sends the service contract through Square Contracts. After the contract is signed, the app sends the Square deposit invoice.

## Local MVP backend

- `server.js` serves the dashboard and API
- `package.json` provides the production `npm start` command for Render
- `render.yaml` defines a Render web service scaffold
- `data/jobs.json` stores jobs locally
- `data/settings.local.json` stores local business/integration settings and is ignored by git
- `/api/jobs` lists and creates jobs
- `/api/jobs/:id/:action` advances workflow actions
- `/api/settings` stores Square, Google, and business settings locally
- `/api/export/jobs.csv` downloads job data as a spreadsheet-friendly CSV
- `/api/export/backup.json` downloads a local backup without secret tokens
- `/webhooks/square` receives Square invoice webhooks and updates paid statuses when invoices match stored jobs
- `/api/webhooks/square/events` shows the latest local Square webhook processing log
- `Send Deposit Invoice` creates and publishes a Square sandbox invoice when Square settings are saved
- `Send Final Invoice` creates and publishes a Square sandbox invoice for the remaining balance
- `Complete Job + Send Final Invoice` generates a completion notice and immediately sends the Square final invoice
- `Check Deposit Payment` and `Check Final Payment` read the Square invoice status and only advance when Square reports paid
- Square contract, estimate, Google Calendar, and email automation are still placeholders until connected

## Production Prep

- Single-admin login is implemented but inactive locally unless `ADMIN_PASSWORD` or `ADMIN_PASSWORD_SHA256` is set
- `supabase-schema.sql` contains the planned Postgres schema
- `deployment-plan.md` documents the Render + Supabase deployment path
- `supabase-setup.md` explains how to create tables and find the Supabase connection string
- Current local app uses JSON storage; deployed app uses Supabase when `DATABASE_URL` is set

## First production build goals

- Customer and job dashboard
- Job status pipeline
- Estimate and contract templates
- Deposit invoice logic
- Scheduling with Google Calendar
- Final invoicing through Square
- Follow-up reminders until paid
