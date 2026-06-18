# PressureFlow AI Handoff

This file is the shared source of truth for Codex, Claude, v0, ChatGPT, and any other AI system working on PressureFlow. Read it before making recommendations, designs, plans, or code changes.

## 1. Project Governance

- Codex is the lead implementation engineer and the only AI allowed to directly modify production code.
- Claude may provide UX audit findings, workflow critique, copy suggestions, and prioritization input only.
- v0 may provide UI/visual audit findings, layout critique, styling concepts, and component mockups only.
- ChatGPT/project chat controls planning, decisions, sequencing, and approvals.
- Outside AI output is design/spec input, not production code.
- All Claude/v0 recommendations must be reviewed, scoped, and adapted before Codex implements anything.
- Preserve backend logic, auth, validation, tenant isolation, integrations, database behavior, and existing workflows unless an explicit approved task says otherwise.

Priority order:

1. Stability and test-user readiness
2. Tenant isolation/security
3. Core workflow speed
4. Mobile usability
5. UI polish
6. New feature building

## 2. Current Stack

PressureFlow is a plain Node/static frontend application.

- HTML: `index.html`
- CSS: `styles.css`
- Vanilla JavaScript: `app.js`
- Node.js backend: `server.js` plus modular route/helper files
- Persistence: local JSON by default, Supabase/Postgres when `DATABASE_URL` is set
- No React
- No Next.js
- No Tailwind CSS
- No shadcn/ui
- No Radix
- No framework migration is approved

## 3. AI Roles

- Codex: implementation, code review, test execution, safe refactoring, final integration.
- Claude: UX audit only. Claude should identify workflow friction, confusing copy, missing feedback, prioritization, and user journey issues.
- v0: UI/visual audit only. v0 should identify visual hierarchy, spacing, layout, polish, consistency, and responsive issues.
- ChatGPT/project chat: planning, decision control, approval gates, and priority calls.

Claude and v0 should not produce drop-in production code for this project. If they include snippets, treat them as rough examples only.

## 4. Completed Phases And Packages

- Tenant isolation/security audit completed.
- Validation and sanitization audit completed.
- Integration credential and secrets audit completed.
- Webhook secret hardening completed for Stripe and Square.
- Smoke test plan created.
- UI Packages 01-06 completed:
  - Design system foundation
  - Cards, KPI stat cards, empty states
  - Form system phases
  - Table foundation
  - Modal foundation/dialog polish
  - Dashboard, customer-facing documents, contract/print, and transactional email shells
- Phase 06 email shell work is complete.
- Pre-audit readiness is complete.
- Test account Google connection readiness is complete.
- Critical contract signing date fix is complete.
- P1 public estimate / contract success and error page fix is complete.
- Package 07B-3 payment method verification / invoice empty-state fix is complete.
- Package 07B-4 small UX cleanup bundle is complete.
- Package 07B-5 Measure From Map stability fixes are complete.
- Package 07B-6 mobile beta hardening is complete.
- Package 06C-2A critical v0 UX fixes are complete.
- Package 06C-2B customer trust layer polish is complete.
- Package 06C-2C final visual consistency polish is complete.
- Package 07A-1 automated end-to-end destructive testing is complete.
- Package 07A-4A payment configuration enforcement is complete.
- Package 07A-4B first-run and post-action guidance is complete.
- Package 07A-4C mobile and field usability fixes are complete.
- Package 07A-4D customer clarity and Pool Service expansion is complete.
- Package 07B-1 multi-tenant security audit is complete.
- Package 07B-2 webhook and external integration security audit is complete.
- Package 07C-1 environment and deployment readiness audit is complete.
- Package 07C-2 backup, recovery, and data safety audit is complete.
- Package 07C-3 operational monitoring and error visibility is complete.
- Contract initials requirement removal is complete.
- Test-user readiness checks pass with the documented environment setup.

Phase 07D deployment sandbox verification status:

