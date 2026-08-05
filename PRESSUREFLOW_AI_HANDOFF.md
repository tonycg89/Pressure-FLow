# PressureFlow AI Handoff

This file is the repository onboarding context for AI systems working on PressureFlow. It summarizes the current stack, workflows, major subsystems, integration boundaries, security boundaries, testing expectations, and operational constraints.

Governance, current state, and immediate execution are owned by separate documents:

- Governance: `PRESSUREFLOW_GOVERNANCE.md`
- Roadmap: `PRESSUREFLOW_ROADMAP.md`
- Current status: `PRESSUREFLOW_MASTER_STATUS.md`
- Immediate queue: `NEXT_STEPS.md`
- Claude operating procedure: `CLAUDE_PROJECT_MANAGER.md`
- Engineering standards: `PRESSUREFLOW_ENGINEERING_STANDARDS.md`
- Product principles: `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`

## 1. AI Role Context

- Tony is product owner and final authority.
- Claude is project manager, planning coordinator, documentation steward, implementation-package author, and review layer.
- Claude does not directly modify production code.
- Codex is the lead implementation engineer and the sole AI authorized to directly modify production code.
- v0 and other AI systems provide advisory visual, UX, research, or specialist input only.

All advisory output must be reviewed, scoped, and converted into an approved implementation package before Codex changes production code.

## 2. Current Stack

PressureFlow is a plain Node/static frontend application.

- Plain HTML: `index.html`
- CSS: `styles.css`
- Vanilla browser JavaScript: `app.js`
- Node.js backend: `server.js` plus modular route/helper files
- Persistence: local JSON by default, Supabase/Postgres when `DATABASE_URL` is set
- Browser regression tests: Playwright

PressureFlow does not use React, Next.js, Tailwind, shadcn, Radix, or an approved framework migration.

The application supports an owner workspace plus isolated invited-user workspaces. It is not yet a complete self-service multi-tenant SaaS.

## 3. Product Workflow

Core job workflow:

```text
Lead -> Estimate Sent -> Estimate Signed -> Contract Sent -> Contract Signed -> Deposit Sent -> Deposit Paid -> Scheduled -> Completed -> Final Invoice Sent -> Paid
```

Supported contractor workflows include:

- Customer and job pipeline management.
- Customer records with contact details, notes, photos, saved map measurements, and job history.
- Itemized estimates with service catalog, discounts, default deposit behavior, and customer approval links.
- Customer-facing estimate approval and rejection pages.
- PressureFlow-hosted contract signing.
- Deposit and final invoices.
- Manual payment recording and configured customer payment options.
- Scheduling with Google Calendar connection where configured.
- Gmail/SMTP-style email delivery paths where configured.
- Before/after photo capture and completion proof.
- Review request automation.
- Expenses and dashboard analytics.
- Mapbox property measurement with saved polygons and reusable square footage.
- Frontend-only Tools workspace with isolated solar panel cleaning savings calculator.

## 4. Major Subsystems

- `server.js`: Node HTTP server and top-level API wiring.
- `app.js`: browser dashboard behavior and main workspace interactions.
- `index.html`: dashboard markup and dialogs.
- `styles.css`: dashboard styling and responsive behavior.
- `db.js`: local JSON and Supabase/Postgres persistence boundary.
- `settings.js`: business settings, integration readiness, and payment readiness helpers.
- `job-actions.js`: contractor workflow actions.
- `public-workflows.js`: public token workflow handlers.
- `public-pages.js`: customer-facing page rendering.
- `email-delivery.js` and `email-content.js`: email sending and content generation.
- `follow-ups.js`: automated follow-up tasks.
- `integrations/`: provider-specific integration boundaries.
- `assets/`: frontend rendering helpers and service catalog data.
- `tests/`: Playwright browser coverage and smoke checks.

## 5. Security and Tenant-Isolation Boundaries

Preserve these boundaries unless an approved package explicitly changes them:

- Auth and session behavior.
- Owner workspace and invited-user workspace separation.
- Per-account customers, jobs, expenses, photos, documents, saved services, saved measurements, business settings, and integrations.
- Public token-based estimate, contract, invoice, and completion proof routes.
- Webhook signature verification and fail-closed behavior.
- Validation and sanitization at backend boundaries.
- Local JSON and Supabase/Postgres compatibility.
- Secret handling and safe logging.

