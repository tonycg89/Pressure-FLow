# PressureFlow Backup, Recovery, and Data Safety

Last Updated: June 17, 2026

This document is the operator playbook for protecting and recovering PressureFlow data before beta. It is intentionally practical: use it during deploy checks, incidents, and founder/operator support.

## Storage Audit

| Data | Where it lives in production | Local JSON fallback | Tenant scoped | Backup coverage | Reconstructable | Delete reversibility |
| --- | --- | --- | --- | --- | --- | --- |
| Accounts and users | Supabase/Postgres `accounts`, `app_users` | `data/accounts.json`, `data/users.json` | Users are linked to `accountId` | Database backups | Partly, from owner/admin records and user invites | Not reversible except backup/previous JSON `.bak` |
| Settings and credentials | Supabase/Postgres `app_settings` plus per-user settings | `data/settings.local.json` and user settings | Per account/user settings | Database backups | Partly, but integration secrets must usually be re-entered | Not reversible except backup/previous JSON `.bak` |
| Customers | Supabase/Postgres `customers` | `data/customers.json` | Yes, `account_id` / `accountId` | Database backups | Sometimes from jobs/emails, but not reliably | Not reversible except backup/export/previous JSON `.bak` |
| Jobs, estimates, contracts, invoices | Supabase/Postgres `jobs` | `data/jobs.json` | Yes, `account_id` / `accountId` | Database backups | Partly from emails/public pages, but not reliably | Not reversible except backup/export/previous JSON `.bak` |
| Payments and manual payment records | JSON fields on jobs | `data/jobs.json` | Through parent job | Database backups | Sometimes from Stripe/Square/provider dashboards or manual records | Not reversible except backup/provider records |
| Expenses and receipt photos | Supabase/Postgres `expenses` | `data/expenses.json` | Yes, `account_id` / `accountId` | Database backups | Usually not reconstructable without receipts | Not reversible except backup/export/previous JSON `.bak` |
| Follow-up automation tasks | Supabase/Postgres `follow_up_tasks` | `data/follow-up-tasks.json` | Yes | Database backups | Can be recreated manually from job status if needed | Cancel actions are not automatically reversible |
| Saved measurements | JSON fields on customers/jobs | `data/customers.json`, `data/jobs.json` | Through parent record | Database backups | Could be redrawn, but not exactly reconstructed | Not reversible except backup/previous JSON `.bak` |
| Uploaded logos | Inline data URL in settings | Settings JSON | Through settings/account | Database backups | Re-upload from source image | Reversible only by backup or re-upload |
| Photos and files | Inline data URLs on customer/job/expense/template records | Same parent JSON files | Through parent record and inline file metadata | Database backups | Not reliably reconstructable | Reversible only by backup/source file |
| Custom templates | Inline data URLs in settings | Settings JSON | Through settings/account | Database backups | Re-upload from source Word file | Reversible only by backup/source file |
| Public tokens and URLs | Token fields on jobs | `data/jobs.json` | Through parent job | Database backups | Can be regenerated only by resending workflows | Not reversible except backup |
| Webhook event log | Supabase/Postgres `webhook_events` | `data/webhook-events.json` | Event records include provider payload metadata | Database backups | Provider dashboards may retain event history | Not usually business-critical, but useful for audit |
| CSV/backup exports | Downloaded by the authenticated owner/user | Browser download only | Current route scope | Not automatically backed up by app | Re-export if source data exists | Depends on operator file handling |

## Backup Expectations

Production is expected to run on Supabase/Postgres through `DATABASE_URL`. Local JSON is for local development, tests, and emergency maintenance only. It is not a production backup strategy.

Recommended production posture:

- Confirm Supabase/Postgres automated backups are enabled before beta traffic.
- Confirm point-in-time recovery is available for the production plan, or schedule regular logical exports if PITR is not available.
- Use at least daily database backups during beta; increase frequency before high-risk changes or migrations.
- Take an on-demand backup/export before any high-risk deploy, data migration, or bulk support operation.
- Confirm who has permission to restore backups before the first beta user is invited.
- Keep the previous known-good Render deployment available for rollback.

