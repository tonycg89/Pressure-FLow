# Integration Checklist

Use this checklist before connecting the live automation services.

## Business rules

- Default deposit: 25% unless changed per job
- Estimate approval happens through Square before contract signing
- Contract signing happens before deposit invoice
- Deposit must be paid before scheduling
- Completion notice is sent when work is marked complete
- Final invoice is sent immediately after the completion notice
- Payment reminders stop when Square reports paid

## Google

- Google Cloud project
- Calendar API enabled
- Gmail API or email sending provider selected
- Calendar ID for scheduled jobs
- Default job duration
- Work days and available time windows

## Square

- Square developer account
- Location ID
- Estimate approval/signature flow confirmed
- Estimate ID or reference stored on each job
- Square Contracts enabled
- Contract template created in Square
- Contract ID or reference stored on each job
- Deposit invoice item or invoice template
- Final invoice item or invoice template
- Webhook endpoint for estimate approved/signed events, if available
- Webhook endpoint or manual status check for contract signed events, if available
- Webhook endpoint for invoice paid events

## Email templates

- Estimate sent
- Estimate reminder
- Contract sent
- Deposit invoice sent
- Deposit reminder
- Scheduling confirmation
- Job completion
- Final invoice sent
- Final invoice reminder
- Payment thank-you

## First app screens

- Job pipeline
- New job form
- Job detail view
- Template settings
- Integration settings
- Calendar/scheduling view
- Invoice/payment status view
