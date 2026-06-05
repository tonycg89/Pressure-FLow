const crypto = require("node:crypto");

function parseStripeWebhookMetadata(rawBody) {
  try {
    const event = JSON.parse(rawBody || "{}");
    const metadata = event.data?.object?.metadata || {};
    return {
      jobId: String(metadata.jobId || ""),
      accountId: String(metadata.accountId || "")
    };
  } catch {
    return { jobId: "", accountId: "" };
  }
}

function verifyStripeSignature(signatureHeader, rawBody, secret, safeCompare) {
  if (!secret) {
    return true;
  }

  const signature = String(signatureHeader || "");
  const timestamp = signature.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const expected = signature.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !expected.length) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  const digest = hmac.digest("hex");
  return expected.some((candidate) => safeCompare(candidate, digest));
}

async function createStripeCheckoutSessionRequest({ settings, job, invoiceType, amount, invoiceUrl, accountId }) {
  const secretKey = getStripeSecretKey(settings);
  if (!secretKey) {
    throw new Error("Stripe is not configured yet. Add the Stripe secret key in Settings.");
  }
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than $0.");
  }

  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${getBusinessName(settings)} ${invoiceType === "deposit" ? "deposit" : "final balance"}`,
    "line_items[0][price_data][product_data][description]": `${job.serviceType} at ${job.address}`,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][quantity]": "1",
    customer_email: job.email,
    success_url: `${invoiceUrl}&card=paid`,
    cancel_url: invoiceUrl,
    "metadata[jobId]": job.id,
    "metadata[accountId]": accountId,
    "metadata[invoiceType]": invoiceType,
    "metadata[invoiceId]": invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Unable to create Stripe Checkout session.");
  }

  return data;
}

function getStripeSecretKey(settings) {
  return settings.stripeSecretKey || process.env.STRIPE_SECRET_KEY || "";
}

function getBusinessName(settings = {}) {
  return settings.businessName || "Your Company";
}

module.exports = {
  createStripeCheckoutSessionRequest,
  parseStripeWebhookMetadata,
  verifyStripeSignature
};