- Added `PRESSUREFLOW_SANDBOX_VERIFICATION.md` as the external-beta sandbox verification tracker with pass/fail/manual fields, external provider setup notes, rollback triggers, and beta go/no-go criteria.
- Initial read-only check on June 17, 2026: `GET https://pressure-flow.onrender.com/health` returned HTTP 200 with the old `{"ok":true}` payload.
- After Render environment updates/redeploy, `GET https://pressure-flow.onrender.com/health?codex=after-env-update` returned HTTP 200 with `{"ok":true,"service":"pressureflow"}`.
- 07D-1 deployed core app verification used dedicated test user `codex@test.com` with the password intentionally not documented. Login/auth, protected routes, invalid login handling, session refresh, logout, settings save, manual payment setup, customer creation/readback, and job creation/readback passed.
- 07D-1 estimate-send blocker resolved: the first deployed estimate send to the owner-approved test inbox returned 502 because Google Calendar/Gmail was not connected. The job failed closed with no `estimateSentAt` and no `estimateApprovalUrl`. After `codex.ppw@gmail.com` was added as a Google OAuth test user and connected through Settings, the retry succeeded.
- 07D-1 deployed public URL check passed: generated estimate URL used `https://pressure-flow.onrender.com/estimate/...`, the public estimate page returned HTTP 200, rendered the test job, and did not show not-found copy.
- Render logs identified the 07D-1 estimate-send cause: the test account was configured for Google email, but Google Calendar/Gmail was not connected. A subsequent Connect Google attempt was blocked by Google because the OAuth app is in Testing mode and the real Gmail account (`codex.ppw@gmail.com`) was not yet added as a Google OAuth test user.
- Added a per-test-user onboarding checklist to `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`: create a dedicated PressureFlow test user, add the real Google account as a Google OAuth test user while the app is in Testing mode, confirm redirect URI, connect Google from Settings, configure manual payment instructions, run the smoke check, and clean up/rotate after testing.
- Current recommendation: no-go for external beta until the remaining deployed sandbox checks are completed.
- Still blocked/manual after redeploy: restart/redeploy persistence proof, contract/invoice/proof public link testing, Stripe/Square sandbox webhooks, Google schedule behavior, Mapbox deployed workflow, and full deployed end-to-end workflow.
- Local Phase 07D pre-deploy checks run: `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (59 passed).

07C-3 operational monitoring and error visibility behavior:

- Added `operational-logger.js`, a lightweight console-based safe logger. It emits JSON-shaped lines with `action`, safe operational context, and redacted error details. Secret-like keys, bearer tokens, webhook signatures, and URL token/signature/password/secret parameters are redacted.
- Email failures in `email-delivery.js` now log `email_send_failed` with email type, accountId, jobId/customerId, provider, masked recipient, recipient domain, and safe error details. Audit skipped-email logs no longer print full customer email addresses or subjects.
- Webhook visibility improved in `server.js` and `webhooks.js`: rejected signatures, invalid JSON payloads, unsupported events, unknown invoices/jobs, account mismatches, invoice mismatches, amount mismatches, already-paid duplicates, status-only events, and successful payment updates emit safe structured context.
- Follow-up automation in `follow-ups.js` now logs scheduled, skipped, duplicate-reused, cancelled, auto-skipped, and failed send events with account/job/task/type/reason context.
- Payment cancellation failures in `payment-workflows.js` now log safe account/job/invoice/integration context.
- Production 500 request logging now uses the safe operational logger while keeping generic client-facing production errors.
- Added `PRESSUREFLOW_OPERATIONS_RUNBOOK.md` with where-to-look-first guidance, log field explanations, troubleshooting steps for email/webhook/public link/automation/calendar/upload/500/health failures, and a post-deploy smoke checklist.
- Updated `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md` and `DEPLOYMENT.md` to reference the operations runbook and include post-deploy log review.
- Activity trail review: important state changes remain visible through job state, follow-up tasks, Square webhook events, provider dashboards, and operational logs. A full in-app owner activity timeline is documented as future work.
- Added `tests/operational-logger.spec.js` for redaction, email masking/domain helpers, log shape, email failure visibility without body/secrets/full recipient, and safe webhook ignored-event logging.
- Tests run: `node --check operational-logger.js`; `node --check email-delivery.js`; `node --check follow-ups.js`; `node --check webhooks.js`; `node --check server.js`; `node --check tests\operational-logger.spec.js`; `npm.cmd run test:browser -- tests/operational-logger.spec.js tests/environment-readiness.spec.js`; `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (59 passed); `npm.cmd run test:browser -- tests/operational-logger.spec.js tests/webhook-security.spec.js`.
- Remaining follow-up: consider a compact owner-only activity/audit timeline after beta support patterns prove it is needed.

07C-2 backup, recovery, and data safety behavior:

