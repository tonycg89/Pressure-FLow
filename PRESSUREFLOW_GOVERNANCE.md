# PressureFlow Project Governance

## Source Of Truth

This project folder contains the central coordination files for PressureFlow:

- `PRESSUREFLOW_GOVERNANCE.md`
- `PRESSUREFLOW_MASTER_STATUS.md`
- `PRESSUREFLOW_AI_HANDOFF.md`
- `# PressureFlow Project Governance.txt`
- `# PressureFlow AI Handoff.txt`
- `# PressureFlow Master Status.txt`

These files should be updated after every major project milestone when their contents are affected.

External advisors such as Claude, v0, and ChatGPT may provide recommendations, but implementation decisions must follow this governance file, the master status file, and the approved project roadmap.

---

## AI Roles

### Codex

Primary implementation engineer.

Responsibilities:

- Write code
- Refactor code
- Run tests
- Produce implementation reports
- Review, adapt, and safely implement approved recommendations

Must not:

- Change architecture without approval
- Skip testing on implementation work
- Expand scope beyond the requested package
- Blindly paste outside AI output into production code

### v0

UI and visual design consultant.

Responsibilities:

- Visual consistency
- Layout recommendations
- Component styling concepts
- UI polish critique

Must not:

- Assume React, Next.js, Tailwind, shadcn, or Radix
- Redesign workflows
- Change backend architecture
- Directly modify production code

### Claude

UX consultant.

Responsibilities:

- Workflow review
- User experience audit
- Friction analysis
- Onboarding recommendations
- Copy and task-flow critique

Must not:

- Directly drive implementation
- Override the project roadmap
- Modify production code

### ChatGPT / Project Chat

Planning and decision control.

Responsibilities:

- Decide sequence and priority
- Approve audit findings before implementation
- Coordinate between Codex, Claude, and v0

---

## Current Status

Completed:

- Security Audit
- Tenant Isolation Audit and priority fix
- Validation Audit and priority backend validation fixes
- Credential / Secrets Audit
- Webhook Secret Hardening for Stripe and Square
- Smoke Test Plan
- Test-user readiness checks
- UI Packages 01-06
- Phase 06 email shell work
- Pre-audit readiness
- Audit environment finalization
- Test account Google connection readiness
- Central AI Handoff file

Current Phase:

- Claude UX Audit is next.
- v0 UI Audit comes after Claude UX findings are reviewed, approved, and safely implemented by Codex.

---

## Decision Hierarchy

1. Project Governance
2. Master Status
3. AI Handoff
4. Codex implementation reports
5. Approved v0/Claude recommendations

If two AI systems disagree:

- Follow this Project Governance file first.
- Do not implement until the conflict is resolved.
- Stability, security, tenant isolation, credential safety, and existing production workflows take priority over UI polish.

---

## Architecture

Current Stack:

- HTML
- CSS
- Vanilla JavaScript
- Node.js backend
- Local JSON storage by default
- Supabase/Postgres when `DATABASE_URL` is configured

Not using:

- Next.js
- React
- Tailwind
- shadcn
- Radix

Any recommendation assuming those technologies must be adapted before implementation.

---

## Audit Environment Requirements

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
