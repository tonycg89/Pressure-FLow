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
- PressureFlow-hosted contract signing with signature and executed contract link
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

- `PRESSUREFLOW_GOVERNANCE.md` - project authority, decision hierarchy, AI roles, and approval rules
- `CLAUDE_PROJECT_MANAGER.md` - Claude's project-management operating manual
- `PRESSUREFLOW_MASTER_STATUS.md` - current implementation, verification, risks, and readiness state
- `NEXT_STEPS.md` - immediate execution queue
- `PRESSUREFLOW_AI_HANDOFF.md` - AI onboarding context, architecture boundaries, workflows, and testing expectations
- `PRESSUREFLOW_ENGINEERING_STANDARDS.md` - coding, testing, root-cause, and closeout rules
- `PRESSUREFLOW_PRODUCT_PRINCIPLES.md` - product philosophy and feature-evaluation rules
- `DEPLOYMENT.md` - Render/Supabase deployment notes
- `docs/integrations.md` - Google, Mapbox, Twilio, Square/Stripe notes

## Production Host

Render hosts the web service and deploys from GitHub.

Supabase/Postgres is used when `DATABASE_URL` is set. Local JSON files are used when `DATABASE_URL` is not set.

## Current Architecture

This is an early account-isolated app:

- Owner-managed invited-user logins
- Separate business settings, jobs, customers, expenses, photos, documents, saved services, and Google connections per account
- Per-account onboarding service selection with saved default service rates
- Per-account Square, Stripe, and QuickBooks credential settings for future connected payments/accounting
- Company logos uploaded per account
- Twilio SMS alert plumbing is present but disabled by default

Before public signup, PressureFlow still needs password recovery, email verification, starter service packs, stronger roles, and production tenant administration.
