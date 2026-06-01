# Next Steps

You have created access for Square Developer and Google Cloud. DocuSign is no longer needed because Square Contracts can handle contract signing.

## Gathered config

- Square sandbox location ID: `LMAS5W0GDF117`
- Google calendar ID: `tonycg89@gmail.com`
- Contract signing: Square Contracts
- Default deposit: `25%`
- Final invoice timing: immediately after completion notice

## What to do first

1. Copy `.env.example` to `.env` once there is a backend app.
2. Fill in non-secret IDs first:
   - Business name
   - Business email
   - Business phone
   - Square location ID
   - Google calendar ID
3. Keep secrets out of chat:
   - Square access token
   - Google client secret
   - Webhook signing secrets
4. Create one Square contract template:
   - Service agreement for pressure washing work
   - Include service address, scope, estimate amount, deposit, final balance, cancellation/reschedule terms, and signature
5. Confirm the Square estimate approval/signature flow:
   - Estimate is sent through Square
   - Customer approves/signs the estimate in Square
   - The app records the Square estimate ID or reference
   - The app moves the job to `Estimate Signed` when approval is detected
6. Confirm the Square contract flow:
   - Contract is created/sent through Square Contracts
   - Customer signs electronically
   - The app records the Square contract ID or reference
   - The app moves the job to `Contract Signed` when signing is detected or manually confirmed
7. Confirm the Square invoice rules:
   - Deposit invoice is created after contract signing
   - Final invoice is created after job completion
   - Final invoice amount equals estimate minus deposit
   - Final invoice is sent immediately after the completion notice
8. Confirm Google Calendar rules:
   - Default appointment length
   - Work days
   - Earliest and latest job start times
   - Travel buffer between jobs

## Webhook events we need

- Square estimate approved/signed, if available
- Square contract signed, if available
- Square deposit invoice paid
- Square final invoice paid

## Backend routes to build next

- `POST /jobs`
- `POST /jobs/:id/send-estimate`
- `POST /jobs/:id/send-contract`
- `POST /jobs/:id/send-deposit-invoice` - implemented for Square sandbox invoices
- `POST /jobs/:id/check-deposit-payment` - implemented for Square sandbox invoices
- `POST /webhooks/square` - implemented for Square invoice payment/status webhooks
- `POST /jobs/:id/schedule`
- `POST /jobs/:id/complete` - generates completion notice and sends Square final invoice
- `POST /jobs/:id/send-final-invoice` - implemented for Square sandbox invoices
- `POST /jobs/:id/check-final-payment` - implemented for Square sandbox invoices

## Decisions needed before live wiring

- Can Square send an approval/signed event to our app, or do we need a manual `Mark Estimate Signed` button for the first version?
- Can Square send a contract signed event to our app, or do we need a manual `Mark Contract Signed` button for the first version?
- Do you want customers to pick from available schedule slots, or do you schedule manually?
- Should deposit be required for every job, or only jobs above a certain amount?
- How many payment reminders should be sent before you personally follow up?