- Added `PRESSUREFLOW_BACKUP_RECOVERY.md` with the operator playbook for storage audit, backup expectations, recovery procedures, local JSON safety, destructive-action safeguards, export/data portability limits, and payment/webhook recovery.
- Current production storage expectation remains Supabase/Postgres through `DATABASE_URL`; local JSON remains local/test or emergency maintenance only and production startup still fails closed without `DATABASE_URL` unless `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true` is explicitly set.
- Local JSON writes in `db.js` now write a temporary file, preserve the previous active file as `<name>.json.bak`, and then replace the active JSON file. Treat `.bak` files as local last-write safety nets, not production backups.
- Data storage audited: accounts/users/settings, customers, jobs, estimates/contracts/invoices/payment records, expenses, follow-up tasks, saved measurements, inline logos/photos/files/templates, public tokens, webhook logs, and exports.
- Destructive actions reviewed: customer, job, expense, saved measurement, custom template, logo, photos, follow-up cancellation, and manual payment actions have existing confirmation or staged-save behavior; server-side tenant scoping remains the security boundary.
- Export behavior documented: `/api/export/jobs.csv` remains tenant-scoped; `/api/export/backup.json` is owner-only and limited to public settings/statuses/jobs, not a full restore/import system.
- Payment/webhook recovery notes reference 07B-2 hardening: signed webhooks fail closed, stored invoice/account/type/amount validation is required, and duplicate paid webhooks are idempotent.
- Updated `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md` and `DEPLOYMENT.md` to point to the recovery playbook and clarify JSON `.bak` limits.
- Added `tests/data-safety.spec.js`; updated `tests/environment-readiness.spec.js` for the explicit production local JSON maintenance override.
- Tests run: `node --check db.js`; `node --check tests\data-safety.spec.js`; `node --check tests\environment-readiness.spec.js`; `npm.cmd run test:browser -- tests/data-safety.spec.js tests/environment-readiness.spec.js`; `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (54 passed).
- Remaining deployment checks: confirm Supabase backup/PITR access, rehearse restore into staging, and expand backup export only after a restore/import design is approved.

07C-1 environment and deployment readiness behavior:

- Audited environment usage for `PORT`, `NODE_ENV`, auth/session secrets, database configuration, `APP_BASE_URL`, Google/Gmail/Calendar, account SMTP settings, Mapbox, Stripe, Square, Twilio, local/test data paths, and audit/test bypass flags.
- Added `environment.js` with production startup validation. In `NODE_ENV=production`, startup fails closed when `SESSION_SECRET`, `DATABASE_URL`, or `APP_BASE_URL` are missing; when `APP_BASE_URL` is not `https://`; or when `ALLOW_AUTH_DISABLED`, `PRESSUREFLOW_SKIP_EMAIL_DELIVERY`, or `PRESSUREFLOW_AUDIT_GOOGLE_MOCK` are enabled.
- Optional integration gaps log warnings without secret values: partial Google OAuth env, Stripe key without webhook secret, Square credentials without webhook signature key, Twilio alerts missing SMS variables, and missing Mapbox token.
- `/health` returns safe JSON `{ ok: true, service: "pressureflow" }` and does not expose configuration details.
- Unexpected production 500s return generic `Unexpected server error.` to clients while logging method/path and server-side message.
- Added `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md` with required/optional env variables, sensitivity, defaults, feature dependencies, database setup, Google/Mapbox/payment/webhook/Twilio setup, post-deploy smoke tests, backup, and rollback notes. `DEPLOYMENT.md` now points to the checklist and documents startup validation.
- Added `tests/environment-readiness.spec.js` for health check output, production missing-critical-env failures, production HTTPS base URL validation, and optional integration warnings.
- Tests run: `node --check environment.js`; `node --check server.js`; `node --check tests\environment-readiness.spec.js`; `npm.cmd run test:browser -- tests/environment-readiness.spec.js`; `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (52 passed).
- Remaining deployment checks: set real production variables in Render/Supabase, verify `/health`, confirm production rejects test flags, verify deployed Stripe/Square webhook signatures, test Google OAuth callback, and confirm backups/rollback access before beta traffic.

07B-2 webhook and external integration security behavior:

- Audited `POST /webhooks/stripe`, `POST /webhooks/square`, public Stripe card handoff, webhook payment update handlers, invoice creation helpers, Stripe/Square integration helpers, and follow-up/email side effects triggered by payment events.
- Stripe webhooks require a configured webhook secret plus a valid `stripe-signature`; Square webhooks require a configured webhook signature key plus `x-square-hmacsha256-signature`. Missing signatures, invalid signatures, and missing secrets fail closed with no job mutation.
- Stripe payment events now validate metadata `accountId`, `jobId`, `invoiceType`, and `invoiceId` against stored job records before payment state can change. Square payment events resolve by stored invoice ID, then validate invoice type and amount against that job.
- Duplicate paid webhooks are idempotent: already-paid invoices do not rewrite `paidAt`, replace payment records, re-cancel follow-ups, send duplicate admin alerts, or send duplicate completion emails.
- Payment state integrity is enforced: deposit events only mark deposit invoices paid, final events only mark final invoices paid, amount mismatches are ignored without mutation, and missing/deleted jobs fail closed.
- Fixed `webhooks.js` so webhook handlers validate stored invoice/account/amount state before side effects and skip duplicate already-paid events.
- Added `tests/webhook-security.spec.js`; updated `tests/webhook-follow-up-hooks.spec.js` for stored invoice IDs and Stripe amounts. Tests cover Stripe/Square missing signature, invalid signature, missing secret, valid update, duplicate idempotency, forged metadata, unknown invoice, amount mismatch, and already-paid stability.
- Required webhook configuration: per-account `stripeWebhookSecret` or `STRIPE_WEBHOOK_SECRET` fallback for Stripe; per-account `squareWebhookSignatureKey` for Square. Tests use mocked signed payloads and do not call live Stripe or Square APIs.
- Tests run: `node --check webhooks.js`; `node --check tests\webhook-follow-up-hooks.spec.js`; `node --check tests\webhook-security.spec.js`; `npm.cmd run test:browser -- tests/webhook-follow-up-hooks.spec.js tests/webhook-security.spec.js`; `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (48 passed).
- Remaining deployment checks: configure Stripe/Square sandbox webhooks against the deployed URL, verify real provider signatures, confirm duplicate sandbox events remain idempotent, and confirm proxy headers preserve Square's notification URL exactly.

