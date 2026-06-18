# PressureFlow Sandbox Verification

Last Updated: June 17, 2026

This document tracks Phase 07D deployed sandbox verification. It is a go/no-go checklist for inviting external beta users. Do not include secrets, access tokens, webhook signatures, passwords, or full customer data in this file.

## Summary

| Item | Status | Notes |
| --- | --- | --- |
| Deployment URL tested | Partial | Documented URL: `https://pressure-flow.onrender.com` |
| `/health` reachable | Pass | Read-only check returned HTTP 200 on June 17, 2026 |
| Latest code deployed | Pass | After Render env updates/redeploy, `/health` returned `{"ok":true,"service":"pressureflow"}` |
| 07D-1 core app verification | Pass | Login/auth, protected routes, settings save, customer/job creation/readback, estimate send, and deployed public estimate URL generation passed |
| 07D-2 public workflow verification | Pass | Deployed estimate, contract, deposit invoice, final invoice, completion proof, invalid-link safety, and state transitions passed with generated sandbox links |
| 07D-3 deployed Mapbox verification | Pass | Deployed Mapbox token delivery, map load, polygon measurement, quantity/total update, saved measurement data, and mobile/touch sanity passed |
| 07D-4 Stripe/Square sandbox webhooks | Blocked / app fail-closed pass | Deployed sandbox has no Stripe/Square sandbox credentials or webhook secrets configured for the test account; deployed webhook endpoints fail closed safely |
| 07D-5 restart/redeploy persistence proof | Partial | Fresh deployed customer/job/measurement/estimate-link baseline persisted across refresh-style readback and logout/login; Render restart/redeploy proof is pending manual Render action |
| External beta go/no-go | No-go | Health/latest-code, 07D-1, 07D-2, 07D-3, 07D-4 app-side checks, and 07D-5 refresh/logout-login checks pass, but Stripe/Square provider webhook acceptance, Render restart/redeploy persistence proof, and remaining deployment checks are pending |

## Read-Only Check Performed

```text
GET https://pressure-flow.onrender.com/health
HTTP 200
Body: {"ok":true}
```

Retry after latest push/commit on June 17, 2026:

```text
GET https://pressure-flow.onrender.com/health
HTTP 200
Body: {"ok":true}
```

During retry, two intermediate requests were temporarily unable to connect, then the endpoint returned HTTP 200 again with the same old payload.

Additional diagnosis after commit `f9b44e4 07D-1`:

- Local `main` tracks `origin/main` at `f9b44e45e22da2e2852f31d0021b72bed0d6c399`.
- `server.js` at that commit contains the current health response: `{ ok: true, service: "pressureflow" }`.
- A cache-busted deployed request still returned `{"ok":true}`.
- Therefore, the deployed service is almost certainly still serving a previous successful deploy.

Render dashboard checks to perform:

1. Confirm the Render service is connected to `tonycg89/Pressure-FLow`, branch `main`.
2. Confirm the latest deploy commit shown by Render is `f9b44e4` or newer.
3. If the latest deploy failed, open the deploy logs and check for production startup validation failures.
4. Confirm production-like sandbox env vars do not include `ALLOW_AUTH_DISABLED=true`, `PRESSUREFLOW_SKIP_EMAIL_DELIVERY=true`, or `PRESSUREFLOW_AUDIT_GOOGLE_MOCK=true`.
5. Confirm `DATABASE_URL`, `SESSION_SECRET`, and `APP_BASE_URL=https://pressure-flow.onrender.com` are set.
6. Trigger a manual deploy after env cleanup if Render did not deploy the latest commit.

Post-env-update retry on June 17, 2026:

```text
GET https://pressure-flow.onrender.com/health?codex=after-env-update
HTTP 200
Body: {"ok":true,"service":"pressureflow"}
```

Interpretation: the deployed service is now serving the latest readiness health response.

Expected body from the current codebase:

```json
{"ok":true,"service":"pressureflow"}
```

Interpretation: the hosted app is reachable and serving the latest health payload. Mutating workflow checks may proceed with a dedicated test account only.

## Phase 1: Deployment Config Review