Current uploaded logos/photos/files/templates are stored inline in database JSON/text fields, so they are covered by database backups today. If PressureFlow later moves files to S3, Supabase Storage, Google Cloud Storage, or another object store, that object store will need its own backup, retention, access-control, and restore procedure.

## Local JSON Safety

When `DATABASE_URL` is missing, PressureFlow writes local files under `PRESSUREFLOW_DATA_DIR` or `data/`:

- `jobs.json`
- `customers.json`
- `expenses.json`
- `follow-up-tasks.json`
- `users.json`
- `accounts.json`
- `settings.local.json`
- `webhook-events.json`

Local JSON writes now write to a temporary file, keep the previous file as `<name>.json.bak`, and then replace the active JSON file. This protects against some accidental local corruption and gives local testing an immediate previous-file recovery point.

Important limits:

- `.bak` files are a local last-write safety net, not production backups.
- Only the previous version is retained beside each JSON file.
- Do not copy local JSON into production unless intentionally performing a documented maintenance recovery.
- Production startup fails without `DATABASE_URL` unless `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true` is explicitly set for temporary maintenance.

## Recovery Playbook

### Accidental Record Deletion

First action: stop making related changes to that tenant/account.

Check: affected customer/job/expense/template, recent CSV or backup export, provider emails, and the latest database backup.

Do not: recreate many records manually before deciding whether a backup restore is safer.

Expected path: if it is one record and the data is visible in email/export/provider history, recreate it manually. If multiple records or photos/files are missing, restore to a staging database first and copy the affected records carefully.

Restore from backup when: photos, templates, tokens, or multiple linked records are lost.

### Failed Deployment

First action: roll back to the previous known-good Render deploy.

Check: Render logs, `/health`, production startup validation errors, and whether `DATABASE_URL`, `SESSION_SECRET`, and `APP_BASE_URL` are set correctly.

Do not: disable production validation to make a broken deploy start.

Expected path: fix environment variables or code, redeploy, then run the post-deploy smoke checklist.

Restore from backup when: the failed deploy mutated or deleted production data.

### Corrupted Settings

First action: export or snapshot current settings before editing further.

Check: account Settings, provider dashboards, Google OAuth state, Stripe/Square webhook secrets, and the last known-good backup.

Do not: paste secret values into tickets, chat, screenshots, or docs.

Expected path: re-enter provider credentials from the source provider dashboards, or restore the affected settings row from backup.

Restore from backup when: settings contain inline logo/templates or unknown credentials that cannot be re-entered.

### Missing Customer or Job Data

First action: identify whether the issue is list filtering, tenant scoping, or true deletion.

Check: logged-in account, customer/job API response, CSV export, public token links, and database records for the same `account_id`.

Do not: edit `accountId`/`account_id` manually without confirming tenant ownership.

Expected path: if records exist under the right account, fix the view/filter issue. If records are missing, recover from export, provider emails, or database backup.

Restore from backup when: records are absent from the production database.

### Failed Payment Webhook Update

First action: check the provider dashboard before changing invoice state.

Check: Stripe/Square event delivery status, webhook signature errors, invoice ID, invoice type, expected amount, and PressureFlow job payment records.

Do not: mark a payment paid without confirming amount and invoice type.

Expected path: resend the provider webhook if available. If not, record the payment manually with the correct method/date after confirming the provider payment.

Restore from backup when: a webhook bug incorrectly rewrote many payment records.

### Lost Email Delivery Event

First action: verify whether the email actually sent.

Check: Gmail/Smtp sent mail, PressureFlow job `estimateSentAt`/`contractSentAt`/invoice fields, follow-up tasks, and customer email address.

Do not: repeatedly send customer-facing documents without checking the sent mailbox.

Expected path: if no email was sent, resend from PressureFlow. If email was sent but status did not update, update the workflow state only after confirming the customer-facing link is valid.

