const { test, expect } = require("@playwright/test");
const { validateDeploymentEnvironment } = require("../environment");

test("health check returns safe service status without config details", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body).toEqual({ ok: true, service: "pressureflow" });
  expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
  expect(JSON.stringify(body)).not.toContain("SESSION_SECRET");
});

test("production environment validation fails closed for critical missing or test-only settings", () => {
  const result = validateDeploymentEnvironment({
    NODE_ENV: "production",
    APP_BASE_URL: "https://pressureflow.example",
    PRESSUREFLOW_SKIP_EMAIL_DELIVERY: "true",
    PRESSUREFLOW_AUDIT_GOOGLE_MOCK: "true",
    ALLOW_AUTH_DISABLED: "true"
  });

  expect(result.errors).toEqual(expect.arrayContaining([
    "SESSION_SECRET is required when NODE_ENV=production.",
    "DATABASE_URL is required in production. Set PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true only for an intentional temporary maintenance deployment.",
    "ALLOW_AUTH_DISABLED cannot be true in production.",
    "PRESSUREFLOW_SKIP_EMAIL_DELIVERY cannot be true in production.",
    "PRESSUREFLOW_AUDIT_GOOGLE_MOCK cannot be true in production."
  ]));
});

test("production environment validation requires a secure public base URL", () => {
  const result = validateDeploymentEnvironment({
    NODE_ENV: "production",
    SESSION_SECRET: "prod-secret",
    DATABASE_URL: "postgres://example",
    APP_BASE_URL: "http://pressureflow.example"
  });

  expect(result.errors).toContain("APP_BASE_URL must be a valid https:// URL in production.");
});

test("production local JSON fallback requires the explicit maintenance override", () => {
  const blocked = validateDeploymentEnvironment({
    NODE_ENV: "production",
    SESSION_SECRET: "prod-secret",
    APP_BASE_URL: "https://pressureflow.example"
  });
  expect(blocked.errors).toContain("DATABASE_URL is required in production. Set PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true only for an intentional temporary maintenance deployment.");

  const allowed = validateDeploymentEnvironment({
    NODE_ENV: "production",
    SESSION_SECRET: "prod-secret",
    APP_BASE_URL: "https://pressureflow.example",
    PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION: "true"
  });
  expect(allowed.errors).not.toContain("DATABASE_URL is required in production. Set PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true only for an intentional temporary maintenance deployment.");
});

test("optional integration warnings are clear without blocking development", () => {
  const result = validateDeploymentEnvironment({
    NODE_ENV: "development",
    GOOGLE_CLIENT_ID: "google-client",
    STRIPE_SECRET_KEY: "sk_test_example",
    SQUARE_ACCESS_TOKEN: "square-token",
    ENABLE_TWILIO_ALERTS: "true"
  });

  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual(expect.arrayContaining([
    "Google OAuth environment variables are partially configured; set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI together.",
    "STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET; Stripe webhooks will fail closed unless each account has a webhook secret saved in Settings.",
    "Square credentials are set without SQUARE_WEBHOOK_SIGNATURE_KEY; Square webhooks will fail closed unless each account has a webhook signature key saved in Settings.",
    "ENABLE_TWILIO_ALERTS=true but TWILIO_ACCOUNT_SID is missing; admin SMS alerts will be skipped.",
    "MAPBOX_PUBLIC_TOKEN is missing; map/geocoding workflows may be unavailable until a token is saved in Settings or the environment."
  ]));
});
