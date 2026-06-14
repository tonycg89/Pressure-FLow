# PressureFlow Current Status

This is the current project status and near-term action list. For AI coordination, also read `PRESSUREFLOW_AI_HANDOFF.md` before making recommendations or code changes.

## Current Phase

PressureFlow is ready for the live Claude UX audit.

Phase 06 email/document/UI foundation work is complete. Pre-audit readiness is complete. The next step is not more UI polish yet; it is a UX audit using a fresh test account, followed by reviewed/approved UX fixes, then the v0 visual/UI audit.

## Current Stack

- Plain HTML: `index.html`
- CSS: `styles.css`
- Vanilla browser JavaScript: `app.js`
- Node.js backend: `server.js` plus modular helpers/routes
- Local JSON storage by default
- Supabase/Postgres when `DATABASE_URL` is configured
- No React, Next.js, Tailwind, shadcn, Radix, or framework migration

## Completed Readiness Work

- Tenant isolation/security audit and smallest safe fixes completed.
- Validation and sanitization audit and priority backend validation fixes completed.
- Credential/secrets audit completed.
- Stripe/Square webhook secret hardening completed.
- Smoke test plan completed in `docs/test-user-smoke-plan.md`.
- UI Packages 01-06 completed.
- Phase 06 shared customer-facing document shell and transactional email shell completed.
- Pre-audit readiness completed:
  - Fresh tester Mapbox token propagation is covered when `MAPBOX_PUBLIC_TOKEN` is configured.
  - Calendarless audit scheduling is available for disconnected test accounts when explicitly enabled.
  - Playwright is configured for one worker to avoid shared `.tmp/playwright-data` races.
- Central AI handoff created: `PRESSUREFLOW_AI_HANDOFF.md`.

## Audit Environment Requirements

Configure the audit environment with:

```text
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
```

Scheduling needs one of these:

```text
PRESSUREFLOW_ALLOW_CALENDARLESS_SCHEDULING=true
```

or a dedicated connected Google test calendar for the tester account.

For local/browser smoke tests that must never send real email:

```text
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Use sandbox/test credentials only for Stripe, Square, Google, SMTP, QuickBooks, and any other integration.

## Test Status

Latest required readiness commands passed:

```powershell
npm.cmd run check
npm.cmd run smoke:test-user-safety
npm.cmd run test:browser -- --workers=1
```

Playwright also has `workers: 1` configured, so `npm.cmd run test:browser` should run the suite in the reliable single-worker mode.

## Next Action

Give Claude:

- the audit environment URL
- a fresh test login
- `PRESSUREFLOW_AI_HANDOFF.md`
- this current status file
- the instruction that Claude is performing UX audit only, not implementation

Claude should return UX findings grouped by blocker/high/medium/polish. Codex should review the findings, propose small safe implementation chunks, and only then make code changes.

After approved UX fixes are implemented and smoke-tested, give v0 the updated app plus `PRESSUREFLOW_AI_HANDOFF.md` for a visual/UI audit.

## Current Priority Order

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building

## Watch Items

- Confirm the real audit environment has `MAPBOX_PUBLIC_TOKEN`; without it, map tiles/geocoding will not work for fresh testers.
- Decide whether the audit uses a dedicated Google test calendar or calendarless audit mode.
- Keep all Claude/v0 recommendations as spec input only. Codex remains responsible for implementation.
- Do not start broad redesign or stack migration work.

## Safe To Defer

- Password reset/self-service signup.
- Full credential encryption at rest before broader beta.
- Deeper role permissions beyond owner/tester.
- Live QuickBooks sync automation.
- Twilio SMS alerts.
- Customer scheduling portal.
- Technician-only mobile workflow.
- Recurring jobs/customers.
- Broader production tenant administration.