07B-1 multi-tenant security audit behavior:

- Audited authenticated records, job actions, settings/session/users, custom templates, exports, dashboard feeds, saved map measurements, follow-up automations, payment reminders, Square/Stripe webhooks, public estimate/contract/invoice/proof links, Stripe card handoff, completion photos, customer service-area photos, inline file metadata, and local/Postgres storage helpers.
- Confirmed authenticated customer/job/expense/settings/template/export/dashboard flows are tenant-scoped server-side and fail closed for cross-tenant reads, writes, deletes, and job actions.
- Confirmed public customer links require matching job ID plus token; tampered estimate, contract, invoice, and proof links return generic customer-safe pages without tenant branding or internal IDs.
- Fixed a local JSON storage weakness in `db.js`: follow-up task reads and writes now honor `accountId` options in local mode, matching Postgres behavior. Before the fix, local/test `/api/follow-up-tasks` could list all tenants' tasks and scoped writes could overwrite foreign tasks.
- Added `tests/tenant-security.spec.js` covering Tenant A/Tenant B isolation for lists, dashboard/API feeds, settings, templates, CSV export, saved measurements, follow-up tasks, cross-tenant mutations/deletes/actions, expense job links, public token tampering, valid public branding, and proof-photo isolation.
- Tests run: `npm.cmd run test:browser -- tests/tenant-security.spec.js`; `npm.cmd run check`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser` (44 passed).
- Remaining deployment checks: verify real Square/Stripe webhook signatures and tenant routing in the deployed sandbox; re-audit any future external object-storage provider because current file/photo protection relies on inline records plus tenant-scoped parent records and public token checks.

Invoice payment behavior:

- Payment is configured when at least one customer payment path exists: Square access token plus Square location ID, Stripe secret key, Zelle, Cash App, Venmo, or manual payment instructions.
- Deposit invoice sends, final invoice sends, completion-triggered final invoices, and public contract-signing deposit invoices are blocked server-side when no payment path is configured.
- Public deposit and final invoices show configured Stripe card checkout, Zelle, Cash App, Venmo, and manual payment instructions.
- Unconfigured payment methods do not render publicly.
- Accounts with no configured payment methods show a customer-safe fallback asking customers to contact the business.
- The contractor job detail view warns before invoice-sending actions when no payment methods are configured and includes a direct Settings/payment action.
- The dashboard shows a setup reminder when payment options are missing, and onboarding Preferences explains that customers need at least one payment option before invoices are sent.

07B UX cleanup behavior:

- Core workflow success/info messages use non-blocking in-app toast feedback.
- Notification bell icon renders visibly next to the unread count badge.
- Open Jobs excludes fully paid jobs, including jobs with a final paid timestamp.
- Scheduled date/time displays as readable text, while stored values remain unchanged.
- Deferred Claude findings: Mark Deposit Paid confirmation behavior, broader public API response styling outside approved flows.

Contract signing UX:

- Public contracts no longer require customers to initial each clause.
- Customers still must provide a signature date and type their full name to sign.
- Public token validation, backend signing behavior, follow-up cancellation, deposit invoice creation, and deposit follow-up scheduling remain unchanged.
- Browser coverage verifies contract signing succeeds without initials and invalid signing dates still land on the branded retry page.

Measure From Map stability behavior:

- After adding a drawn area, polygon drawing is re-armed so another area can be drawn immediately.
- After updating an existing shape, Draw returns to a ready polygon mode.
- Polygon closure requires a precise click near the starting vertex to reduce accidental closure.
- Automated mocked browser coverage verifies add/update re-arm behavior, multi-area totals, persistence after save/reopen, and the close-tolerance override.
- Manual deployed-map verification is still recommended before beta.

Mobile beta hardening behavior:

- Mobile form controls render at 16px on small screens to avoid iOS Safari focus zoom.
- Major workflow actions, modal buttons, public document actions, and completion proof links meet 44px minimum mobile touch targets.
- Measure From Map draw/delete controls and measurement actions meet 44px minimum touch targets.
- Public invoice, contract, and completion proof pages constrain content to the mobile viewport while preserving all information.
- Automated mobile browser coverage verifies these touch-target and overflow requirements.

Package 06C-2A critical UX fix behavior:

- Settings remains a single modal entry point and opens from Dashboard, Pipeline, Customers, Templates, and Expenses with pressed/expanded state and focus placement.
- Dashboard, Pipeline, Customers, Templates, and Expenses each display their own active page heading.
- Estimate builder line items no longer repeat SqFt/rate-like labels; line totals use a clear Line total label.
- New Job, Settings, Customer, Expense, Schedule, Completion, Follow-up, custom service, photo viewer, measurement, and dynamic remove controls use intentional SVG icon buttons for close/remove affordances where applicable.
- Expenses navigation uses the existing sidebar SVG icon pattern instead of a literal `$` icon.
- Onboarding business-name placeholder is example-style copy, and onboarding helper/footer text updates by step.
- Settings and New Job modals are constrained and usable at 375px mobile width with scrollable content and accessible close controls.
- Files touched for this package: `index.html`, `styles.css`, `app.js`, `tests/dashboard-analytics.spec.js`, `tests/onboarding.spec.js`, `tests/mobile-hardening.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `npm.cmd run check`; `node --check tests\dashboard-analytics.spec.js`, `node --check tests\onboarding.spec.js`, `node --check tests\mobile-hardening.spec.js`; `npm.cmd run test:browser -- --workers=1 tests/dashboard-analytics.spec.js tests/onboarding.spec.js tests/mobile-hardening.spec.js`.
- Known follow-up: in-app Browser visual verification could not attach in this Windows sandbox session; targeted Playwright coverage passed.

