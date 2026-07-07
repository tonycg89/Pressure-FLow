# PressureFlow Engineering Standards

## Purpose

This document defines mandatory engineering standards for all future PressureFlow packages. Every implementation package must preserve beta stability, tenant safety, workflow reliability, and test-user readiness unless an explicit package requirement documents an exception.

## Business Logic Standards

- Do not duplicate business logic across frontend, backend, public pages, settings, and storage layers.
- Centralize shared calculations in helper modules whenever practical.
- If duplication is unavoidable, document why in the closeout report.
- Billing, deposits, totals, invoice balances, follow-up timing, customer/job ownership, and service catalog logic must use shared helpers where possible.

## Numeric Defaults

- Never use `||` for numeric defaults where `0` is a valid user value.
- Use `??` for nullish fallback behavior.
- Preserve valid values such as:
  - `0`
  - `false`
  - empty string when intentionally allowed
- Test `0`, `null`, `undefined`, and empty string for touched numeric/business-rule fields.

## Error Handling Standards

- API and action routes must return structured JSON on success and failure.
- Do not allow empty 500/502 responses.
- Async route/action handlers must use appropriate try/catch or centralized error handling.
- Log server-side action failures with enough context to debug without leaking sensitive data.
- Frontend success toasts must only display after confirmed successful backend responses.
- Failed requests must show clear user-facing errors.

## Data Compatibility Standards

- Existing workspace data must continue to load after changes.
- Historical jobs, customers, estimates, contracts, invoices, and payments must not be deleted or corrupted.
- Deprecated selectable values must be sanitized at load and save boundaries.
- Stale localStorage, drafts, cached settings, and seed/demo data must be considered.
- Ownership must be based on IDs, not inferred from address, email, or display text unless explicitly designed.

## Workflow Stability Standards

- Core workflows must remain recoverable without browser refresh/back button.
- Draft data should be preserved before risky actions such as file picker handoffs, modal transitions, external redirects, or public-page handoffs.
- Mobile scroll/focus state must be restored after modals, uploads, and overlays.
- No package should introduce false success states.

## Testing Standards

Every workflow package must include relevant regression tests.

Required testing mindset:

- Happy path
- Failure path
- Stale-state path when localStorage/settings/drafts/catalogs are touched
- Zero-value path when numeric/business fields are touched
- Mobile viewport path when UI, modal, upload, or layout changes are touched

Standard verification:

- `npm.cmd run check`
- Focused browser tests for the touched workflow
- `npm.cmd run test:browser`

If a known unrelated test failure exists, document it clearly and do not hide new failures behind it.

## Deployment and Environment Standards

- Consider production/deployed behavior, not just local behavior.
- Consider missing or expired environment variables/tokens.
- Consider browser cache and stale deployed assets.
- Consider timeout, payload size, malformed JSON, and failed third-party integrations.
- External integrations must fail gracefully.

## Closeout Report Requirements

Every package completion report must include:

- Files changed
- Behavior changed
- Tests run
- Pass/fail results
- Known unrelated failures
- Root cause of bug or issue
- Guardrails added
- Remaining risks
- Documentation updated

## Mandatory Package Closeout Rule

All future packages must comply with this document unless an exception is explicitly documented in the package closeout report.
