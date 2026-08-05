# PressureFlow Next Steps

## Current Objective

Advance Phase 1 (Founder-Led Beta) of `PRESSUREFLOW_ROADMAP.md` to its exit gate.

## Current Phase

Roadmap Phase 1 - Founder-Led Beta. Production code remains unchanged pending the next approved Codex package.

## Immediate Priorities

1. Obtain proof of live Stripe or Square provider webhook acceptance in production (an actual received, verified, processed webhook event) - the last open Phase 1 exit-gate item per `PRESSUREFLOW_ROADMAP.md`.
2. Confirm a documented cadence for re-running the full regression suite (`npm.cmd run check`, `npm.cmd run smoke:test-user-safety`, `npm.cmd run test:browser`) after future changes.
3. Track any flow-breaking bugs reported by the 3-5 beta testers and clear them before Phase 1 is considered complete.
4. Once Phase 1's exit gate is met, bring Phase 2 (Production Hardening) workstreams to Tony for sequencing.

## Current Blockers

- Live Stripe/Square provider webhook acceptance is unproven; needs sandbox/live provider credentials and a real webhook event to test against, not just code review.

## Acceptance Conditions

- Claude's role is consistent across active documentation.
- Codex remains the sole AI production-code editor.
- Duplicate active sources of truth are removed from the required workflow.
- Current status, immediate priorities, and AI operating procedures each have one authoritative owner.
- Claude can onboard from the repository without relying on prior chats.
- Baseline verification after the governance transition is complete.
- Work stays mapped to the current active roadmap phase; anything else is flagged as scope drift before being packaged.

## Explicitly Deferred

- Broad framework migration.
- Self-service SaaS expansion beyond the current owner workspace and invited-user workspace model.
- New feature work not selected from verified tester feedback, known issues, or current business goals.
- Deletion of archived legacy coordination files unless Tony separately approves deletion.
- Password reset and self-service signup.
- Full credential encryption at rest before broader beta.
- Deeper role permissions beyond owner/tester.
- Live QuickBooks sync automation.
- Twilio SMS alerts.
- Customer scheduling portal.
- Technician-only mobile workflow.
- Recurring jobs/customers.
- Broader production tenant administration.
