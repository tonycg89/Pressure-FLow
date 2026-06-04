# Next Steps

## Current Focus

PressureFlow is in polish mode. The app works end-to-end for the Precision Power Washing workflow, so near-term work should focus on usability, mobile behavior, reliability, and production readiness.

## Highest Priority

1. Mobile QA
   - Test the dashboard on an actual phone.
   - Check job creation, customer creation, photo capture, completion photos, notifications, and map measurement.
   - Tighten any layout overflow or hard-to-tap controls.

2. Notification polish
   - Confirm dashboard notifications clear properly.
   - Keep SMS alerts deferred until PressureFlow is ready to scale beyond the current single-business workflow.
   - Decide whether browser push notifications are worth adding later.

3. Template workflow
   - Confirm uploaded templates save and download correctly.
   - Decide which templates are informational only versus actually used by automated emails/contracts.
   - Eventually add an editor/builder for contract, invoice, estimate, and completion templates.

4. Address and reporting QA
   - Confirm street, unit, city, state, and ZIP save for jobs/customers.
   - Confirm Mapbox still geocodes the full composed address.
   - Confirm dashboard revenue by city looks right.

5. Browser testing fallback
   - Next week, add a repo-level Playwright smoke test setup so PressureFlow can be browser-tested even when the Codex in-app browser connector has Windows sandbox startup issues.
   - Cover the map measurement dialog, saved service area dropdown, checkbox polygon display/removal, and saved area delete button.
   - Keep this deferred for now; do not add browser-test dependencies until we are ready to work on it.

## Operational Improvements

- Expand invited-user access into fuller roles and permissions after the first tester logins are validated.
- Add password reset, email verification, and public trial signup after invited-user testing is stable.
- Add selectable starter job/service packs during account creation so new users choose a focused starting catalog instead of receiving every available preset.
- Complete per-account isolation for jobs, customers, expenses, photos, and documents before inviting outside businesses; settings and saved custom services are already account-scoped.
- Add a visible audit/history area per customer/job for sent estimate, accepted estimate, sent contract, signed contract, invoices, schedule confirmation, and completion notice.
- Add better filtering/search across customers and jobs.
- Add invoice payment status badges and clearer completed-job archive behavior.

## Larger Future Upgrade

Before offering PressureFlow to other businesses, build a multi-tenant v2:

- `businesses`
- `users`
- `business_users`
- `customers`
- `jobs`
- `templates`
- `invoices`
- `notifications`
- `files`

Every customer, job, template, invoice, notification, and file should belong to a `business_id`.

Also move photos/templates/contracts/invoices to object storage such as Supabase Storage, S3, or Cloudflare R2.

## Nice-To-Have Later

- Stripe credit card checkout
- Twilio SMS alerts after the app has a valid terms/privacy web presence and A2P campaign approval
- Customer scheduling portal
- Technician-only mobile workflow
- Recurring customer/job support
- Service catalog manager
- Estimate/contract PDF generation
- Automatic payment reminders
- Browser push notifications
- Multi-user roles and permissions