| Check | Status | Notes |
| --- | --- | --- |
| `NODE_ENV=production` set | Manual | Verify in Render environment variables |
| `SESSION_SECRET` set | Manual | Required; do not paste value anywhere |
| `DATABASE_URL` set to Supabase/Postgres | Manual | Required for production-like sandbox |
| `APP_BASE_URL` set to deployed HTTPS origin | Manual | Should be `https://pressure-flow.onrender.com` unless using a separate sandbox host |
| `PORT` provided by Render | Manual | Render normally provides this |
| Auth/login configured | Manual | Confirm owner/test account can log in |
| Google OAuth callback URL configured | Manual | Expected: `<APP_BASE_URL>/auth/google/callback` |
| Mapbox token configured | Pass | Deployed `/api/settings` exposed a public Mapbox token flag/value shape to the logged-in sandbox frontend; token value not documented |
| Stripe sandbox keys and webhook secret configured | Blocked | Deployed test account reported no Stripe secret key and no Stripe webhook secret; test keys only when configured |
| Square sandbox keys, location ID, and webhook signature key configured | Blocked | Deployed test account reported no Square access token, no location ID, and no webhook signature key; sandbox credentials only when configured |
| Test bypasses disabled | Manual | `ALLOW_AUTH_DISABLED`, `PRESSUREFLOW_SKIP_EMAIL_DELIVERY`, and `PRESSUREFLOW_AUDIT_GOOGLE_MOCK` must be absent/false in production-like sandbox |
| Local JSON fallback disabled | Manual | `DATABASE_URL` required; do not set `PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true` for beta sandbox |

## Phase 2: Health + Startup Verification

| Check | Status | Notes |
| --- | --- | --- |
| App boots | Partial | `/health` responded HTTP 200 |
| Health response safe | Pass | No secrets/config exposed |
| Health response current | Pass | Returned `{"ok":true,"service":"pressureflow"}` after Render env updates/redeploy |
| Production validation accepts env | Manual | Requires Render log review |
| Production validation rejects unsafe flags | Local pass / deployed manual | Covered locally by browser tests; verify by configuration review in Render |
| Logs do not expose secrets | Manual | Review Render logs after redeploy and smoke tests |

## Phase 3: Database / Supabase Verification

| Check | Status | Notes |
| --- | --- | --- |
| App uses Supabase/Postgres | Partial / manual | Production startup with `NODE_ENV=production` requires `DATABASE_URL` unless an emergency override is set; normal deployed read/write persistence passed. Render env/log review still required to confirm no local JSON fallback warning. |
| Records persist after restart/redeploy | Partial | 07D-5 fresh test customer/job/measurement/estimate-link persisted after refresh-style readback and logout/login; Render restart/redeploy persistence still requires a manual Render restart/deploy action |
| Tenant isolation in deployed environment | Optional/manual | Local tenant security suite passes; deployed check requires sandbox accounts |
| Local JSON not used | Manual | Confirm no local JSON fallback flag and `DATABASE_URL` is set |
| Backup/PITR documented | Documented | See `PRESSUREFLOW_BACKUP_RECOVERY.md` |
| Restore rehearsal completed | Manual follow-up | Recommended before external beta |

07D-5 deployed persistence baseline on June 18, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Health before restart/redeploy: PASS - HTTP 200 with {"ok":true,"service":"pressureflow"}
Fresh customer label: Persistence Test Customer 07D5-20260618055842
Fresh job label: Persistence Restart Test 07D5-20260618055842
Customer/job creation: PASS
Measurement saved on job: PASS - 1,450 SqFt
Estimate send/link generation: PASS
Generated estimate URL host: PASS - https://pressure-flow.onrender.com
Public estimate page loads: PASS - HTTP 200
Refresh-style authenticated readback: PASS
Logout/login readback: PASS
Pipeline/job state after readback: PASS - Estimate Sent
Settings readback: PASS - settings endpoint responded; this test account currently reports no configured customer payment path
Render restart persistence: PENDING - requires manual Render Restart Service or Manual Deploy action
Render redeploy persistence: PENDING - requires manual Render Manual Deploy or next normal deploy
Local JSON fallback warning review: PENDING - requires Render log review after restart/redeploy
```

Manual steps needed to finish 07D-5:

1. In Render, open the `pressure-flow` service.
2. Trigger **Restart Service** or **Manual Deploy**.
3. Wait until `/health` returns `{"ok":true,"service":"pressureflow"}`.
4. Re-run the 07D-5 readback against the labels above.
5. Review Render logs for any local JSON fallback warning or production startup validation warning.

07D-1 deployed core app verification on June 17, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Health: PASS
Login page: PASS
Invalid login: PASS
Protected app route: PASS
Protected API routes: PASS
Valid login: PASS
Session refresh/readback: PASS
Logout: PASS
Settings save/onboarding complete/manual payment instructions: PASS
Customer creation/readback: PASS
Job creation/readback: PASS
Public estimate send/link generation: INITIAL FAIL/BLOCKED - POST /api/jobs/:id/send-square-estimate returned 502 Bad Gateway
Post-failure health: PASS
Post-failure job state: FAIL-CLOSED - job remained Lead, estimateSentAt false, estimateApprovalUrl empty
Google OAuth fix: PASS - real Gmail account added as Google OAuth test user and connected through Settings
Estimate send retry: PASS
Generated estimate URL host: PASS - https://pressure-flow.onrender.com
Public estimate page loads: PASS - HTTP 200, job content present, no not-found copy
```

