const { buildMimeEmailBase64Url, formatEmailAddressHeader } = require("./email");
const { getDepositCents } = require("../billing");
const { addMinutesToLocalDateTime, withPacificOffset } = require("../scheduling");

function buildGoogleAuthUrl(settings) {
  requireGoogleSettings(settings, false);
  const params = new URLSearchParams({
    client_id: settings.googleClientId,
    redirect_uri: settings.googleRedirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send",
    access_type: "offline",
    prompt: "consent"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeGoogleCode(settings, code) {
  requireGoogleSettings(settings, false);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      redirect_uri: settings.googleRedirectUri,
      grant_type: "authorization_code"
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google token exchange failed.");
  }

  return data;
}

async function getGoogleAccessToken(settings) {
  requireGoogleSettings(settings, true);
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.googleClientId,
      client_secret: settings.googleClientSecret,
      refresh_token: settings.googleRefreshToken,
      grant_type: "refresh_token"
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error || "Google access token refresh failed.";
    const error = new Error(normalizeGoogleAuthErrorMessage(data, message));
    error.code = data.error === "invalid_grant" ? "GOOGLE_AUTH_REVOKED" : "GOOGLE_AUTH_ERROR";
    throw error;
  }

  return data.access_token;
}

async function sendGmailEmail(settings, message) {
  const accessToken = await getGoogleAccessToken(settings);
  const senderAddress = settings.businessEmail || settings.googleCalendarId || "";
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
    body: JSON.stringify({ raw })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const messageText = data.error?.message || data.error_description || "Google email send failed.";
    throw new Error(`${messageText} Reconnect Google Calendar from Settings so PressureFlow can send estimate emails.`);
  }

  return data;
}

async function createGoogleCalendarEventRequest(settings, event) {
  const accessToken = await getGoogleAccessToken(settings);
  const calendarId = encodeURIComponent(settings.googleCalendarId || "primary");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `Google Calendar event creation failed with status ${response.status}.`);
  }

  return data;
}

async function createGoogleCalendarEvent(settings, job, scheduledAt, durationMinutes) {
  if (!scheduledAt) {
    throw new Error("Schedule date/time is required.");
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(scheduledAt))) {
    throw new Error("Schedule date/time is invalid. Use a value like 2026-06-05T09:00.");
  }

  const startDateTime = withPacificOffset(scheduledAt.slice(0, 16));
  const endDateTime = withPacificOffset(addMinutesToLocalDateTime(scheduledAt.slice(0, 16), durationMinutes));
  return createGoogleCalendarEventRequest(settings, {
    summary: `${job.serviceType} - ${job.customerName}`,
    location: job.address,
    description: [
      `Customer: ${job.customerName}`,
      `Phone: ${job.phone}`,
      `Email: ${job.email}`,
      `Service: ${job.serviceType}`,
      `Estimate: $${Number(job.estimate || 0).toFixed(2)}`,
      `Deposit: $${(getDepositCents(job) / 100).toFixed(2)}`,
      "",
      `Notes: ${job.notes || "None"}`,
      `Access notes: ${job.accessNotes || "None"}`,
      `Sensitive areas: ${job.sensitiveAreas || "None"}`
    ].join("\n"),
    start: {
      dateTime: startDateTime,
      timeZone: "America/Los_Angeles"
    },
    end: {
      dateTime: endDateTime,
      timeZone: "America/Los_Angeles"
    },
    reminders: {
      useDefault: true
    }
  });
}

function requireGoogleSettings(settings, requireRefreshToken) {
  if (!settings.googleClientId) {
    throw new Error("Google client ID is missing. Open Settings and save your Google client ID.");
  }
  if (!settings.googleClientSecret) {
    throw new Error("Google client secret is missing. Open Settings and save your Google client secret.");
  }
  if (!settings.googleRedirectUri) {
    throw new Error("Google redirect URI is missing.");
  }
  if (requireRefreshToken && !settings.googleRefreshToken) {
    throw new Error("Google Calendar is not connected yet. Open Settings and click Connect Google Calendar.");
  }
}

function normalizeGoogleAuthErrorMessage(data, fallback) {
  if (data?.error === "invalid_grant") {
    return "Google access has expired or was revoked. Open Settings and click Connect Google Calendar again so PressureFlow can send estimate emails.";
  }

  return fallback;
}

module.exports = {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  createGoogleCalendarEventRequest,
  exchangeGoogleCode,
  getGoogleAccessToken,
  sendGmailEmail
};
