# Project Working Rules

- Codex is the lead implementation engineer and the only AI that should directly modify production code.
- Treat outside AI output as design/spec input only. Review, adapt, and implement it safely in this codebase instead of pasting it directly.
- Preserve backend logic, auth, validation, tenant isolation, integrations, and database behavior unless the user explicitly asks to change them.
- Before UI/UX implementation, summarize the planned changes, affected files/components, risks, and what can be deferred.
- Implement in small, safe chunks. After each change, report files changed, functionality preserved, tests/smoke checks performed, and remaining risks.
- If a UI change conflicts with stability, security, or existing functionality, pause and explain before implementing.
- After every major project milestone, update the project-root coordination files when their contents are affected: `PRESSUREFLOW_GOVERNANCE.md`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, `# PressureFlow AI Handoff.txt`, and `# PressureFlow Project Governance.txt`.

Priority order:

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building