Safe records created:

```text
Customer: Codex 07D Test Customer 07D1-20260617170022
Job: 07D-1 Core Verification 07D1-20260617170022
Customer: Codex 07D Email Test 07D1-EMAIL-20260617170529
Job: 07D-1 Estimate Link Verification 07D1-EMAIL-20260617170529
Job: 07D-1 Estimate Link Verification 07D1-EMAIL-20260617170313
```

07D-1 estimate send blocker resolution: Render logs showed `email_send_failed` because the test account used Google email but Google Calendar/Gmail was not connected. Google OAuth then blocked `codex.ppw@gmail.com` with `Error 403: access_denied` because the OAuth app is in Testing mode. After adding `codex.ppw@gmail.com` as a Google OAuth test user and connecting Google from PressureFlow Settings, the estimate send retry succeeded. The generated estimate URL used the deployed HTTPS origin and the public estimate page rendered successfully.

## Phase 4: Email Delivery Verification

Use test inboxes only. Do not send to real customers.

| Check | Status | Notes |
| --- | --- | --- |
| Estimate email sends | Pass | Initial 502 was caused by disconnected Google OAuth; after adding/connecting the Google OAuth test user, deployed estimate send succeeded to the owner-approved test inbox |
| Contract email sends | Blocked | Requires latest redeploy and sandbox login |
| Deposit invoice email sends | Blocked | Requires latest redeploy and payment configuration |
| Final invoice email sends | Blocked | Requires latest redeploy and sandbox workflow |
| Follow-up email sends or can be safely triggered | Blocked | Requires latest redeploy and safe test account |
| Completion email sends | Blocked | Requires latest redeploy and completed job |
| Links use deployed `APP_BASE_URL` | Pass for estimate | Generated estimate URL started with `https://pressure-flow.onrender.com/estimate/` |
| No placeholders leak | Manual | Inspect received test email content |
| Failures log safely | Manual | Review Render logs for `email_send_failed` |

## Phase 5: Public Link Verification

| Check | Status | Notes |
| --- | --- | --- |
| Estimate approval page loads | Pass | Generated deployed estimate page returned HTTP 200 and rendered the test job |
| Estimate approval works | Pass | Public approval POST returned expected approved state and updated job to contract workflow |
| Already-approved state works | Pass | Approved estimate state rendered safely after approval |
| Contract signing page loads | Pass | Generated deployed contract page returned HTTP 200 with business/customer context |
| Contract signing works | Pass | Typed signer name and signature date succeeded; no initials inputs were present |
| Already-signed state works | Pass | Signed agreement state rendered safely |
| Deposit invoice page loads | Pass | Generated deployed deposit invoice returned HTTP 200 and showed expected 25% deposit amount |
| Final invoice page loads | Pass | Generated deployed final invoice returned HTTP 200 and showed expected final balance |
| Completion proof page loads | Pass | Generated deployed proof page returned HTTP 200 with appropriate customer language and no-photo fallback |
| Invalid/tampered links fail safely | Pass | Invalid estimate, contract, deposit invoice, final invoice, and proof tokens showed generic safe pages with no customer info, stack traces, or token leakage |
| Mobile rendering acceptable | Local automated pass / deployed content pass | Public deployed pages rendered required content; `tests/mobile-hardening.spec.js` passed public-document mobile coverage |

