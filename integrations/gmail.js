const { buildMimeEmailBase64Url, formatEmailAddressHeader } = require("./email");

async function sendGmailEmail(settings, message) {
  const accessToken = await getGoogleEmailAccessToken(settings);
  const senderAddress = settings.businessEmail || settings.smtpFromEmail || settings.googleCalendarId || "";
  const raw = buildMimeEmailBase64Url({
    from: formatEmailAddressHeader(senderAddress, settings.businessName),
    to: message.to,
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody,
    attachments: message.attachments || []
  });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw }),
    signal: gmailRequestTimeoutSignal()
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const messageText = data.error?.message || data.error_description || "Google email send failed.";
    throw new Error(`${messageText} Reconnect Google/Gmail from Settings so PressureFlow can send customer emails.`);
  }

  return data;
}

async function getGoogleEmailAccessToken(settings) {
  requireGoogleEmailSettings(settings);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      refresh_token: settings.googleRefreshToken,
      grant_type: "refresh_token"
    }),
    signal: gmailRequestTimeoutSignal()
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error || "Google email access token refresh failed.";
    const error = new Error(normalizeGoogleEmailAuthErrorMessage(data, message));
    error.code = data.error === "invalid_grant" ? "GOOGLE_EMAIL_AUTH_REVOKED" : "GOOGLE_EMAIL_AUTH_ERROR";
    throw error;
  }

  return data.access_token;
}

function requireGoogleEmailSettings(settings) {
  if (!settings.googleClientId) {
    throwEmailConfigError("Google client ID is missing. Open Settings and save your Google client ID.");
  }
  if (!settings.googleClientSecret) {
    throwEmailConfigError("Google client secret is missing. Open Settings and save your Google client secret.");
  }
  if (!settings.googleRedirectUri) {
    throwEmailConfigError("Google redirect URI is missing. Open Settings and save your Google redirect URI.");
  }
  if (!settings.googleRefreshToken) {
    throwEmailConfigError("Google/Gmail is not connected yet. Open Settings and connect Google before sending customer emails, or switch email delivery to SMTP.");
  }
}

function throwEmailConfigError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  error.code = "EMAIL_PROVIDER_NOT_CONFIGURED";
  throw error;
}

function normalizeGoogleEmailAuthErrorMessage(data, fallback) {
  if (data?.error === "invalid_grant") {
    return "Google/Gmail access has expired or was revoked. Open Settings and reconnect Google before sending customer emails, or switch email delivery to SMTP.";
  }

  return fallback;
}

function gmailRequestTimeoutSignal() {
  return AbortSignal.timeout(15000);
}

module.exports = {
  getGoogleEmailAccessToken,
  sendGmailEmail
};
