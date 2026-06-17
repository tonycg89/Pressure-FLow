function validateDeploymentEnvironment(env = process.env) {
  const errors = [];
  const warnings = [];
  const isProduction = env.NODE_ENV === "production";

  if (env.PORT && !isValidPort(env.PORT)) {
    errors.push("PORT must be a number between 1 and 65535.");
  }

  if (!isProduction) {
    addOptionalIntegrationWarnings(env, warnings);
    return { errors, warnings };
  }

  if (!env.SESSION_SECRET) {
    errors.push("SESSION_SECRET is required when NODE_ENV=production.");
  }

  if (!env.DATABASE_URL && env.PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION !== "true") {
    errors.push("DATABASE_URL is required in production. Set PRESSUREFLOW_ALLOW_LOCAL_JSON_IN_PRODUCTION=true only for an intentional temporary maintenance deployment.");
  }

  if (!env.APP_BASE_URL) {
    errors.push("APP_BASE_URL is required in production.");
  } else if (!isValidHttpsUrl(env.APP_BASE_URL)) {
    errors.push("APP_BASE_URL must be a valid https:// URL in production.");
  }

  if (env.ALLOW_AUTH_DISABLED === "true") {
    errors.push("ALLOW_AUTH_DISABLED cannot be true in production.");
  }

  if (env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY === "true") {
    errors.push("PRESSUREFLOW_SKIP_EMAIL_DELIVERY cannot be true in production.");
  }

  if (env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK === "true") {
    errors.push("PRESSUREFLOW_AUDIT_GOOGLE_MOCK cannot be true in production.");
  }

  addOptionalIntegrationWarnings(env, warnings);
  return { errors, warnings };
}

function assertDeploymentEnvironment(env = process.env, { warn = console.warn } = {}) {
  const result = validateDeploymentEnvironment(env);
  result.warnings.forEach((message) => warn(`PressureFlow deployment warning: ${message}`));
  if (result.errors.length) {
    throw new Error(`Deployment environment validation failed: ${result.errors.join(" ")}`);
  }
  return result;
}

function addOptionalIntegrationWarnings(env, warnings) {
  const googleValues = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI].filter(Boolean);
  if (googleValues.length > 0 && googleValues.length < 3) {
    warnings.push("Google OAuth environment variables are partially configured; set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI together.");
  }

  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    warnings.push("STRIPE_SECRET_KEY is set without STRIPE_WEBHOOK_SECRET; Stripe webhooks will fail closed unless each account has a webhook secret saved in Settings.");
  }

  if ((env.SQUARE_ACCESS_TOKEN || env.SQUARE_LOCATION_ID) && !env.SQUARE_WEBHOOK_SIGNATURE_KEY) {
    warnings.push("Square credentials are set without SQUARE_WEBHOOK_SIGNATURE_KEY; Square webhooks will fail closed unless each account has a webhook signature key saved in Settings.");
  }

  if (env.ENABLE_TWILIO_ALERTS === "true") {
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_PHONE", "ADMIN_ALERT_PHONE"].forEach((name) => {
      if (!env[name]) {
        warnings.push(`ENABLE_TWILIO_ALERTS=true but ${name} is missing; admin SMS alerts will be skipped.`);
      }
    });
  }

  if (!env.MAPBOX_PUBLIC_TOKEN) {
    warnings.push("MAPBOX_PUBLIC_TOKEN is missing; map/geocoding workflows may be unavailable until a token is saved in Settings or the environment.");
  }
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isValidHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.host);
  } catch {
    return false;
  }
}

module.exports = {
  assertDeploymentEnvironment,
  validateDeploymentEnvironment
};