07D-2 deployed public workflow verification on June 17, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Workflow: fresh sandbox customer/job, generated public links only
Estimate page: PASS
Estimate branding/customer/total: PASS
Estimate approval: PASS
Already-approved state: PASS
Contract page: PASS
Contract signing with typed name/date: PASS
Initials boxes absent: PASS
Already-signed state: PASS
Deposit invoice page: PASS
Deposit amount/manual instructions: PASS
Deposit manual paid state: PASS
Deposit already-paid rendering: PASS
Schedule after deposit paid: PASS
Final invoice page: PASS
Final amount/manual instructions: PASS
Final manual paid state: PASS
Final already-paid rendering: PASS
Completion proof page: PASS
Completion proof no-photo copy: PASS
Completion proof payment-complete state: PASS
Invalid/tampered public links: PASS
No localhost URLs in tested public pages: PASS
Final deployed job state readback: PASS
```

Safe record created:

```text
Customer: Codex 07D-2 Public Workflow 07D2-20260617173700
Job: 07D-2 Public Workflow Verification 07D2-20260617173700
```

No public tokens or full customer-sensitive URLs are stored in this document.

## Phase 6: Stripe Sandbox Verification

| Check | Status | Notes |
| --- | --- | --- |
| Stripe test keys configured | Blocked | Deployed test account reported `hasStripeSecretKey=false`; configure Stripe test-mode key only |
| Webhook endpoint points to deployed URL | Pass by route | Expected endpoint exists at `https://pressure-flow.onrender.com/webhooks/stripe`; provider dashboard still needs this exact URL configured |
| Webhook secret configured | Blocked | Deployed test account reported `hasStripeWebhookSecret=false`; configure Stripe test webhook secret only |
| Valid provider signature accepted | Blocked | Cannot verify until Stripe sandbox key and webhook secret are configured and a real Stripe sandbox event is sent |
| Missing/invalid signatures fail closed | Deployed pass / local pass | Deployed missing/invalid Stripe webhook posts returned HTTP 401 with generic JSON errors and no stack traces; local tests cover invalid/missing signatures and missing secret |
| Test payment updates correct invoice only | Blocked / local pass | Deployed blocked by missing Stripe configuration; local tests verify metadata account/job/invoice/type matching |
| Duplicate webhook is idempotent | Blocked / local pass | Deployed blocked by missing Stripe configuration; local tests verify duplicate paid events do not duplicate side effects |
| Amount mismatch fails safely | Blocked / local pass | Deployed blocked by missing Stripe configuration; local tests verify amount mismatch is ignored safely |
| Logs are safe | Local pass / Render manual | Local webhook/security tests emit safe structured log context; Render logs should be reviewed after real Stripe sandbox events are configured |

07D-4 Stripe deployed checks on June 17, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Stripe secret configured: FAIL/BLOCKED - false
Stripe webhook secret configured: FAIL/BLOCKED - false
Missing signature behavior: PASS - HTTP 401
Invalid signature behavior: PASS - HTTP 401
Valid provider webhook: BLOCKED - Stripe sandbox secret/event not configured
Payment state update: BLOCKED on deployed provider path; local tests pass
Duplicate/idempotency: BLOCKED on deployed provider path; local tests pass
Amount mismatch: BLOCKED on deployed provider path; local tests pass
```

## Phase 7: Square Sandbox Verification

| Check | Status | Notes |
| --- | --- | --- |
| Square sandbox token configured | Blocked | Deployed test account reported `hasSquareAccessToken=false`; configure Square sandbox token only |
| Square location ID configured | Blocked | Deployed test account reported no Square location ID |
| Webhook endpoint points to deployed URL | Pass by route | Expected endpoint exists at `https://pressure-flow.onrender.com/webhooks/square`; Square dashboard still needs this exact notification URL configured |
| Webhook signature key configured | Blocked | Deployed test account reported `hasSquareWebhookSignatureKey=false`; configure Square sandbox signature key only |
| Proxy/header behavior preserves notification URL | Blocked / local covered | Requires a real Square sandbox event against the deployed URL; local signature tests cover notification URL behavior in the test server |
| Valid provider signature accepted | Blocked | Cannot verify until Square sandbox access token, location ID, and webhook signature key are configured and a real Square sandbox event is sent |
| Missing/invalid signatures fail closed | Deployed pass / local pass | Deployed missing/invalid Square webhook posts returned HTTP 401 with generic JSON errors and no stack traces; local tests cover invalid/missing signatures and missing secret |
| Test payment updates correct invoice only | Blocked / local pass | Deployed blocked by missing Square configuration; local tests verify invoice matching |
| Duplicate webhook is idempotent | Blocked / local pass | Deployed blocked by missing Square configuration; local tests verify duplicate paid events do not duplicate side effects |
| Amount mismatch fails safely | Blocked / local pass | Deployed blocked by missing Square configuration; local tests verify amount mismatch is ignored safely |
| Logs are safe | Local pass / Render manual | Local webhook/security tests emit safe structured log context; Render logs should be reviewed after real Square sandbox events are configured |

