# PressureFlow AI Working Rules

## Required Reading

1. `PRESSUREFLOW_GOVERNANCE.md`
2. `PRESSUREFLOW_MASTER_STATUS.md`
3. `NEXT_STEPS.md`
4. `PRESSUREFLOW_AI_HANDOFF.md`
5. `PRESSUREFLOW_PRODUCT_PRINCIPLES.md`
6. `PRESSUREFLOW_ENGINEERING_STANDARDS.md`
7. `CLAUDE_PROJECT_MANAGER.md` when Claude is managing work

## Roles

- Tony: product owner and final authority.
- Claude: project manager and coordination layer.
- Codex: lead implementation engineer and only AI authorized to directly modify production code.
- v0 and other AIs: advisory input only.

## Universal Rules

- Inspect the repository before making implementation-specific claims.
- Preserve auth, validation, tenant isolation, integrations, persistence behavior, and working workflows unless an approved package explicitly changes them.
- Use small, reviewable packages.
- Report evidence, not assumptions.
- Stop for approval when architecture, security, governance, destructive data behavior, or major scope changes are involved.
- Update only the authoritative document for the information that changed.

## Priority Order

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building
