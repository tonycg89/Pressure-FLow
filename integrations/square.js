const crypto = require("node:crypto");

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
    return true;
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
  extractSquareInvoice,
  normalizePhoneForSquare,
  parseSquareWebhookInvoiceId,
  requireSquareSettings,
  shortSquareKey,
  shortSquareReference,
  splitCustomerName,
  squareRequest,
  verifySquareSignature
};
