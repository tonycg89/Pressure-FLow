# PressureFlow Roadmap

Status: Approved by Tony on 2026-08-05. This is the authoritative long-horizon plan from current state to full production and mass distribution/onboarding. `NEXT_STEPS.md` is the short-term execution queue and should ladder up to whichever phase is currently active here.

This roadmap was built from direct repository inspection (`auth.js`, `workspace.js`, `billing.js`, `db.js`, `render.yaml`, `integrations/`), not from documentation claims alone, per governance requirements. Facts and inferences are separated below.

Phase transitions still require Tony's explicit sign-off. Approval of this roadmap's shape is not approval to begin Phase 3 or Phase 4 work - those phases contain items that hit governance approval gates and must be scoped with Tony before any Codex package is prepared.

## Where We Actually Are (Verified Facts, as of 2026-08-05)

- Release state: Phase 07D-6, limited 3-5 contractor founder-led beta. Manual payment recording; Stripe/Square live webhook acceptance unproven.
- Auth: single admin login via env vars, or admin-created users in `users.json`/Postgres. No public signup route, no password reset route, and no email verification route exist anywhere in `server.js`.
- Multi-tenancy: app-layer scoping by `accountId` (`workspace.js`) works for data isolation between owner and invited-user workspaces, but accounts are only created by an admin (`createAppUser`), never self-service.
- Billing: `billing.js` only computes invoice numbers and deposit/balance math for the contractor's own customers. There is no subscription or payment layer for PressureFlow charging contractors to use the product. The `plan` field on accounts is just `"owner"` or `"tester"` - not a real pricing tier.
- Persistence: local JSON by default; Postgres is available and used in production when `DATABASE_URL` is set. Already production-capable, not a blocker.
- Secrets: SMTP passwords, Square access tokens, and similar credentials are stored as plain fields in per-account settings (JSON or Postgres row) - no encryption at rest.
- Login rate limiting is in-memory (a `Map` in `auth.js`) - it resets on restart and does not share state across multiple instances. Fine for one Render instance; not fine once more than one runs.
- Deployment: one Render starter web service, no autoscaling, single health check. Adequate for founder-led beta; not sized for mass distribution.
- Google OAuth is in Testing mode, which expires refresh tokens after 7 days - already flagged as a known risk in `PRESSUREFLOW_MASTER_STATUS.md`.
- Test coverage: Playwright suite (102 passing specs as of Package 001) plus a smoke-test-user-safety script and a syntax check - a real, working regression safety net.

## Roadmap Structure

Five phases. Each phase has an objective, an exit gate (the evidence needed before moving on), and an approval flag. Items marked **[Tony approval required]** hit one of the governance approval gates (auth model, tenant-isolation model, payment-flow, or major scope).

### Phase 1 - Founder-Led Beta (current phase)

Objective: prove the core workflow end-to-end with a handful of contractors Tony onboards personally.

Exit gate:

- Stripe or Square live provider webhook acceptance proven in production: an actual received, verified, processed webhook event, not just signature-verification code.
- Full regression suite green after any change, on a documented cadence.
- No open flow-breaking bugs reported by the 3-5 beta testers.

No new architecture is required. This phase is about finishing what is already marked pending.

### Phase 2 - Production Hardening

Objective: close the risks that are fine for a handful of hand-held testers but not fine for anyone Tony did not personally onboard.

Workstreams:

- Move Google OAuth out of Testing mode into a published production consent screen.
- Encrypt credentials at rest, including SMTP passwords and Square/Stripe tokens currently stored in plain settings.
- Second tenant-isolation audit pass, specifically re-testing account-scoping logic in `workspace.js` under concurrent multi-account load.
- Replace in-memory login rate limiting with something that survives a restart and works across multiple instances.
- Confirm `PRESSUREFLOW_OPERATIONS_RUNBOOK.md` and `PRESSUREFLOW_BACKUP_RECOVERY.md` are accurate against current infrastructure, not just present.

Exit gate: known risks in `PRESSUREFLOW_MASTER_STATUS.md` are cleared or explicitly downgraded with evidence, not just carried forward.

### Phase 3 - Self-Service Onboarding Foundation **[Tony approval required]**

Objective: let a new contractor sign up without Tony personally creating their account.

This phase touches the auth model and tenant-isolation model directly, both explicit approval gates in governance. Nothing here gets packaged for Codex until Tony has approved the shape of it.

Workstreams to scope with Tony before anything is built:

- Self-service signup flow.
- Password reset and email verification, both currently fully absent.
- A real account/plan model - decide what "plan" means (free trial, flat fee, per-seat) before any code gets written, because `billing.js` currently has no concept of charging for PressureFlow itself.
- Decide whether PressureFlow needs its own Stripe subscription integration, separate from the existing Stripe/Square integrations that only handle the contractor's customer payments.
- Broader roles/permissions beyond owner/admin/tester/technician, if the self-serve model needs it.

Exit gate: a signup-to-first-job path a stranger could complete without Tony's involvement, reviewed and tested.

### Phase 4 - Scale & Operations **[Tony approval for infra/cost changes]**

Objective: the app stops assuming "a handful of known contractors."

Workstreams:

- Infrastructure beyond a single Render starter instance: autoscaling, connection pooling for Postgres, and revisiting anything that assumed one process, including the rate limiter.
- Monitoring/alerting beyond what exists today.
- Support tooling - no visible admin/support view for managing tenants at scale exists yet.
- Re-run the full engineering-standards testing checklist (happy/failure/stale-state/zero-value/mobile-viewport paths) against every workflow touched by Phase 3 changes.

Exit gate: the app can absorb new tenants without manual per-tenant attention.

### Phase 5 - Mass Distribution & Growth

Objective: actual go-to-market.

Workstreams are deliberately vague until Phases 1-4 are real: marketing/signup funnel, in-app first-run onboarding for self-serve users, and only then revisiting the currently deferred list (QuickBooks sync, Twilio SMS, customer scheduling portal, technician mobile workflow, recurring jobs, franchise support). Each must be evaluated against the Product Principles test: does this save time, make money, or reduce confusion? Build only when real usage data supports it.

## Guardrails While Executing This

- Approval of this roadmap is not approval to start Phase 3 or Phase 4 work. Phase transitions still require Tony's sign-off.
- Priority order from `PRESSUREFLOW_GOVERNANCE.md` still governs day-to-day sequencing inside a phase: stability, tenant isolation/security, core workflow speed, mobile usability, UI polish, then new features.
- If a package request does not map to the current active phase, Claude flags it as scope drift before packaging it for Codex, rather than building it silently.
- `NEXT_STEPS.md` stays the short-term execution queue; this roadmap is the longer-horizon frame it ladders up to. Status information is not duplicated between the two.

## Current Active Phase

**Phase 1 - Founder-Led Beta.** See `NEXT_STEPS.md` for the current execution queue against this phase's exit gate.