Do not weaken public token routes, expose tenant data across accounts, log secrets, or make integration mocks available to production by accident.

## 6. Integration Boundaries

Use sandbox/test credentials for audits, beta testing, and verification unless Tony explicitly approves otherwise.

Important boundaries:

- Google Calendar / Gmail connection is required by design for client communication workflows unless the audit mock mode is explicitly enabled.
- `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true` prevents real delivery but does not by itself represent a connected Google account.
- `PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true` may be paired with skipped delivery for safe hosted audit workflows.
- Stripe and Square webhook routes must keep signature validation, idempotency, amount checks, tenant routing, and safe logs.
- Mapbox requires a public token for map/geocoding flows.
- QuickBooks and Twilio are deferred unless real beta feedback exposes a blocker.

## 7. Audit and Sandbox Environment Notes

Required for map/geocoding flows:

```text
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
```

Recommended hosted audit configuration:

```text
NODE_ENV=development
ALLOW_AUTH_DISABLED=false
APP_BASE_URL=https://pressure-flow-audit.onrender.com
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
SESSION_SECRET=<separate random audit secret>
```

Use a separate staging database only if persistent audit data is needed. Never point audit services at production data.

Deployment and recovery references:

- `DEPLOYMENT.md`
- `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`
- `PRESSUREFLOW_SANDBOX_VERIFICATION.md`
- `PRESSUREFLOW_OPERATIONS_RUNBOOK.md`
- `PRESSUREFLOW_BACKUP_RECOVERY.md`
- `supabase-setup.md`
- `square-webhooks.md`
- `docs/integrations.md`

## 8. Current Capability Summary

Current implementation status belongs in `PRESSUREFLOW_MASTER_STATUS.md`. At a high level, PressureFlow has completed:

- Tenant isolation/security audit and priority fixes.
- Validation and sanitization audit and priority backend validation fixes.
- Credential/secrets audit.
- Stripe/Square webhook secret hardening.
- Smoke test plan.
- Test-user readiness checks.
- Core UI foundation and customer-facing document shell work.
- Claude UX-finding implementation packages through approved P1/P2 work.
- v0 visual polish packages that were approved for Codex implementation.
- Deployment, backup/recovery, operational monitoring, and sandbox verification documentation.
- Mobile beta hardening and photo upload stabilization.
- Customer/property/job data isolation fixes.
- Estimate email/calendar decoupling.
- Owner validation blocker fixes.
- Scheduling and rescheduling hardening.
- Review request automation.
- Map measurement usability and duplicate saved-area cleanup.
- Google OAuth durability guardrails.
- Customer-facing mobile estimate/contract table layout fixes.

This handoff intentionally does not preserve the full chronological package ledger. Historical detail belongs in archive material or implementation reports, not the active AI onboarding flow.

## 9. Testing Expectations

Run from the repo root:

```powershell
npm.cmd run check
npm.cmd run smoke:test-user-safety
npm.cmd run test:browser
```

Playwright is configured for single-worker reliability because browser specs share `.tmp/playwright-data`.

Codex closeout reports must include:

- Root cause.
- Files changed.
- Behavior changed.
- Tests run.
- Pass/fail results.
- Known unrelated failures.
- Remaining risks.
- Documentation affected.

Claude must review test evidence and diffs before marking implementation packages complete.

## 10. Operational Constraints

- Do not migrate frameworks.
- Do not introduce React, Next.js, Tailwind, shadcn, Radix, or new UI libraries without explicit approval.
- Do not change backend routes, auth, tenant isolation, validation, payments, signing, public links, integrations, or persistence behavior as part of advisory UX/UI work.
- Keep recommendations scoped, prioritized, and tied to the current app.
- Separate verified fact, reasonable inference, and recommendation.
- If documentation conflicts with repository code, inspect code and tests before making implementation-specific claims.

## 11. Where to Go Next

- Read `PRESSUREFLOW_MASTER_STATUS.md` for current implementation, verification, risks, incomplete work, and release/readiness state.
- Read `PRESSUREFLOW_ROADMAP.md` for the active phase, long-horizon sequencing, and phase exit gates.
- Read `NEXT_STEPS.md` for the immediate execution queue.
- Read `CLAUDE_PROJECT_MANAGER.md` when Claude is coordinating or preparing Codex packages.
