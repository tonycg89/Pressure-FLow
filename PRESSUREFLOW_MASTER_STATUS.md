# PressureFlow Master Status

Last Updated: June 16, 2026

## Current Phase

- PressureFlow has completed the approved Claude P1/P2 UX fixes and mobile beta hardening.
- v0 visual/UI audit can begin after the latest 07B fixes are deployed.
- Do not start broad UI redesign beyond approved v0 audit findings.

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
- P1 public estimate / contract success and error page fix
- Package 07B-3 payment method verification / invoice empty-state fix
- Package 07B-4 small UX cleanup bundle
- Package 07B-5 Measure From Map stability fixes
- Package 07B-6 mobile beta hardening
- Contract initials requirement removed
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
- `npm.cmd run test:browser -- --workers=1`: passing, 27 tests
- Playwright is configured for one worker because browser specs share `.tmp/playwright-data`.

## Payment Method Behavior

- Public deposit and final invoices show configured Stripe card checkout, Zelle, Cash App, Venmo, and manual payment instructions.
- Unconfigured payment methods are hidden from public invoice pages.
- Accounts with no configured payment methods show customer-safe contact fallback copy using business name, email, and phone when available.
- The contractor job detail view warns before invoice-sending actions when no payment methods are configured.

## 07B UX Cleanup Status

- Core workflow success/info alerts now use non-blocking in-app toast feedback.
- Notification bell icon has explicit visible SVG styling and remains anchored to the unread count badge.
- Open Jobs excludes fully paid jobs, including jobs with a final paid timestamp.
- Scheduled date/time displays in a human-readable format without changing stored values.
- Deferred Claude findings: Mark Deposit Paid confirmation behavior, broader public API response styling outside approved flows.

## Contract Signing UX

- Public contracts no longer require customers to initial each contract clause.
- Customers still must provide a signature date and type their full name to sign.
- Public token validation, backend signing behavior, follow-up cancellation, deposit invoice creation, and deposit follow-up scheduling remain unchanged.
- Browser coverage verifies contract signing succeeds without initials and invalid signing dates still land on the branded retry page.

## Measure From Map Stability

- After adding a drawn area, polygon drawing is re-armed so another area can be drawn immediately without clicking Clear or toggling tools.
- After updating an existing shape, Draw returns to a ready polygon mode instead of getting stuck.
- Polygon closure now requires a precise click near the starting vertex, reducing accidental premature closure near the start point.
- Automated mocked browser coverage verifies add/update re-arm behavior, multi-area totals, persistence after save/reopen, and the close-tolerance override.
- Manual verification still recommended on the deployed Mapbox map before beta: draw near the start point, intentionally close on the start point, add a second area immediately, save, and reopen.

## Mobile Beta Hardening

- Mobile form controls render at 16px on small screens to prevent iOS Safari focus zoom.
- Major workflow actions and modal buttons meet a 44px minimum mobile touch target.
- Measure From Map draw/delete controls and measurement actions meet a 44px minimum touch target.
- Public invoice, contract, and completion proof pages constrain content to the mobile viewport while preserving all visible information.
- Completion proof links and public document actions meet mobile touch target requirements.
- Automated mobile browser coverage verifies form sizing, workflow action sizing, map control sizing, public document overflow, completion proof link sizing, and public pay/sign actions.

## Next

- Deploy the latest P1/P2 public workflow, invoice payment, UX cleanup, Measure From Map stability, and mobile hardening fixes.
- Set the live audit Render environment to `PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true` and `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true`, confirm `MAPBOX_PUBLIC_TOKEN` is set, and redeploy.
- Give v0 the updated app, `PRESSUREFLOW_AI_HANDOFF.md`, and this master status file for visual/UI audit.
- v0 performs visual/UI audit only and should not assume React, Next.js, Tailwind, shadcn, Radix, or a framework migration.
- ChatGPT/project chat reviews and approves any v0 findings before Codex implements them.
- Codex implements approved UI fixes in small safe chunks.

## Future

- v0 UI Audit after UX fixes
- Internal beta users
- External beta users
- Password reset / self-service signup
- Expanded roles and permissions
- Broader production tenant administration