07D-4 Square deployed checks on June 17, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Square environment: sandbox
Square access token configured: FAIL/BLOCKED - false
Square location ID configured: FAIL/BLOCKED - false
Square webhook signature key configured: FAIL/BLOCKED - false
Missing signature behavior: PASS - HTTP 401
Invalid signature behavior: PASS - HTTP 401
Valid provider webhook: BLOCKED - Square sandbox credentials/signature key/event not configured
Payment state update: BLOCKED on deployed provider path; local tests pass
Duplicate/idempotency: BLOCKED on deployed provider path; local tests pass
Amount mismatch: BLOCKED on deployed provider path; local tests pass
```

07D-4 blocker summary:

- Stripe cannot be fully provider-verified until the deployed sandbox account has a Stripe test secret key, Stripe test webhook secret, and Stripe dashboard endpoint pointing to `https://pressure-flow.onrender.com/webhooks/stripe`.
- Square cannot be fully provider-verified until the deployed sandbox account has a Square sandbox access token, Square sandbox location ID, Square webhook signature key, and Square dashboard notification URL exactly set to `https://pressure-flow.onrender.com/webhooks/square`.
- Manual payment recording remains verified from 07D-2 and can be used temporarily for beta only if Stripe/Square sandbox verification is explicitly deferred/accepted.
- No live payment credentials or live customer payments were used.

## Phase 8: Google Calendar / OAuth Verification

| Check | Status | Notes |
| --- | --- | --- |
| OAuth callback registered | Manual | Expected: `<APP_BASE_URL>/auth/google/callback` |
| OAuth flow completes | Pass for current test account | `codex.ppw@gmail.com` was added as a Google OAuth test user and connected through Settings |
| Calendar connection established | Pass for current test account | Google connected flag returned true for the 07D test account |
| Scheduled job creates event | Pass / monitor logs | 07D-2 schedule action succeeded after deposit payment with Google connected; review Google Calendar/Render logs as follow-up |
| Calendar failures log safely | Manual | Review Render logs for `request_failed` |
| Disconnected state clear to user | Local covered / deployed manual | Local flows and copy covered by prior packages |

Per-test-user setup requirement: follow `PRESSUREFLOW_DEPLOYMENT_CHECKLIST.md` -> **Test User Onboarding Checklist** before expecting deployed email/calendar workflows to pass.

## Phase 9: Mapbox Deployed Verification

| Check | Status | Notes |
| --- | --- | --- |
| Deployed frontend receives Mapbox token | Pass | Logged-in sandbox frontend received a public Mapbox token indicator/value shape; token value was not printed or documented |
| Map loads on deployed domain | Pass | Mapbox GL CSS/JS, Mapbox Draw, Turf, style, tiles, fonts, and session calls loaded from the deployed app with HTTP 200/204 responses and no failed requests |
| Domain restrictions allow deployed URL | Pass by behavior | Deployed host loaded Mapbox style/tiles successfully; no visible authorization errors appeared |
| No localhost-only assumptions | Pass | Deployed workflow ran entirely on `https://pressure-flow.onrender.com` with Mapbox HTTPS assets and API calls |
| Token not exposed in verification notes/log capture | Local pass / Render manual | Browser/network output and docs redacted or omitted token values; review Render logs manually if token-log exposure must be independently proven |
| Measurement workflow usable | Pass | Drew and saved a polygon on the deployed map, applied 3,903 SqFt to the Pressure Washing line item, recalculated the estimate total to `$975.75`, and saved a job with measurement GeoJSON/perimeter/square-foot data retained |
| Mobile/touch sanity | Pass / real-device follow-up | 390px mobile viewport opened the map, showed controls, kept Save/Use actions at 44px, drew a polygon, and applied quantity; real iOS/Android hardware remains a prudent manual follow-up |
| Fallback when token missing | Safe local/deployed guard observed | Deployed UI showed `Add your Mapbox public token in Settings before using map measurement.` when the flow was started before settings were available; local tests cover the guarded path. Production env was not intentionally broken. |

07D-3 deployed Mapbox workflow verification on June 17, 2026:

