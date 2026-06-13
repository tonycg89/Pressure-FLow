const crypto = require("node:crypto");
const { getDepositCents, getFinalBalanceCents } = require("../billing");

const SQUARE_VERSION = "2026-05-20";

function extractSquareInvoice(event) {
  return event.data?.object?.invoice || event.data?.object || null;
}

function parseSquareWebhookInvoiceId(rawBody) {
  try {
    const event = JSON.parse(rawBody || "{}");
    return String(extractSquareInvoice(event)?.id || "");
  } catch {
    return "";
  }
}

function getSquareWebhookNotificationUrl(request) {
  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}/webhooks/square`;
}

function verifySquareSignature(request, rawBody, signatureKey, safeCompare) {
  if (!signatureKey) {
    return false;
  }

  const signature = request.headers["x-square-hmacsha256-signature"];
  if (!signature) {
    return false;
  }

  const notificationUrl = getSquareWebhookNotificationUrl(request);
  const hmac = crypto.createHmac("sha256", signatureKey);
  hmac.update(`${notificationUrl}${rawBody}`);
  const expected = hmac.digest("base64");
  return safeCompare(signature, expected);
}

function requireSquareSettings(settings) {
  if (!settings.squareAccessToken) {
    throw new Error("Square access token is missing. Open Settings and save your Sandbox access token.");
  }
  if (!settings.squareLocationId) {
    throw new Error("Square location ID is missing. Open Settings and save your Square location ID.");
  }
}

async function squareRequest(settings, endpoint, payload, method = "POST") {
  const host = settings.squareEnvironment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
  const response = await fetch(`${host}${endpoint}`, {
    method,
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Authorization": `Bearer ${settings.squareAccessToken}`,
      "Content-Type": "application/json"
    },
    body: payload === undefined ? undefined : JSON.stringify(stripUndefined(payload))
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.errors?.map((error) => error.detail || error.code).join("; ");
    throw new Error(message || `Square request failed with status ${response.status}.`);
  }

  return data;
}

async function createSquareInvoice(job, settings, invoiceType) {
  requireSquareSettings(settings);

  const amount = invoiceType === "deposit" ? getDepositCents(job) : getFinalBalanceCents(job);
  if (amount <= 0) {
    throw new Error("Invoice amount must be greater than $0.");
  }

  const customerId = job.squareCustomerId || await createSquareCustomer(job, settings);
  const order = await createSquareOrder(job, settings, customerId, invoiceType, amount);
  const invoice = await createSquareDraftInvoice(job, settings, customerId, order.id, invoiceType);
  const published = await publishSquareInvoice(settings, invoice.id, invoice.version);

  return {
    customerId,
    orderId: order.id,
    invoiceId: published.id || invoice.id,
    publicUrl: published.public_url || invoice.public_url || ""
  };
}

async function createSquareCustomer(job, settings) {
  const { givenName, familyName } = splitCustomerName(job.customerName);
  const phoneNumber = normalizePhoneForSquare(job.phone);
  const customer = await squareRequest(settings, "/v2/customers", {
    idempotency_key: shortSquareKey("customer", job.id),
    given_name: givenName,
    family_name: familyName,
    company_name: familyName ? undefined : job.customerName,
    email_address: job.email,
    phone_number: phoneNumber,
    reference_id: job.id,
    note: `PressureFlow customer for ${job.address}`
  });

  return customer.customer.id;
}

async function createSquareOrder(job, settings, customerId, invoiceType, amount) {
  const title = invoiceType === "deposit" ? "Pressure washing deposit" : "Pressure washing final balance";
  const note = invoiceType === "deposit"
    ? `Deposit for ${job.serviceType} at ${job.address}`
    : `Final balance for ${job.serviceType} at ${job.address}`;
  const result = await squareRequest(settings, "/v2/orders", {
    idempotency_key: shortSquareKey(`order-${invoiceType}`, job.id),
    order: {
      location_id: settings.squareLocationId,
      customer_id: customerId,
      reference_id: shortSquareReference(job.id, invoiceType),
      line_items: [
        {
          name: title,
          note,
          quantity: "1",
          base_price_money: {
            amount,
            currency: "USD"
          }
        }
      ]
    }
  });

  return result.order;
}

async function createSquareDraftInvoice(job, settings, customerId, orderId, invoiceType) {
  const today = new Date().toISOString().slice(0, 10);
  const title = invoiceType === "deposit" ? "Deposit Invoice" : "Final Invoice";
  const description = invoiceType === "deposit"
    ? `Deposit required before scheduling ${job.serviceType} at ${job.address}.`
    : `Final balance due for completed ${job.serviceType} at ${job.address}.${job.completionProofUrl ? ` Completion photos: ${job.completionProofUrl}` : ""}`;
  const result = await squareRequest(settings, "/v2/invoices", {
    idempotency_key: shortSquareKey(`invoice-${invoiceType}`, job.id),
    invoice: {
      location_id: settings.squareLocationId,
      order_id: orderId,
      primary_recipient: {
        customer_id: customerId
      },
      payment_requests: [
        {
          request_type: "BALANCE",
          due_date: today,
          tipping_enabled: false
        }
      ],
      accepted_payment_methods: {
        card: true,
        square_gift_card: false,
        bank_account: false,
        buy_now_pay_later: false,
        cash_app_pay: false
      },
      delivery_method: "EMAIL",
      title,
      description,
      sale_or_service_date: today,
      store_payment_method_enabled: false
    }
  });

  return result.invoice;
}

async function publishSquareInvoice(settings, invoiceId, version) {
  const result = await squareRequest(settings, `/v2/invoices/${encodeURIComponent(invoiceId)}/publish`, {
    version,
    idempotency_key: shortSquareKey("publish", invoiceId)
  });

  return result.invoice;
}

async function getSquareInvoice(settings, invoiceId) {
  requireSquareSettings(settings);
  if (!invoiceId) {
    throw new Error("No Square invoice ID is stored for this job yet.");
  }

  const result = await squareRequest(
    settings,
    `/v2/invoices/${encodeURIComponent(invoiceId)}`,
    undefined,
    "GET"
  );
  return result.invoice;
}

async function cancelSquareInvoice(settings, invoiceId, version) {
  requireSquareSettings(settings);
  if (!invoiceId || version === undefined || version === null) {
    throw new Error("Square invoice ID and version are required to cancel an invoice.");
  }

  const result = await squareRequest(settings, `/v2/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    version
  });
  return result.invoice;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== "")
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    );
  }
  return value;
}

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { givenName: parts[0] || "Customer", familyName: "" };
  }

  return {
    givenName: parts.slice(0, -1).join(" "),
    familyName: parts.at(-1)
  };
}

function normalizePhoneForSquare(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10 && !digits.startsWith("555")) {
    return `+1${digits}`;
  }

  return "";
}

function shortSquareReference(jobId, suffix) {
  return `${compactHash(jobId)}-${suffix}`.slice(0, 40);
}

function shortSquareKey(prefix, value) {
  return `${prefix}-${compactHash(value)}-${Date.now().toString(36)}`.slice(0, 45);
}

function compactHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

module.exports = {
  cancelSquareInvoice,
  createSquareInvoice,
  extractSquareInvoice,
  getSquareInvoice,
  normalizePhoneForSquare,
  parseSquareWebhookInvoiceId,
  requireSquareSettings,
  shortSquareKey,
  shortSquareReference,
  splitCustomerName,
  squareRequest,
  verifySquareSignature
};
