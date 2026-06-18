# PressureFlow Sandbox Verification

Last Updated: June 17, 2026

This document tracks Phase 07D deployed sandbox verification. It is a go/no-go checklist for inviting external beta users. Do not include secrets, access tokens, webhook signatures, passwords, or full customer data in this file.

## Summary

| Item | Status | Notes |
| --- | --- | --- |
| Deployment URL tested | Partial | Documented URL: `https://pressure-flow.onrender.com` |
| `/health` reachable | Pass | Read-only check returned HTTP 200 on June 17, 2026 |
| Latest code deployed | Pass | After Render env updates/redeploy, `/health` returned `{"ok":true,"service":"pressureflow"}` |
| 07D-1 core app verification | Partial | Login/auth, protected routes, settings save, customer/job creation, and normal-request persistence passed; estimate send/public URL generation is blocked by a deployed 502 |
| External beta go/no-go | No-go | Health/latest-code and core auth/data checks pass, but estimate email/public link generation returned 502 and external provider checks remain pending |

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
| Mapbox token configured | Manual | Required for deployed map workflow |
| Stripe sandbox keys and webhook secret configured | Manual | Test keys only |
| Square sandbox keys, location ID, and webhook signature key configured | Manual | Sandbox keys only |
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
| Records persist after restart/redeploy | Partial | Test customer/job persisted after normal refresh-style requests; restart/redeploy persistence still not performed |
| Tenant isolation in deployed environment | Optional/manual | Local tenant security suite passes; deployed check requires sandbox accounts |
| Local JSON not used | Manual | Confirm no local JSON fallback flag and `DATABASE_URL` is set |
| Backup/PITR documented | Documented | See `PRESSUREFLOW_BACKUP_RECOVERY.md` |
| Restore rehearsal completed | Manual follow-up | Recommended before external beta |

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
Public estimate send/link generation: FAIL/BLOCKED - POST /api/jobs/:id/send-square-estimate returned 502 Bad Gateway
Post-failure health: PASS
Post-failure job state: FAIL-CLOSED - job remained Lead, estimateSentAt false, estimateApprovalUrl empty
```

Safe records created:

```text
Customer: Codex 07D Test Customer 07D1-20260617170022
Job: 07D-1 Core Verification 07D1-20260617170022
Customer: Codex 07D Email Test 07D1-EMAIL-20260617170529
Job: 07D-1 Estimate Link Verification 07D1-EMAIL-20260617170529
```

## Phase 4: Email Delivery Verification

Use test inboxes only. Do not send to real customers.

| Check | Status | Notes |
| --- | --- | --- |
| Estimate email sends | Fail / blocked | 07D-1 deployed attempt to owner-approved test inbox returned 502 Bad Gateway |
| Contract email sends | Blocked | Requires latest redeploy and sandbox login |
| Deposit invoice email sends | Blocked | Requires latest redeploy and payment configuration |
| Final invoice email sends | Blocked | Requires latest redeploy and sandbox workflow |
| Follow-up email sends or can be safely triggered | Blocked | Requires latest redeploy and safe test account |
| Completion email sends | Blocked | Requires latest redeploy and completed job |
| Links use deployed `APP_BASE_URL` | Blocked | No estimate link was generated because the deployed estimate send returned 502 before persisting a public URL |
| No placeholders leak | Blocked | Inspect received test emails |
| Failures log safely | Manual | Review Render logs for `email_send_failed` |

## Phase 5: Public Link Verification

| Check | Status | Notes |
| --- | --- | --- |
| Estimate approval page loads | Blocked | Estimate send returned 502 before generating a deployed link |
| Estimate approval works | Blocked | Requires generated deployed link |
| Already-approved state works | Blocked | Requires generated deployed link |
| Contract signing page loads | Blocked | Requires generated deployed link |
| Contract signing works | Blocked | Requires generated deployed link |
| Already-signed state works | Blocked | Requires generated deployed link |
| Deposit invoice page loads | Blocked | Requires generated deployed link |
| Final invoice page loads | Blocked | Requires generated deployed link |
| Completion proof page loads | Blocked | Requires generated deployed link |
| Invalid/tampered links fail safely | Blocked | Requires generated deployed link |
| Mobile rendering acceptable | Manual | Verify at phone width after deployed links exist |

## Phase 6: Stripe Sandbox Verification

| Check | Status | Notes |
| --- | --- | --- |
| Stripe test keys configured | Manual | Do not use live keys |
| Webhook endpoint points to deployed URL | Manual | Expected: `<APP_BASE_URL>/webhooks/stripe` |
| Webhook secret configured | Manual | Required; do not paste value |
| Valid provider signature accepted | Blocked | Requires Stripe dashboard/test event after latest redeploy |
| Missing/invalid signatures fail closed | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Test payment updates correct invoice only | Blocked | Requires full sandbox workflow |
| Duplicate webhook is idempotent | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Amount mismatch fails safely | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Logs are safe | Manual | Review Render logs |

## Phase 7: Square Sandbox Verification

| Check | Status | Notes |
| --- | --- | --- |
| Square sandbox token configured | Manual | Do not use live token |
| Square location ID configured | Manual | Must match sandbox location |
| Webhook endpoint points to deployed URL | Manual | Expected: `<APP_BASE_URL>/webhooks/square` |
| Webhook signature key configured | Manual | Required; do not paste value |
| Proxy/header behavior preserves notification URL | Manual | Verify with real Square sandbox event |
| Valid provider signature accepted | Blocked | Requires Square dashboard/test event after latest redeploy |
| Missing/invalid signatures fail closed | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Test payment updates correct invoice only | Blocked | Requires full sandbox workflow |
| Duplicate webhook is idempotent | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Amount mismatch fails safely | Local pass / deployed manual | Local tests pass; deployed provider check pending |
| Logs are safe | Manual | Review Render logs |

## Phase 8: Google Calendar / OAuth Verification

| Check | Status | Notes |
| --- | --- | --- |
| OAuth callback registered | Manual | Expected: `<APP_BASE_URL>/auth/google/callback` |
| OAuth flow completes | Blocked | Requires latest redeploy and Google Cloud test user |
| Calendar connection established | Blocked | Requires sandbox login |
| Scheduled job creates event | Blocked | Requires sandbox workflow |
| Calendar failures log safely | Manual | Review Render logs for `request_failed` |
| Disconnected state clear to user | Local covered / deployed manual | Local flows and copy covered by prior packages |

## Phase 9: Mapbox Deployed Verification

| Check | Status | Notes |
| --- | --- | --- |
| Deployed frontend receives Mapbox token | Manual | Verify Settings/env and browser map load |
| Map loads on deployed domain | Blocked | Requires logged-in sandbox workflow |
| Domain restrictions allow deployed URL | Manual | Verify in Mapbox token settings |
| Measurement workflow usable | Blocked | Requires deployed workflow test |
| Mobile/touch real-device test | Manual follow-up | Recommended before external beta |

## Phase 10: Deployed End-to-End Workflow

Run only after latest code is redeployed and a safe test account/test inbox is available.

| Step | Status | Notes |
| --- | --- | --- |
| Login | Pass | Dedicated test user `codex@test.com`; password not documented |
| Complete onboarding if needed | Pass | Settings saved with onboarding complete for test account |
| Configure payment method or manual instructions | Pass | Manual payment instructions configured for test account |
| Create customer | Pass | Safe fake/test customer created and read back |
| Create job | Pass | Safe fake/test job created and read back |
| Send estimate | Fail / blocked | Deployed send returned 502 Bad Gateway |
| Open estimate public link | Blocked | No public estimate link persisted because send failed closed |
| Approve estimate | Blocked | Confirm status changes |
| Sign contract | Blocked | Confirm deployed contract page |
| Send/verify deposit invoice | Blocked | Confirm payment method configured |
| Record or process deposit payment | Blocked | Use manual or sandbox provider |
| Schedule job | Blocked | Confirm Google Calendar if enabled |
| Complete job | Blocked | Use test photos only |
| Send/verify final invoice | Blocked | Confirm deployed invoice page |
| Record or process final payment | Blocked | Use manual or sandbox provider |
| View completion proof | Blocked | Confirm deployed proof URL |
| Dashboard/pipeline reflects status | Blocked | Confirm final state |

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

No-go for external beta as of June 17, 2026. The deployed sandbox now passes the latest `/health` check and 07D-1 core auth/data checks, but deployed estimate sending/public link generation returned 502 Bad Gateway and the remaining external integration checks still need to be completed before external beta users are invited.