Package 06C-2B customer trust layer behavior:

- Customer-facing surfaces audited: public estimate approval/approved/declined/invalid pages, public contract signing/signed/executed/sign-error/invalid pages, deposit and final invoice pages, Stripe card-payment handoff form display, completion proof page, and estimate/contract/invoice/follow-up/schedule/completion email shells.
- Shared public document shell now has consistent trust pills, summary cards, action notes, professional footer/contact copy, and mobile-safe layout styling.
- Public pages consistently propagate business name, business logo, business email/phone, customer name, job address, totals, and clear CTAs where a valid public token resolves to a job/settings record.
- Estimate approval copy is clearer about what the customer is reviewing and what happens after approval.
- Contract signing keeps legal text unchanged, does not reintroduce initials, and preserves typed full-name/date behavior.
- Invoice pages render payment options cleanly and show paid invoices as paid without payment CTAs.
- Completion proof pages are branded, customer-safe, and mobile-covered.
- Email shell includes business contact in header/footer, keeps plain-text fallbacks usable, and avoids empty payment-option lists.
- Files touched: `rendering.js`, `public-pages.js`, `email-content.js`, `scripts/smoke-email-content.js`, `tests/follow-up-automation.spec.js`, `tests/pending-payments.spec.js`, `tests/mobile-hardening.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `npm.cmd run check`; `node --check rendering.js`, `node --check public-pages.js`, `node --check email-content.js`, `node --check scripts\smoke-email-content.js`, `node --check tests\follow-up-automation.spec.js`, `node --check tests\pending-payments.spec.js`, `node --check tests\mobile-hardening.spec.js`; `node scripts\smoke-email-content.js`; `npm.cmd run test:browser -- --workers=1 tests/follow-up-automation.spec.js tests/pending-payments.spec.js tests/mobile-hardening.spec.js`.
- Known follow-up: invalid/expired links cannot show tenant-specific branding because token lookup intentionally fails before tenant settings can be trusted; they use the safe generic PressureFlow/Your Company shell.

Package 06C-2C final visual consistency behavior:

- Dashboard metric cards are more compact and blank first-run accounts show a deliberate dashboard guidance panel.
- Dashboard chart and breakdown empty states use consistent icon styling and clearer no-data copy.
- The dashboard notification control is labeled `Activity`, visually separated from the timeframe select, and preserves the existing unread count/dropdown behavior.
- Settings remains a modal; it now has in-dialog section jump links and a clearer Business defaults grouping while preserving all fields.
- Save Settings, template upload/delete, and logo upload/remove use the existing toast pattern for lightweight feedback.
- 375px mobile coverage checks dashboard chrome plus Settings and New Job modal usability/overflow.
- Files touched: `index.html`, `styles.css`, `app.js`, `tests/dashboard-analytics.spec.js`, `tests/onboarding.spec.js`, `tests/mobile-hardening.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `node --check app.js`; `node --check tests\dashboard-analytics.spec.js`; `node --check tests\onboarding.spec.js`; `node --check tests\mobile-hardening.spec.js`; `npm.cmd run check`; `npm.cmd run test:browser -- tests/dashboard-analytics.spec.js tests/onboarding.spec.js tests/mobile-hardening.spec.js`.
- Known follow-up: in-app Browser visual verification still cannot attach in this Windows sandbox session (`CreateProcessAsUserW failed: 5`); targeted Playwright coverage passed.

