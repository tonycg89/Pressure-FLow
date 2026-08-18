# PressureFlow Next Steps

## Current Objective

Advance Phase 1 (Founder-Led Beta) of `PRESSUREFLOW_ROADMAP.md` to its exit gate.

## Current Phase

Roadmap Phase 1 - Founder-Led Beta. Production code remains unchanged pending the next approved Codex package.

## Immediate Priorities

1. Track any flow-breaking bugs reported by the 3-5 beta testers and clear them before Phase 1 is considered complete - the one remaining open Phase 1 exit-gate item.
2. Once Phase 1's exit gate is met, bring Phase 2 (Production Hardening) workstreams to Tony for sequencing.

Package 002 (narrow onboarding/catalog/scheduling to pressure-washing-only) is complete - commit `d91c672`, reviewed and verified against diff and test evidence on 2026-08-05. See `PRESSUREFLOW_PACKAGE_002_PRESSURE_WASHING_ONLY.md` for scope and closeout details.

Live Stripe/Square provider webhook verification is deferred out of Phase 1 (see `PRESSUREFLOW_ROADMAP.md` Roadmap Amendments, 2026-08-05). It is now a Phase 2 workstream gated on "before real digital payments go live," not a current blocker. Beta continues on manual payment recording per the existing 07D-6 go decision.

The full regression suite (`npm.cmd run check`, `npm.cmd run smoke:test-user-safety`, `npm.cmd run test:browser`) is already the standard verification required for every package per `PRESSUREFLOW_ENGINEERING_STANDARDS.md` - no separate cadence decision is needed.

## UI/UX Polish Queue

Six-bucket polish pass tracked here so status persists across sessions instead of living only in chat context. Status below reflects repository evidence (commit contents, diffs, test coverage) checked directly, not just self-report.

1. **Estimate Builder Polish - Mostly done.** Covered by `47e64e3`, `0eeff98`, and Package 003 (`846c72c`). Line items, deposits, photos, rate precision, and discounts have all had real work. Remaining gap, if any, is minor visual polish, not function.
2. **Customer-Facing Pages - Partially done. Next up.** Estimate/contract/invoice/proof pages exist (`public-pages.js`, `rendering.js`) and have mobile-viewport test coverage (`tests/mobile-hardening.spec.js`, "public documents remain within the mobile viewport"). However, `public-pages.js` has not been touched by any of the recent visual-polish commits (`810070e`, `b8efee5`, `47e64e3`, `0eeff98`) - those landed only in `app.js`/`styles.css`/owner-facing `index.html`. Package 003 touched `public-pages.js` only for the discount-amount fix, not styling. The owner-facing UI has had a real design pass recently; the customer-facing brand/trust surface has not kept pace. This is the recommended next package.
3. **Modal/Form Polish - Partially done.** Mobile modal fit at 375px, photo handoff, and draft recovery are covered by tests (`tests/mobile-hardening.spec.js`: "settings and workflow modals fit a 375px mobile viewport," "mobile job draft survives refresh," photo capture/gallery tests). The broader "forms feel dense/raw" pass across all modals is not confirmed complete.
4. **Pipeline/Workflow Detail Polish - Partially done.** Dashboard and job-card work exists (`b8efee5`). The job detail panel's "what's next" grouping has not had a dedicated pass.
5. **Empty/First-Run States - Mostly done.** 10 empty-state blocks in `index.html`, 34 references in `app.js`, spanning dashboard first-run, payment setup, jobs, customers, expenses, and calendar. Not the biggest remaining gap.
6. **Mobile Field Pass - Mostly done for beta safety, not exhaustive.** Real Playwright coverage exists for touch sizing, modal fit, photo upload, and public-doc viewport behavior. Known risk (already tracked in `PRESSUREFLOW_MASTER_STATUS.md`): real iOS/Android manual verification remains unverified.

Recommended sequence: Customer-Facing Pages, then Pipeline/Workflow Detail Polish. Estimate Builder just got the most recent attention via Package 003; the better return now is the surface customers actually see and the contractor's in-job "what do I do next" view.

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