```text
URL tested: https://pressure-flow.onrender.com
Test user: codex@test.com
Mapbox token delivered to frontend: PASS
Mapbox assets/style/tiles load: PASS
Visible authorization errors: PASS - none observed
Desktop map opens from New Job: PASS
Desktop draw controls render: PASS
Polygon measurement appears: PASS
Measurement applied to line quantity: PASS
Estimate total recalculates: PASS
Saved job retains measurement data: PASS
Mobile 390px map opens: PASS
Mobile controls/action buttons usable: PASS
Fallback guard if token unavailable: PASS
Secrets/tokens documented: PASS - none documented
```

Safe records created:

```text
Customer/job names used the `Codex 07D-3 Mapbox` and `07D-3 Map Measurement` prefixes.
```

Observed note: headless Chromium logged generic `Error` entries from the Mapbox GL bundled script with no message body while the map remained usable and no Mapbox requests failed. Treat as non-blocking headless-rendering console noise unless repeated in a real browser session.

## Phase 10: Deployed End-to-End Workflow

Run only after latest code is redeployed and a safe test account/test inbox is available.

| Step | Status | Notes |
| --- | --- | --- |
| Login | Pass | Dedicated test user `codex@test.com`; password not documented |
| Complete onboarding if needed | Pass | Settings saved with onboarding complete for test account |
| Configure payment method or manual instructions | Pass | Manual payment instructions configured for test account |
| Create customer | Pass | Safe fake/test customer created and read back |
| Create job | Pass | Safe fake/test job created and read back |
| Send estimate | Pass | Initial 502 resolved after Google OAuth test user was connected |
| Open estimate public link | Pass | Public estimate link used deployed HTTPS URL and rendered successfully |
| Approve estimate | Pass | Public estimate approval passed in 07D-2 and advanced the deployed workflow |
| Sign contract | Pass | Deployed contract page signed successfully with typed name/date |
| Send/verify deposit invoice | Pass | Deposit invoice generated through public contract signing and rendered correctly |
| Record or process deposit payment | Pass | Manual deposit payment recorded; no live processor used |
| Schedule job | Pass | Schedule action succeeded after deposit payment |
| Complete job | Pass | Completion generated final invoice and proof link; no-photo handling verified |
| Send/verify final invoice | Pass | Final invoice generated and rendered correctly |
| Record or process final payment | Pass | Manual final payment recorded; no live processor used |
| View completion proof | Pass | Completion proof rendered and reflected payment complete after final payment |
| Dashboard/pipeline reflects status | Pass | Final deployed job readback showed `Paid` with expected approval/sign/payment timestamps |

## Rollback Triggers

Do not invite external beta users if any of these are true:

- `/health` fails or returns an unexpected/old payload after redeploy.
- App cannot log in with a known test/owner account.
- App is using local JSON fallback instead of Supabase/Postgres.
- Public links generate localhost or non-HTTPS URLs.
- Customer-facing pages show stack traces, internal IDs, or raw tokens.
- Estimate/contract/invoice email links do not open deployed pages.
- Stripe/Square webhook signatures fail for correctly configured sandbox events.
- Google OAuth callback fails for the deployed URL when Google is required.
- Mapbox measurement cannot load on the deployed domain.
- Render logs show repeated `request_failed`, `email_send_failed`, `webhook_signature_rejected`, or `follow_up_send_failed` entries that are not understood.

## Beta Go/No-Go Criteria

External beta is go only after:

- Latest code is deployed and `/health` returns `{"ok":true,"service":"pressureflow"}`.
- Supabase/Postgres persistence is confirmed after restart/redeploy.
- Auth/login works for the beta test account.
- Public links use deployed HTTPS URLs.
- At least one real sandbox email workflow sends successfully to a test inbox.
- Payment configuration enforcement is confirmed in deployed sandbox.
- At least one payment path is verified: manual instructions, Stripe sandbox, or Square sandbox.
- Google Calendar is either verified or explicitly disabled/deferred with clear user-facing behavior.
- Mapbox map/measurement loads on deployed domain.
- Full deployed workflow completes with fake/test data.
- Backup/PITR access is confirmed or the risk is explicitly accepted before external testers are invited.

## Current Recommendation

No-go for external beta as of June 18, 2026. The deployed sandbox now passes the latest `/health` check, 07D-1 core app verification, 07D-2 deployed public workflow verification, 07D-3 deployed Mapbox workflow verification, 07D-4 deployed webhook fail-closed checks, and 07D-5 refresh/logout-login persistence checks. Stripe/Square provider webhook acceptance remains blocked by missing sandbox credentials/secrets; Render restart/redeploy persistence proof and remaining deployment checks still need to be completed before external beta users are invited.
