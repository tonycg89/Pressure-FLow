# PressureFlow Master Status

Last Updated: June 15, 2026

## Current Phase

- PressureFlow is ready for the live Claude UX Audit after test account Google readiness is configured.
- v0 UI Audit comes after Claude UX findings are reviewed, approved, and safely implemented by Codex.
- Do not start broad UI redesign before the UX audit is complete and approved.

## Completed Safety / Readiness Work

- Security Audit
- Tenant Isolation Audit and priority fix
- Validation Audit and priority backend validation fixes
- Credential / Secrets Audit
- Webhook Secret Hardening for Stripe and Square
- Smoke Test Plan
- Test-user readiness checks
- Pre-audit readiness pass
- Audit environment finalization
- Test account Google connection readiness
- Critical contract signing date fix
- Central AI Handoff file

## UI Packages Complete

- 01 Design System Foundation
- 02 Cards / KPI / Empty States
- 03A Forms Foundation
- 03B Settings Forms
- 03C Dynamic Forms
- 04A Tables
- 05A Modal Foundation
- 05B New Job Modal
- 05C Settings Modal
- 05D Remaining Modals
- 06A Dashboard
- 06B-1 Shared Document Shell
- 06B-2 Estimate / Invoice / Completion Documents
- 06B-3 Contract / Print
- 06C-1 Estimate Email Shell
- 06C-2 Contract Email Shell
- 06C-3 Invoice Email Shells
- 06C-4 Follow-up + Completion Email Shells
- 06C-5 Schedule Confirmation Email Shell + Mailto Audit

## Current Stack

- HTML
- CSS
- Vanilla JavaScript
- Node.js backend
- No React / Next.js / Tailwind / shadcn / Radix

## Audit Environment Requirements

- `MAPBOX_PUBLIC_TOKEN` must be configured for map/geocoding flows.
- Google Calendar / Gmail connection is required by design for client communication workflows.
- For audit accounts, either connect a dedicated Google test account/calendar or set `PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true` with `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true`.
- `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true` by itself does not represent a connected Google account.
- Use sandbox/test credentials only for Stripe, Square, Google, SMTP, QuickBooks, and other integrations.

## Testing Status

- `npm.cmd run check`: passing
- `npm.cmd run smoke:test-user-safety`: passing
- `npm.cmd run test:browser -- --workers=1`: passing
- Playwright is configured for one worker because browser specs share `.tmp/playwright-data`.

## Next

- Set the live audit Render environment to `PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true` and `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true`, confirm `MAPBOX_PUBLIC_TOKEN` is set, and redeploy.
- Give Claude a fresh test login, audit environment URL, `PRESSUREFLOW_AI_HANDOFF.md`, and this master status file.
- Claude performs UX audit only.
- Claude should return findings grouped by blocker / high / medium / polish.
- ChatGPT/project chat reviews and approves the scope.
- Codex implements approved UX fixes in small safe chunks.
- After approved UX fixes pass smoke checks, give v0 the updated app for visual/UI audit.

## Future

- v0 UI Audit after UX fixes
- Internal beta users
- External beta users
- Password reset / self-service signup
- Expanded roles and permissions
- Broader production tenant administration
