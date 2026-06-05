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

module.exports = {
  parseStripeWebhookMetadata,
  verifyStripeSignature
};
