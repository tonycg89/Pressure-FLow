# PressureFlow Master Status

Last Updated: August 5, 2026

This file is the authoritative current-state snapshot for PressureFlow. It should answer what is implemented, what is verified, what remains incomplete, the current risks, and the current release/readiness state.

Governance belongs in `PRESSUREFLOW_GOVERNANCE.md`. Immediate execution belongs in `NEXT_STEPS.md`. AI onboarding context belongs in `PRESSUREFLOW_AI_HANDOFF.md`. Claude's operating procedure belongs in `CLAUDE_PROJECT_MANAGER.md`.

## Current Management Transition

Claude is being onboarded as PressureFlow's project manager and coordination layer. Claude manages planning, prioritization, implementation packaging, documentation stewardship, Codex review, and release coordination.

Codex remains the lead implementation engineer and the sole AI authorized to directly modify production code.

Tony remains product owner and final authority.

## Current Release and Readiness State

PressureFlow has reached the Phase 07D-6 go decision for a limited 3-5 contractor founder-led beta.

The documented Render deployment has passed core app verification, public customer workflow verification, deployed Mapbox workflow verification, deployed webhook fail-closed checks, and restart/redeploy persistence proof.

Limited beta may proceed using manual payment recording while Stripe/Square valid provider webhook verification remains pending and clearly marked as an in-progress beta limitation.

Do not start speculative expansion packages during Phase 08 unless real beta usage exposes a blocker.

## Implemented

Current implemented capabilities include:

- Owner workspace plus isolated invited-user workspaces.
- Customer and job pipeline dashboard.
- Customer records with contact details, notes, service-area photos, saved map measurements, before/after photos, and job history.
- Itemized estimates with service catalog, discounts, deposit behavior, customer approval links, and customer rejection links.
- PressureFlow-hosted customer estimate pages, contract signing pages, invoice pages, and completion proof pages.
- Contract signing without clause initials.
- Deposit and final invoice workflows, including zero-deposit handling.
- Configured payment-option display, manual payment recording, and payment readiness enforcement.
- Google/Gmail or SMTP-style email delivery paths where configured.
- Google Calendar scheduling where configured.
- Mapbox property measurement with saved polygons and reusable square footage.
- Before/after photo upload and mobile photo handoff stabilization.
- Dashboard analytics, lead-source/service/city revenue breakdowns, notifications, pending-payment visibility, and review request automation.
- Expenses and job-linked expense selection.
- Per-account business settings, default services, saved service rates, logos, templates, and integration settings.
- Frontend-only Tools workspace with isolated solar panel cleaning savings calculator.
- Local JSON persistence by default and Supabase/Postgres persistence when `DATABASE_URL` is configured.

## Verified

Recent verified work includes:

- Post-governance-transition baseline verification.
- Tenant isolation/security audit and priority fixes.
- Validation and sanitization audit and priority backend validation fixes.
- Credential/secrets audit.
- Stripe/Square webhook secret hardening.
- Test-user readiness checks and smoke test plan.
- Public document shell and transactional email shell work.
- Payment configuration enforcement.
- First-run and post-action guidance.
- Mobile and field usability hardening.
- Customer clarity and service-catalog cleanup.
- Automated destructive browser coverage.
- Customer/property/job data isolation.
- Estimate email/calendar decoupling.
- Owner validation blockers for map draft state and estimate server errors.
- Scheduling and rescheduling server-error hardening.
- Review request send action and button visibility.
- Map measurement usability and duplicate service-area cleanup.
- Google OAuth durability guardrails.
- Customer-facing mobile estimate/contract table layout fixes.

Latest documented standard verification commands:

```powershell
npm.cmd run check
npm.cmd run smoke:test-user-safety
npm.cmd run test:browser
```

Post-transition verification completed on August 5, 2026:

- `npm.cmd run check` passed.
- `npm.cmd run smoke:test-user-safety` passed.
- `npm.cmd run test:browser` passed 102/102.

During verification, stale test/smoke expectations were updated to match current documented behavior for Google/Gmail setup copy, customer-facing estimate card layout, contract duplicate-signature display, mobile before-photo gallery row behavior, and the current `Complete Job` action label. No production code changed.

## Known Risks

- Stripe/Square valid provider webhook acceptance remains pending and must stay documented as a beta limitation until proven.
- Real Gmail/SMTP delivery, live Stripe/Square sandbox handoff, and real mobile Safari/Android behavior still benefit from manual deployed verification.
- Google OAuth Testing mode can expire Gmail/Calendar refresh tokens after 7 days; production-mode OAuth consent is required for durable customer connections.
- Broader production tenant administration is not complete.
- Full credential encryption at rest remains deferred before broader beta.
- The product is not yet a self-service multi-tenant SaaS.
- Documentation has contained duplicate active sources of truth and stale Claude/v0 audit instructions; this management transition is intended to correct that.

## Incomplete or Deferred

- Password reset and self-service signup.
- Email verification.
- Broader roles and permissions.
- Broader production tenant administration.
- Full credential encryption at rest before broader beta.
- Live QuickBooks sync automation.
- Twilio SMS alerts.
- Customer scheduling portal.
- Technician-only mobile workflow.
- Recurring jobs/customers.
- Franchise support, payroll, inventory, route optimization, AI quoting, and large scheduling overhaul unless real beta feedback proves a repeated need.
- Expansion into materially different trades or workflows.

## Current Priority Order

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building

## Current Documentation State

- `PRESSUREFLOW_GOVERNANCE.md`: project authority, AI roles, approval gates, priority order, and conflict resolution.
- `CLAUDE_PROJECT_MANAGER.md`: Claude project-manager operating procedure.
- `NEXT_STEPS.md`: immediate execution queue.
- `PRESSUREFLOW_AI_HANDOFF.md`: AI onboarding context.
- `PRESSUREFLOW_ENGINEERING_STANDARDS.md`: coding, testing, root-cause, and closeout standards.
- `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`: product philosophy and feature-evaluation rules.
- `DEPLOYMENT.md`, `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`, `PRESSUREFLOW_SANDBOX_VERIFICATION.md`, `PRESSUREFLOW_OPERATIONS_RUNBOOK.md`, and `PRESSUREFLOW_BACKUP_RECOVERY.md`: operations and release-support documents.

Historical package chronology and duplicate `.txt` coordination files are archive context only, not active authority.
