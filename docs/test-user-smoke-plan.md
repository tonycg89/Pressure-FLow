# Test User Smoke Plan

This checklist is the minimum repeatable pass before inviting outside test users. It is intentionally small: verify safety first, then the core workflow, then the business/UI surfaces most likely to affect a real tester.

## 1. Manual Smoke Checklist

### Account/User Safety
- Create a tester account from Settings > Team Access.
- Log out, then log in as the tester with the temporary password.
- Confirm the tester only sees their own dashboard, customers, jobs, expenses, settings, and follow-up tasks.
- Confirm non-owner users cannot see Team Access, backup export, owner Google platform fields, or webhook events.
- In a second account, create a customer/job/expense. Try direct URLs/API actions using the first account session and confirm they return not found or forbidden.

### Core Workflow
- Create a customer with name, email, phone, and service address.
- Create a job from that customer.
- Add line items and confirm the estimate total/deposit/final balance calculate correctly.
- Send the estimate.
- Open the public estimate link and approve it.
- Confirm the job advances and the contract link is generated/sent.
- Open/sign the public contract.
- Confirm the deposit invoice is generated.
- Mark the deposit paid manually.
- Schedule and complete the job.
- Send the final invoice.
- Mark the final invoice paid manually.
- Confirm the job reaches Paid and payment history is shown.

### Business Features
- Send an estimate and confirm an automatic follow-up is scheduled.
- Approve or decline the estimate and confirm the pending follow-up is cancelled.
- Send/sign contract and confirm contract follow-up cancellation/deposit follow-up scheduling.
- Confirm pending payments appears after deposit/final invoice is sent.
- Add an expense linked to a job.
- Complete/pay the job and confirm profitability displays linked expense total and margin.
- Create jobs with lead sources and confirm dashboard lead-source analytics update.

### Settings/Integrations
- Save business profile/settings and reload the app.
- Confirm secret fields are blank on reload and only show saved/not connected text.
- Confirm `/api/settings` never returns raw secrets/tokens/passwords.
- Use sandbox/test credentials for Stripe, Square, Google, SMTP, and QuickBooks during beta.
- Confirm missing integrations fail with clear errors instead of breaking unrelated app areas.
- Confirm Stripe/Square webhooks reject missing or invalid signatures.

### UI/Regression
- Load Dashboard.
- Load Pipeline/Jobs.
- Load Customers.
- Load Expenses.
- Load Templates.
- Load Settings.
- Check mobile width around 390px: nav, cards, dialogs, forms, and action buttons remain usable.

## 2. Automated Smoke Commands

Run these from the repo root:

```powershell
npm.cmd run check
npm.cmd run smoke:test-user-safety
npm.cmd run test:browser -- --workers=1
```

Targeted browser specs can also be run one at a time:

```powershell
npm.cmd run test:browser -- tests/onboarding.spec.js
npm.cmd run test:browser -- tests/follow-up-automation.spec.js
npm.cmd run test:browser -- tests/pending-payments.spec.js
npm.cmd run test:browser -- tests/expense-contract-regression.spec.js
npm.cmd run test:browser -- tests/dashboard-analytics.spec.js
npm.cmd run test:browser -- tests/webhook-follow-up-hooks.spec.js
```

Playwright is configured to use one worker because the specs share `.tmp/playwright-data`. Run specs one at a time or through the single-worker suite so shared-state races do not obscure real failures.

## 2a. Audit Environment Requirements

Before a Claude UX audit or v0 UI audit, configure the audit environment with:

```text
MAPBOX_PUBLIC_TOKEN=<public Mapbox token>
```

Scheduling needs one of these two setups:

- Connect a dedicated Google test calendar for the tester account.
- Or enable calendarless audit mode:

```text
PRESSUREFLOW_ALLOW_CALENDARLESS_SCHEDULING=true
```

For local/browser smoke tests that must never send real email, keep:

```text
PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true
```

Do not use live customer email, payment, accounting, or calendar credentials for audit runs. Use sandbox/test credentials or a dedicated throwaway account.

## 3. Test Data To Create

Use throwaway beta data only.

- Owner account: existing admin/owner login.
- Tester A: `tester-a+beta@example.com`, role `tester`.
- Tester B: `tester-b+beta@example.com`, role `tester`.
- Customer: `Maria Test`, `maria.test@example.com`, `(555) 111-2222`.
- Job: `Driveway cleaning`, address `100 Test Drive, Riverside, CA 92501`.
- Lead source: one known value such as Referral, plus one ad/source value for dashboard analytics.
- Expense: `Home Depot`, category `Materials`, amount `$13.35`, linked to the test job.
- Integrations: sandbox/test credentials only.

## 4. Pass/Fail Criteria

Pass means:
- No account can view or mutate another account's jobs, customers, expenses, settings, follow-up tasks, or linked expenses.
- No raw integration secret appears in Settings, `/api/settings`, logs, webhook events, or browser-visible state.
- Public customer links require their token and do not work with wrong tokens.
- Core workflow reaches Paid without manual data repair.
- Follow-ups schedule and cancel at the correct workflow transitions.
- Manual payment marking still works even when webhooks are unavailable.
- All automated smoke commands pass.

Fail means:
- Any cross-account data is visible or editable.
- A webhook marks payment paid without a configured valid secret.
- A raw credential appears in a frontend response or UI field after save.
- Estimate/contract/deposit/final workflow gets stuck or sends the wrong follow-up.
- Dashboard, customers, jobs, expenses, or settings cannot load for a test user.

## 5. Critical Blockers Before Beta Users

- Missing `NODE_ENV=production` or `SESSION_SECRET` in the deployed environment.
- Auth disabled in the deployed environment.
- Stripe/Square webhooks enabled without webhook secrets.
- Raw credentials exposed in API responses or logs.
- Any confirmed cross-account data access.
- Follow-up cancellation failing after estimate approval/decline, contract signing, or payment.

## 6. Safe To Defer

- Password reset/self-service signup.
- Full credential encryption at rest for a small controlled sandbox beta, though it should happen before broader live-account beta.
- More detailed role permissions beyond owner/tester.
- UI polish, charts refinements, and mobile layout enhancements that do not block workflows.
- Live QuickBooks sync automation beyond safe credential storage/scoping.
