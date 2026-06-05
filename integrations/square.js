const crypto = require("node:crypto");

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

module.exports = {
  extractSquareInvoice,
  parseSquareWebhookInvoiceId,
  verifySquareSignature
};