Package 07A-1 automated destructive testing behavior:

- Added focused destructive Playwright coverage in `tests/destructive-workflows.spec.js`.
- Covered customer edge data, duplicate customer rendering, public estimate token tampering, duplicate estimate approvals, public contract malformed submissions, duplicate contract signing, invalid invoice/proof links, paid invoice state, and manual payment confirmation.
- Public contract signing now validates signer name and signature date server-side, so malformed direct posts redirect to the existing safe sign-error page and do not create incomplete signatures or deposit invoices.
- Existing manual payment tests now confirm the shared payment-method popup before marking deposit/final invoices paid.
- Existing mobile destructive coverage remains in `tests/mobile-hardening.spec.js`.
- Tests run: `npm.cmd run check`; `node --check public-workflows.js`; `node --check tests\destructive-workflows.spec.js`; `node --check tests\pending-payments.spec.js`; `node --check tests\follow-up-automation.spec.js`; `npm.cmd run test:browser -- --workers=1 tests/destructive-workflows.spec.js tests/pending-payments.spec.js tests/follow-up-automation.spec.js`; `npm.cmd run smoke:test-user-safety`; `npm.cmd run test:browser -- --workers=1`.
- Full browser suite is passing at 36 tests after Package 07A-1.
- Known follow-up: in-app Browser visual verification is still blocked in this Windows sandbox; manual deployed checks are still recommended for real Gmail/SMTP delivery, live Stripe/Square sandbox handoff, and real mobile Safari.

Package 07A-4A payment configuration enforcement behavior:

- Centralized payment readiness in `settings.js` with `hasConfiguredInvoicePaymentMethod` and `requireConfiguredInvoicePaymentMethod`.
- Server-side blocking is wired through `job-actions.js` and `public-workflows.js`, with `server.js` passing the helper into both paths.
- Customer invoice rendering in `public-pages.js` no longer uses misleading `Secure payment options` language when no visible payment option exists, hides card CTAs unless Stripe is configured, keeps manual payment instructions valid, and shows clear contact fallback copy when needed.
- Dashboard, job-detail warning, Settings CTA targeting, and onboarding guidance were updated in `index.html`, `app.js`, and `styles.css` without changing frameworks or UI libraries.
- Tests added/updated in `tests/pending-payments.spec.js`, `tests/onboarding.spec.js`, `tests/follow-up-automation.spec.js`, and `tests/mobile-hardening.spec.js`.
- Tests run: `node --check settings.js`; `node --check job-actions.js`; `node --check public-workflows.js`; `node --check public-pages.js`; `node --check app.js`; `node --check tests\pending-payments.spec.js`; `node --check tests\onboarding.spec.js`; `node --check tests\follow-up-automation.spec.js`; `node --check tests\mobile-hardening.spec.js`; `npm.cmd run check`; `npm.cmd run test:browser -- --workers=1 tests/pending-payments.spec.js tests/onboarding.spec.js tests/follow-up-automation.spec.js tests/mobile-hardening.spec.js`; `npm.cmd run test:browser -- --workers=1`.
- Known follow-up: deployed sandbox verification remains recommended for real Stripe/Square handoff behavior and Gmail/SMTP delivery.