Restore from backup when: a broader incident changed many send/status timestamps incorrectly.

### Local JSON Corruption

First action: stop the local server.

Check: the active JSON file and its matching `.bak` file in `data/` or `PRESSUREFLOW_DATA_DIR`.

Do not: start production against local JSON to "see if it works."

Expected path: copy the `.bak` file over the corrupt active JSON file, restart locally, and inspect the affected records.

Restore from backup when: both active and `.bak` files are corrupt or stale.

### Database Outage

First action: check Supabase/Postgres provider status and Render logs.

Check: connection string, SSL setting, provider incident page, and whether `/health` starts but app routes fail.

Do not: switch production to local JSON as a convenience workaround.

Expected path: wait for provider recovery or restore/fail over using the provider's documented process.

Restore from backup when: the provider confirms data loss or corruption.

### Full Environment Rebuild

First action: create a clean deployment with the exact environment variables from the deployment checklist.

Check: `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, owner fallback login, Google OAuth callback, Mapbox token, Stripe/Square webhook URLs, and backups.

Do not: reuse audit/test flags in production.

Expected path: connect the restored database, deploy the known-good commit, run `/health`, then complete the post-deploy smoke checklist.

Restore from backup when: rebuilding against an empty or wrong database.

## Destructive Action Safeguards

Audited destructive or irreversible actions:

- Delete customer: client confirmation; jobs remain in PressureFlow.
- Delete job: client confirmation; removes the job from PressureFlow.
- Delete expense: client confirmation.
- Delete saved service area measurement: client confirmation.
- Delete uploaded custom template: client confirmation.
- Remove logo: staged locally in the Settings form and requires saving Settings to publish.
- Remove photos from forms/modals: user action inside the active edit flow; saved only when the parent form is saved.
- Cancel follow-ups: explicit action or workflow side effect recorded with cancellation reason.
- Mark deposit/final paid manually: confirmation behavior exists in current payment workflows and should be used only after confirming payment.

Server-side routes remain tenant-scoped through the workspace access layer. Client confirmations reduce accidental clicks; they are not security boundaries.

## Export and Portability

Current export routes:

- `/api/export/jobs.csv`: tenant-scoped job CSV for the authenticated account.
- `/api/export/backup.json`: owner-only export with public settings, statuses, and tenant-scoped jobs.

CSV export is useful for business continuity and manual recovery, but it is not a complete restore file. It does not replace database backups, and it does not currently include every record type such as customers, expenses, follow-up tasks, webhook logs, templates, or inline photos as separate restore-ready entities.

## Payment and Webhook Recovery Notes

Use the 07B-2 webhook hardening behavior as the source of truth:

- Stripe and Square webhooks fail closed without valid signatures.
- Webhooks validate stored invoice IDs, tenant/account ownership, invoice type, and amount where available before mutating records.
- Duplicate paid webhooks are idempotent and should not trigger duplicate side effects.

Recovery cases:

- Missed Stripe/Square webhook: resend from provider dashboard if available, or manually mark paid after confirming the provider payment.
- Invoice paid externally but not marked paid: record manual payment with method/date/notes after confirming payment source.
- Invoice incorrectly marked paid: inspect payment records, provider dashboard, and database backup before changing status. If many records are affected, restore from backup or recover in staging first.
- Duplicate webhook received: expected behavior is no duplicate side effects. If duplication occurs, treat as a bug and preserve provider event IDs/logs.
- Payment amount mismatch: expected behavior is to ignore mismatched webhook updates. Investigate invoice amount, discounts, deposits, and provider event payload before taking manual action.

## Known Follow-Up Items

- Confirm Supabase backup plan and point-in-time recovery access before beta traffic.
- Run a real restore rehearsal into a staging database before relying on backups.
- Expand `/api/export/backup.json` into a fuller owner export only if restore/import planning is approved.
- Re-audit file backup procedures if external object storage is introduced.
