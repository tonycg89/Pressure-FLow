# PressureFlow Project Governance

## Highest Authority

Tony is PressureFlow's product owner and final decision-maker.

This file is the highest standing project authority after Tony's explicit approved decisions. It defines decision hierarchy, AI role authority, architecture-change approval, product identity, priority order, and conflict resolution.

Repository code and test evidence determine implementation truth when status documentation is stale, but code does not override this governance file, approved product policy, or Tony's explicit decisions.

## Required Engineering and Product Standards

- All development packages must comply with `PRESSUREFLOW_ENGINEERING_STANDARDS.md`.
- All product decisions must align with `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`.
- Package closeout reports must identify any exceptions.
- These standards are mandatory unless Tony explicitly approves and documents an override.

## AI Roles

### Tony

Tony owns product vision, priority calls, release decisions, architecture approvals, major scope approvals, and governance changes.

Tony resolves conflicts that cannot be settled by the active project documents.

### Claude

Claude is PressureFlow's project manager and coordination layer.

Claude may:

- Review repository state before planning.
- Maintain the execution queue.
- Prioritize approved work.
- Prepare small Codex implementation packages.
- Review Codex implementation reports, diffs, and test evidence.
- Track risks, blockers, technical debt, and documentation drift.
- Maintain or propose updates to project-management documentation.
- Coordinate release-readiness reviews.

Claude must not:

- Directly modify production code unless Tony explicitly changes this governance later.
- Silently expand scope.
- Approve its own architecture changes.
- Treat an implementation report as proof without verifying repository evidence.
- Override Tony, this governance file, engineering standards, product principles, auth rules, tenant-isolation rules, or approved architecture.

Claude's detailed operating procedure lives in `CLAUDE_PROJECT_MANAGER.md`.

### Codex

Codex is the lead implementation engineer and the sole AI authorized to directly modify production code.

Codex may:

- Implement approved code changes.
- Refactor code within approved scope.
- Run tests and diagnostics.
- Produce implementation and closeout reports.
- Review, adapt, and safely implement approved recommendations.

Codex must not:

- Change architecture without approval.
- Skip relevant verification on implementation work.
- Expand scope beyond the approved package.
- Redefine roadmap or product policy.
- Blindly paste outside AI output into production code.
- Weaken auth, validation, tenant isolation, integrations, persistence behavior, public token routes, or working workflows unless the approved task explicitly requires it.

### v0

v0 is a UI and visual design advisor.

v0 may provide visual consistency findings, layout recommendations, styling concepts, component mockups, and UI polish critique.

v0 must not assume React, Next.js, Tailwind, shadcn, Radix, or any framework migration. v0 output is advisory and must be reviewed and converted into an approved Codex package before production code changes.

### ChatGPT and Other AI Systems

ChatGPT and other AI systems may assist with planning, analysis, research, or specialist recommendations.

Their output is advisory unless Tony explicitly approves it into the project authority model. They must not directly modify production code or override the repository authority defined here.

## Document Authority Order

When documents, chats, recommendations, or implementation reports conflict, follow this order:

1. Tony's explicit approved decision
2. `PRESSUREFLOW_GOVERNANCE.md`
3. `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`
4. `PRESSUREFLOW_ENGINEERING_STANDARDS.md`
5. `PRESSUREFLOW_MASTER_STATUS.md`
6. `NEXT_STEPS.md`
7. `PRESSUREFLOW_AI_HANDOFF.md`
8. `CLAUDE_PROJECT_MANAGER.md` for Claude's operating procedure
9. Approved implementation package
10. Codex implementation report and repository evidence
11. Advisory output from v0 or other AI systems

Repository code and tests are the final evidence of what is implemented. They do not override governance, approved architecture, or product policy.

## Document Responsibilities

- `README.md`: product overview, current capabilities, high-level architecture, local startup, and links.
- `PRESSUREFLOW_GOVERNANCE.md`: authority, AI roles, approval rules, priority order, and conflict resolution.
- `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`: product philosophy, simplicity rules, pressure-washing focus, and feature-evaluation rules.
- `PRESSUREFLOW_ENGINEERING_STANDARDS.md`: coding, testing, root-cause, and implementation-closeout rules.
- `PRESSUREFLOW_MASTER_STATUS.md`: current implementation, verification, risks, incomplete work, and release state.
- `NEXT_STEPS.md`: short immediate execution queue.
- `PRESSUREFLOW_AI_HANDOFF.md`: AI onboarding context, stack, workflows, subsystems, boundaries, testing expectations, and operational constraints.
- `CLAUDE_PROJECT_MANAGER.md`: Claude's project-management operating procedure.
- Operations documents: deployment, recovery, sandbox verification, and runbook procedures.
- Archive documents: historical context only, not active authority.

Duplicate legacy `.txt` coordination files are archival only and are not mandatory sources of truth.

## Priority Order

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building

If a recommendation conflicts with stability, security, tenant isolation, credential safety, or existing production workflows, pause and ask for approval before implementation.

## Product Identity Rule

PressureFlow serves pressure washing companies first.

Every major feature decision should be evaluated through the lens of a pressure washing owner/operator before considering broader trade applicability. The product should become the easiest CRM for pressure washing companies to estimate, sell, schedule, complete, and get paid for jobs.

Feature proposals should pass at least one of these tests:

- Does this save time?
- Does this make money?
- Does this reduce confusion?

If the answer is no to all three, move it to the backlog.

Avoid drifting into a generic CRM, generic field-service platform, bloated enterprise system, or feature-packed but confusing product. Keep PressureFlow simple, fast, mobile-friendly, pressure-washing focused, easy to learn, and easy to sell.

Adjacent trades and new verticals may be considered only when they share the core PressureFlow workflow. Any new trade should share at least 80% of the existing workflow and must not require rebuilding the product.

## Architecture

Current stack:

- Plain HTML in `index.html`
- CSS in `styles.css`
- Vanilla browser JavaScript in `app.js`
- Node.js in `server.js` and modular backend files
- Local JSON persistence by default
- Supabase/Postgres when `DATABASE_URL` is configured
- Playwright browser regression tests

Not using:

- React
- Next.js
- Tailwind
- shadcn
- Radix

No framework migration is approved. Any recommendation assuming those technologies must be adapted before implementation.

The application supports an owner workspace and isolated invited-user workspaces. It is not yet a complete self-service multi-tenant SaaS.

## Approval Gates

Tony must approve before any AI recommends, coordinates, or implements:

- Framework migration
- Major schema redesign
- Removal or replacement of a working subsystem
- Authentication model changes
- Tenant-isolation model changes
- Payment-flow changes with financial implications
- Major third-party integration replacement
- Broad product repositioning
- Expansion into a materially different trade or workflow
- Destructive migration or data deletion
- Governance changes
- Production release when material verification is incomplete

## Audit and Sandbox Environment Requirements

Required for audit map/geocoding flows:

```text
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
```

Google Calendar / Gmail connection is required by design for client communication workflows. Audit accounts require either a dedicated connected Google test account/calendar or:

```text
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Skipped email delivery alone does not represent a connected Google account.

For local/browser smoke testing that must not send real email:

```text
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Use sandbox/test credentials only during audits and beta testing.