Package 07A-4B first-run and post-action guidance behavior:

- Dashboard first-run guidance includes a `Create your first customer` CTA and the copy: `Start by adding a customer, then create a job and send your first estimate.`
- Completing onboarding shows a `Workspace setup complete` first-run state and an actionable toast CTA to create the first customer.
- Creating a customer shows success feedback with a `Create a job for this customer` CTA that opens the existing New Job flow prefilled from that customer.
- Creating a job shows `Job created successfully.` with a `View in Pipeline` CTA that selects the new job in Pipeline.
- Sending an estimate shows `Estimate sent to [email].`; when estimate follow-up automation is enabled, it also says `Automatic follow-up scheduled.`
- Contractor-side public link labels now use plain language: `View customer estimate`, `View contract page`, `View signed contract`, and `View completion proof`.
- Files touched: `index.html`, `app.js`, `styles.css`, `assets/detail-rendering.js`, `tests/onboarding.spec.js`, `tests/expense-contract-regression.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `node --check app.js`; `node --check assets\detail-rendering.js`; `node --check tests\onboarding.spec.js`; `node --check tests\expense-contract-regression.spec.js`; `npm.cmd run check`; `npm.cmd run test:browser -- --workers=1 tests/onboarding.spec.js tests/dashboard-analytics.spec.js tests/expense-contract-regression.spec.js tests/follow-up-automation.spec.js`; `npm.cmd run test:browser -- --workers=1`.
- Known follow-up: in-app Browser visual verification remains blocked in this Windows sandbox; targeted Playwright coverage passed.

Package 07A-4C mobile and field usability behavior:

- Mobile text fields remain at 16px on small screens across onboarding/settings/customer/job/payment/schedule/map/public document surfaces to avoid iOS Safari input zoom.
- Touch targets were hardened for mobile action links, toast actions, settings jump links, notification rows, photo controls, saved measurement controls, modal buttons, customer-facing CTAs, and workflow actions.
- Measure From Map controls now keep grouped styling and expand draw/delete controls to 48px on phone-width viewports while preserving the existing map workflow.
- Public estimate, contract, invoice, and completion proof pages wrap table cell content, keep controlled horizontal scrolling, and keep trust/status pills professional on phones.
- Mobile modal coverage now includes Settings, New Customer, New Job, Schedule Job, Complete Job, and Record Payment at 375px.
- Files touched: `styles.css`, `rendering.js`, `tests/mobile-hardening.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `npm.cmd run test:browser -- tests/mobile-hardening.spec.js`; `npm.cmd run check`; `npm.cmd run test:browser -- tests/measurement-map.spec.js`; `npm.cmd run test:browser`.
- Known follow-up: verify on real iOS Safari and a deployed Mapbox map before beta, since local automated coverage uses Chromium and mocked Mapbox controls.

Package 07A-4D customer clarity and Pool Service behavior:

- Customer-facing estimate, invoice, and contract service rows show clear rate units such as `$0.04 / SqFt`; `Hours` and `Per Hour` render as `per hour`.
- Estimate approval retains the valid-through summary while removing the duplicate 30-day validity callout/trust repetition.
- Completion proof pages use customer language: `Service and Payment Details`, `Payment pending` / `Payment complete`, accurate photo badges, and explicit no-photo copy.
- Contract project details reference the contractor business estimate instead of `PressureFlow estimate approved online`.
- Customer/job/onboarding forms show lightweight required-field markers where appropriate and clearer examples for job title, notes, and sensitive areas.
- Complete Job modal clarifies before/after photos are optional but recommended and will appear on completion proof.
- `Pool Service` is available in onboarding and settings. Starter services include Weekly Pool Service, Chemical Balancing, Filter Cleaning/Replacement, Pool Vacuuming, Pool Brush Service, Green Pool Cleanup, Pool Startup/Shutdown, Salt Cell services, Equipment Inspection, Pump Replacement, Pool Light Replacement, Pool Tile Cleaning, Acid Wash, and Pool Drain and Refill.
- Pool-friendly units include `Visit`, `Service Call`, `Flat Rate`, and a custom-service `Per hour` option.
- Fresh job line items start at quantity `0`, keeping new estimates at `$0.00` until quantity is entered.
- Files touched: `assets/service-catalog.js`, `app.js`, `assets/detail-rendering.js`, `index.html`, `styles.css`, `public-pages.js`, `tests/onboarding.spec.js`, `tests/mobile-hardening.spec.js`, `PRESSUREFLOW_MASTER_STATUS.md`, `PRESSUREFLOW_AI_HANDOFF.md`, `# PressureFlow Master Status.txt`, and `# PressureFlow AI Handoff.txt`.
- Tests run: `node --check app.js`; `node --check public-pages.js`; `node --check assets\detail-rendering.js`; `node --check assets\service-catalog.js`; `node --check tests\onboarding.spec.js`; `node --check tests\mobile-hardening.spec.js`; `npm.cmd run check`; `npm.cmd run test:browser -- tests/onboarding.spec.js`; `npm.cmd run test:browser -- tests/mobile-hardening.spec.js`; `npm.cmd run test:browser`.
- Known follow-up: Pool Service defaults should be tuned with real pool operator feedback before relying on them as production pricing recommendations.

