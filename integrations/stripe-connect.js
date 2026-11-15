// Stripe Connect (platform) client.
//
// PressureFlow is the platform. Each contractor gets a connected Stripe account
// they own (full Stripe Dashboard, they pay Stripe fees, Stripe carries
// negative-balance risk). Customer payments are direct charges on the
// contractor's account. See PRESSUREFLOW_PACKAGE_006_STRIPE_CONNECT.md.
//
// Uses the stable v1 API on purpose: Stripe's Accounts v2 examples require a
// preview API version, which payment code should not depend on.

const DEFAULT_API_BASE = "https://api.stripe.com";

function getPlatformSecretKey(env = process.env) {
  return String(env.STRIPE_PLATFORM_SECRET_KEY || "").trim();
}

function getConnectWebhookSecret(env = process.env) {
  return String(env.STRIPE_CONNECT_WEBHOOK_SECRET || "").trim();
}

function isStripeConnectAvailable(env = process.env) {
  return Boolean(getPlatformSecretKey(env));
}

// Test hook: lets the Playwright suite point at a local mock. Ignored in production.
function getApiBase(env = process.env) {
  if (env.NODE_ENV !== "production" && env.PRESSUREFLOW_STRIPE_API_BASE) {
    return String(env.PRESSUREFLOW_STRIPE_API_BASE).replace(/\/+$/, "");
  }
  return DEFAULT_API_BASE;
}

// Platform fee as a percent of the charge (e.g. "1" = 1%). Default 0 = no fee.
function getApplicationFeeCents(amountCents, env = process.env) {
  const percent = Number(env.STRIPE_APPLICATION_FEE_PERCENT || 0);
  if (!Number.isFinite(percent) || percent <= 0) {
    return 0;
  }
  const capped = Math.min(percent, 10);
  return Math.floor((amountCents * capped) / 100);
}

async function stripeRequest(method, path, params, { stripeAccount, idempotencyKey } = {}) {
  const secretKey = getPlatformSecretKey();
  if (!secretKey) {
    const error = new Error("Stripe Connect is not set up on this PressureFlow server yet.");
    error.statusCode = 503;
    error.exposeToClient = true;
    throw error;
  }

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded"
  };
  if (stripeAccount) {
    headers["Stripe-Account"] = stripeAccount;
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const body = params ? new URLSearchParams(params) : undefined;
  const response = await fetch(`${getApiBase()}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : body
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error?.message || `Stripe request failed (HTTP ${response.status}).`);
    error.statusCode = 502;
    error.exposeToClient = true;
    throw error;
  }
  return data;
}

function createConnectedAccount({ pressureflowAccountId, email, businessName }) {
  const params = {
    country: "US",
    "controller[stripe_dashboard][type]": "full",
    "controller[fees][payer]": "account",
    "controller[losses][payments]": "stripe",
    "metadata[pressureflowAccountId]": pressureflowAccountId
  };
  if (email) {
    params.email = email;
  }
  if (businessName) {
    params["business_profile[name]"] = businessName;
  }
  // Double-click protection is a per-account lock in the route, not an
  // idempotency key: Stripe caches error responses per key for 24h, which
  // would replay a setup error after Tony fixes the platform config.
  return stripeRequest("POST", "/v1/accounts", params);
}

function createAccountLink({ stripeAccountId, refreshUrl, returnUrl }) {
  return stripeRequest("POST", "/v1/account_links", {
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding"
  });
}

function retrieveAccount(stripeAccountId) {
  return stripeRequest("GET", `/v1/accounts/${encodeURIComponent(stripeAccountId)}`);
}

function summarizeAccountStatus(account = {}) {
  return {
    chargesEnabled: Boolean(account.charges_enabled),
    payoutsEnabled: Boolean(account.payouts_enabled),
    detailsSubmitted: Boolean(account.details_submitted),
    disabledReason: String(account.requirements?.disabled_reason || ""),
    updatedAt: new Date().toISOString()
  };
}

function isConnectChargeReady(settings = {}) {
  return Boolean(
    settings.stripeAccountId &&
    settings.stripeConnectStatus?.chargesEnabled &&
    isStripeConnectAvailable()
  );
}

async function createConnectedCheckoutSession({ settings, job, invoiceType, amount, invoiceUrl, accountId, invoiceId }) {
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than $0.");
  }
  const businessName = settings.businessName || "Your Company";
  const params = {
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${businessName} ${invoiceType === "deposit" ? "deposit" : "final balance"}`,
    "line_items[0][price_data][product_data][description]": `${job.serviceType} at ${job.address}`,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][quantity]": "1",
    success_url: `${invoiceUrl}&card=paid`,
    cancel_url: invoiceUrl,
    "metadata[jobId]": job.id,
    "metadata[accountId]": accountId,
    "metadata[invoiceType]": invoiceType,
    "metadata[invoiceId]": invoiceId,
    "payment_intent_data[metadata][jobId]": job.id,
    "payment_intent_data[metadata][accountId]": accountId,
    "payment_intent_data[metadata][invoiceType]": invoiceType
  };
  if (job.email) {
    params.customer_email = job.email;
  }
  const fee = getApplicationFeeCents(amount);
  if (fee > 0) {
    params["payment_intent_data[application_fee_amount]"] = String(fee);
  }
  return stripeRequest("POST", "/v1/checkout/sessions", params, { stripeAccount: settings.stripeAccountId });
}

module.exports = {
  createAccountLink,
  createConnectedAccount,
  createConnectedCheckoutSession,
  getApplicationFeeCents,
  getConnectWebhookSecret,
  isConnectChargeReady,
  isStripeConnectAvailable,
  retrieveAccount,
  summarizeAccountStatus
};
