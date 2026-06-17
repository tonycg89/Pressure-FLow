# PressureFlow Operations Runbook

Last Updated: June 17, 2026

This runbook answers: if something fails during beta, where should the operator look first, and what information should be available?

## Where To Look First

1. Render deploy/runtime logs.
2. `/health` for a safe service check.
3. PressureFlow job/customer detail in the app.
4. Provider dashboards: Gmail/Google Calendar, Stripe, Square, SMTP provider, Supabase.
5. `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md` for environment/deploy checks.
6. `PRESSUREFLOW_BACKUP_RECOVERY.md` for recovery and restore decisions.

## Log Shape

Operational logs use a compact JSON line:

```text
PressureFlow error: {"ts":"...","level":"error","action":"email_send_failed",...}
```

Common fields:

- `action`: what failed or was processed.
- `accountId`: tenant/account scope when known.
- `jobId`, `customerId`, `invoiceId`, `invoiceType`: workflow context when safe.
- `provider` or `integration`: external system such as `google`, `smtp`, `stripe`, or `square`.
- `eventId`: provider webhook event ID when available.
- `reason`: fail-closed reason or skip reason.
- `error`: safe error summary with name, message, code, and status.

Logs intentionally redact secret-like fields such as passwords, refresh/access tokens, webhook signatures, authorization headers, and URL `token`, `signature`, `secret`, and `password` parameters. Email logs use masked recipients and recipient domains instead of full customer email bodies or full addresses.

## Troubleshooting Guide

### Customer Says They Did Not Receive An Email

Look first:

- Render logs for `email_send_failed`.
- Job detail for sent timestamp and public link.
- Gmail sent mail or SMTP provider logs.
- Account Settings for Google connection or SMTP provider fields.

Useful log context:

- `emailType`
- `accountId`
- `jobId`
- `recipient` and `recipientDomain`
- `provider`
- `error.code` or `error.message`

Do not log or paste full email bodies, Google refresh tokens, SMTP passwords, or full customer email addresses.

### Invoice Was Paid But Still Shows Unpaid

Look first:

- Stripe/Square dashboard payment and event status.
- Render logs for `webhook_signature_rejected`, `webhook_payload_parse_failed`, or `webhook_event_ignored`.
- Job payment records in PressureFlow.
- Provider invoice ID against the PressureFlow invoice ID.

Common reasons:

- Missing/invalid webhook signature.
- Missing tenant webhook secret.
- Unknown invoice.
- Account mismatch.
- Invoice mismatch.
- Amount mismatch.
- Already-paid duplicate event.

If the provider payment is confirmed and the webhook cannot be replayed, manually record payment with the correct method/date/reference.

### Webhook Failed

Look first:

- Render logs for webhook actions.
- Square webhook event log inside owner-only `/api/webhooks/square/events`.
- Stripe/Square dashboard event delivery.
- Deployment checklist webhook endpoint URL and secret.

Expected safe behavior:

- Missing/invalid signatures return `401`.
- Invalid JSON webhook payload returns `400`.
- Unknown or mismatched records are ignored and logged.
- Duplicate paid events are ignored without duplicate side effects.

### Customer Link Says Invalid Or Expired

Look first:

- Confirm the customer is using the latest link from the latest email.
- Check the job detail for estimate, contract, invoice, or proof URL.
- Confirm the job still exists under the correct account.
- Confirm the public URL contains the expected token query string.

Do not expose internal account IDs or raw tokens to customers. Send a fresh customer-facing link from PressureFlow when needed.

### Automation Did Not Send

Look first:

- Render logs for `follow_up_scheduled`, `follow_up_schedule_skipped`, `follow_up_duplicate_pending_reused`, `follow_up_task_skipped`, `follow_up_cancelled`, and `follow_up_send_failed`.
- `/api/follow-up-tasks` while logged into the affected account.
- Job status and whether the customer already approved/signed/paid.
- Settings for follow-up enablement and delay.

Normal skip reasons include `disabled`, `suppressed`, `not_sendable`, `job_missing`, `approved`, `signed`, `paid`, and `manual_sent`.

### Google Calendar Event Did Not Create

Look first:

- Job action response shown in the app.
- Render logs for `request_failed` on the schedule action.
- Settings for Google OAuth connection and calendar ID.
- Google Calendar dashboard.

Common fixes:

- Reconnect Google Calendar from Settings.
- Confirm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are configured together.
- Confirm the OAuth redirect URI matches the deployed URL exactly.

### Logo Or Photo Upload Failed

Look first:

- App validation message for file type or size.
- Browser console only for local debugging.
- Render logs for `request_failed` if saving produces a server error.
- Settings/customer/job/expense record after saving.

Current files/photos/logos are stored inline with parent records. Database backups cover them today.

### App Returns 500

Look first:

- Render logs for `request_failed`.
- `method`, `path`, `statusCode`, and safe `error` fields in the log.
- Recent deploys and environment variable changes.
- Database provider status.

Production clients receive a generic `Unexpected server error.` message, while server logs keep the safe operational context.

### Deployment Health Check Fails

Look first:

- Render deploy logs.
- Startup validation errors.
- Required production variables in `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md`.
- Supabase/Postgres connection status.

Expected `/health` response:

```json
{"ok":true,"service":"pressureflow"}
```

The health response must not expose secrets, database URLs, tokens, or config details.

## Post-Deploy Smoke Checklist

Run after every beta/production deploy:

1. Open `/health`; expect `{ "ok": true, "service": "pressureflow" }`.
2. Log in with an owner/test account.
3. Complete onboarding or confirm existing onboarding remains complete.
4. Create a customer.
5. Create a job.
6. Send or preview an estimate.
7. Open and approve the public estimate.
8. Send/open/sign the contract.
9. Confirm the payment-configuration warning appears for accounts without payment options.
10. Send or create a deposit invoice only when payment options are configured.
11. Record a manual payment.
12. Complete a job and confirm completion proof renders.
13. Run an email smoke test with a safe test address.
14. Run a Stripe or Square sandbox webhook test.
15. Run a Google Calendar sandbox scheduling test if Google is enabled.
16. Confirm exports only include the logged-in account's data.

## Known Follow-Up Items

- A full in-app activity/audit timeline does not exist yet. Current visibility comes from job state, follow-up tasks, webhook event records, provider dashboards, and operational logs.
- Square webhook events have an owner-only event endpoint; Stripe events currently rely on provider dashboard plus Render logs.
- Add an admin activity view only as a future approved package if beta support shows repeated need.
