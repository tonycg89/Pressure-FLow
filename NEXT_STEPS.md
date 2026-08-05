# PressureFlow Next Steps

## Current Objective

Advance Phase 1 (Founder-Led Beta) of `PRESSUREFLOW_ROADMAP.md` to its exit gate.

## Current Phase

Roadmap Phase 1 - Founder-Led Beta. Production code remains unchanged pending the next approved Codex package.

## Immediate Priorities

1. Package 002: narrow onboarding, service catalog, and scheduling instructions to pressure-washing-only, removing the Landscaping/Handyman/Construction industry paths that drifted from `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`. Approved by Tony 2026-08-05.
2. Track any flow-breaking bugs reported by the 3-5 beta testers and clear them before Phase 1 is considered complete - the one remaining open Phase 1 exit-gate item.
3. Once Phase 1's exit gate is met, bring Phase 2 (Production Hardening) workstreams to Tony for sequencing.

Live Stripe/Square provider webhook verification is deferred out of Phase 1 (see `PRESSUREFLOW_ROADMAP.md` Roadmap Amendments, 2026-08-05). It is now a Phase 2 workstream gated on "before real digital payments go live," not a current blocker. Beta continues on manual payment recording per the existing 07D-6 go decision.

The full regression suite (`npm.cmd run check`, `npm.cmd run smoke:test-user-safety`, `npm.cmd run test:browser`) is already the standard verification required for every package per `PRESSUREFLOW_ENGINEERING_STANDARDS.md` - no separate cadence decision is needed.

## Current Blockers

- None open. Phase 1 is waiting on real beta usage/tester feedback rather than any pending setup task.

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
