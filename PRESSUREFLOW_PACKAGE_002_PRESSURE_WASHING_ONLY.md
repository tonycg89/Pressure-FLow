# Package 002 - Narrow Onboarding and Service Catalog to Pressure Washing Only

## Objective

Remove the multi-industry onboarding path (Landscaping, Handyman, Construction) so PressureFlow's onboarding, settings, service catalog, and scheduling instructions consistently reflect a pressure-washing-only product, matching `PRESSUREFLOW_PRODUCT_PRINCIPLES.md` and the approved beta-recruiting positioning.

## Repository Context

A repository audit found industry selection touches exactly six files:

- `index.html` - two `<select name="serviceIndustry">` fields (onboarding wizard and settings form), each offering Pressure Washing, Landscaping, Handyman, Construction, Misc.
- `app.js` - industry-driven service-picker rendering logic (`renderOnboardingWizardServices`, the `industryServices` branch around line 757-762, and form population code that reads `serviceIndustry.value`).
- `assets/service-catalog.js` - `onboardingServiceLibrary` has category-tagged service line items for Pressure Washing, Landscaping, Handyman, Construction, and Misc; `onboardingServiceCategories` lists all five.
- `scheduling.js` - `industryInstructions` map keyed by industry, with per-industry job-prep reminders; falls back to `Misc` for unknown values.
- `settings.js` - `normalizeServiceIndustry` allow-list currently accepts all five industries.
- `tests/onboarding.spec.js` and `scripts/smoke-test-user-safety.js` - both use `"Landscaping"` as their test industry value.

`db.js` just stores whatever string `settings.js` passes it - no direct changes expected there.

The default built-in catalog (`builtInServiceCatalog`) is already pressure-washing-focused and already includes several items currently filed under the onboarding `Misc` category (Holiday Light Installation, Solar Panel Cleaning, Trash Can Cleaning), so consolidating `Misc` into the kept catalog is not new scope, it's removing duplication.

## Scope

- Remove the industry picker from onboarding and settings; the product now serves one industry, so don't ask the user to choose one.
- Default `serviceIndustry` to `"Pressure Washing"` for new accounts without user input.
- Remove Landscaping, Handyman, and Construction category data from `onboardingServiceLibrary` and `onboardingServiceCategories`.
- Consolidate the current `Misc` add-on items (Window Cleaning, Solar Panel Cleaning, Fleet Washing, Heavy Equipment Washing, Dumpster Pad Cleaning, Holiday Light Installation/Removal, Junk Haul Away, Trash Can Cleaning) into the kept pressure-washing catalog rather than dropping them - these are legitimate pressure-washing-company upsells and several already exist in the default built-in catalog.
- Simplify `scheduling.js` `industryInstructions` to the shared list plus the existing Pressure Washing list; drop the Landscaping/Handyman/Construction branches.
- Update `app.js` rendering logic accordingly.
- Update the two test files so they exercise the new pressure-washing-only flow instead of using `"Landscaping"` as a stand-in test value.

## Out of Scope

- Auth, tenant isolation, payments, or any architecture change.
- Other onboarding fields (`customerSegment`, `onboardingServiceScope`) - leave as-is.
- Pricing changes to any kept service.
- Any file outside the six identified above, unless Codex finds a genuine additional reference - if so, stop and report before proceeding rather than expanding scope silently.

## Constraints

- Preserve historical jobs/estimates/settings for any existing account whose stored `serviceIndustry` is Landscaping, Handyman, or Construction. Do not delete or corrupt existing records, and do not error on load - sanitize deprecated values at load/save boundaries per `PRESSUREFLOW_ENGINEERING_STANDARDS.md`, don't destroy them.
- Don't touch auth, validation, tenant isolation, or payment logic.
- Don't introduce new frameworks or dependencies.

## Expected Files

- `index.html`
- `app.js`
- `assets/service-catalog.js`
- `scheduling.js`
- `settings.js`
- `tests/onboarding.spec.js`
- `scripts/smoke-test-user-safety.js`

Codex may identify additional files but must explain why before changing them.

## Implementation Requirements

1. Remove the `serviceIndustry` `<select>` field from both the onboarding wizard step and the settings form in `index.html`. New accounts get `serviceIndustry: "Pressure Washing"` by default without a picker.
2. In `assets/service-catalog.js`, remove the `Landscaping`, `Handyman`, and `Construction` entries from `onboardingServiceLibrary` and remove those categories from `onboardingServiceCategories`. Fold the current `Misc` items into the kept catalog (either as part of `Pressure Washing` or as a clearly-labeled add-on-services category) so none of those services are lost.
3. In `scheduling.js`, remove the `Landscaping`, `Handyman`, and `Construction` branches from `industryInstructions`. Keep `shared` and `Pressure Washing`. Any stored `serviceIndustry` value that no longer matches a known key must fall back safely to the Pressure Washing list, not error.
4. In `settings.js`, update `normalizeServiceIndustry` to only accept `"Pressure Washing"` going forward, while safely normalizing (not destructively rejecting) any existing stored value that no longer matches.
5. In `app.js`, remove or adjust the industry-picker-driven rendering logic so it no longer depends on a user-facing industry selector.
6. Update `tests/onboarding.spec.js` and `scripts/smoke-test-user-safety.js` to reflect the new pressure-washing-only onboarding flow and catalog contents instead of using `"Landscaping"` as the test value.

## Acceptance Criteria

- Onboarding wizard and settings form no longer show an industry picker.
- New accounts default to `serviceIndustry: "Pressure Washing"` without user input.
- Only pressure-washing-relevant services (including the consolidated add-on items) appear as selectable starting services in onboarding.
- Scheduling job-prep reminders only reference pressure-washing-relevant guidance.
- Any existing account/job data with a legacy `serviceIndustry` of Landscaping/Handyman/Construction still loads without error and without data loss.
- `npm.cmd run check`, `npm.cmd run smoke:test-user-safety`, and `npm.cmd run test:browser` all pass.

## Required Verification

- `npm.cmd run check`
- `npm.cmd run smoke:test-user-safety`
- `npm.cmd run test:browser` (full regression suite)
- Manual confirmation that an account/job with a non-pressure-washing legacy `serviceIndustry` value still loads without error

## Closeout Report

Per `PRESSUREFLOW_ENGINEERING_STANDARDS.md`: files changed, behavior changed, tests run, pass/fail results, known unrelated failures, root cause (why multi-industry scope existed and drifted from product principles), guardrails added, remaining risks, documentation affected.

## Approval Gate

Approved by Tony on 2026-08-05 (chat decision). Codex may implement directly - no auth, tenant-isolation, payment, or architecture changes involved. If Codex discovers this touches files beyond the six identified above, stop and report back before proceeding.