## 5. Current Status

- Approved Claude P1/P2 UX fixes, mobile beta hardening, Package 06C-2A critical v0 UX fixes, Package 06C-2B customer trust layer polish, Package 06C-2C final visual consistency polish, Package 07A-1 automated destructive testing, and Packages 07A-4A through 07A-4D are complete.
- Customer-facing public pages/email shells from Package 06C-2B and app polish from Package 06C-2C are resolved locally and ready for deployment verification.
- Do not start broad UI redesign beyond approved v0 audit findings.

## 6. Audit Environment Requirements

Required for audits:

```text
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
```

For Claude/v0 hosted audit testing, use a separate Render Web Service such as `pressure-flow-audit` instead of changing the production/beta service. Recommended audit env:

```text
NODE_ENV=development
ALLOW_AUTH_DISABLED=false
APP_BASE_URL=https://pressure-flow-audit.onrender.com
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
SESSION_SECRET=<separate random audit secret>
```

Generate a PowerShell-compatible `SESSION_SECRET` with:

```powershell
$bytes = New-Object byte[] 48
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Use a separate staging database only if persistent audit data is needed; otherwise leave `DATABASE_URL` unset for disposable audit testing. Never point the audit service at production data.

Google Calendar / Gmail connection is required by design for client communication workflows. The audit environment must use one of these options:

```text
PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

or connect a dedicated Google test account/calendar for the tester account.

For local/browser smoke testing that must not send real emails:

```text
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Skipped email delivery alone does not represent a connected Google account. Use the explicit audit Google mock flag when disconnected test accounts need to complete send/schedule workflows.

Use sandbox/test credentials only. Do not use live customer email, payment, accounting, or calendar credentials during audits.

## 7. Testing Notes

Playwright is configured for one worker because browser specs share `.tmp/playwright-data`.

Run from the repo root:

```powershell
npm.cmd run check
npm.cmd run smoke:test-user-safety
npm.cmd run test:browser
```

The full browser suite should pass in single-worker mode. Targeted specs can be run one at a time if needed.

## 8. Decision Hierarchy

When documents or recommendations conflict, follow this order:

1. Project Governance
2. Master Status
3. AI Handoff
4. Codex implementation reports
5. Approved Claude/v0 recommendations

If a recommendation conflicts with stability, security, tenant isolation, credential safety, or existing production workflows, pause and ask for approval before implementation.

## 9. Rules For Future AI Recommendations

- No architecture changes without explicit approval.
- No framework assumptions.
- Do not assume React, Next.js, Tailwind, shadcn, Radix, or a component framework.
- Do not suggest implementation that requires a stack migration unless explicitly asked.
- Do not ask Claude or v0 to directly implement production code.
- Do not blindly paste outside AI code into the project.
- Do not change backend routes, auth, tenant isolation, validation, payments, signing, public links, integrations, or database behavior as part of UI/UX audit work.
- Keep recommendations scoped, prioritized, and tied to the current app.
- Separate audit findings into blockers, high-impact improvements, medium improvements, and polish.
- Codex must review every audit finding before implementation.

## 10. Next Action

Give Claude:

- a test login
- the audit environment URL
- this `PRESSUREFLOW_AI_HANDOFF.md` file
- the instruction that Claude is performing UX audit only

After Claude findings are reviewed and approved, Codex should implement the smallest safe UX fixes in chunks. Then give v0 the updated app and this handoff file for the visual/UI audit.
