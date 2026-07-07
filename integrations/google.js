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
    }),
    signal: googleRequestTimeoutSignal()
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error_description || data.error || "Google token exchange failed.");
  }

  return data;
}

async function getGoogleAccessToken(settings) {
  requireGoogleSettings(settings, true);
  let response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: settings.googleClientId,
        client_secret: settings.googleClientSecret,
        refresh_token: settings.googleRefreshToken,
        grant_type: "refresh_token"
      }),
      signal: googleRequestTimeoutSignal()
    });
  } catch (error) {
    throw createCalendarError("Google Calendar could not be reached. Check the Google connection and try scheduling again.", {
      code: "GOOGLE_CALENDAR_TOKEN_REQUEST_FAILED",
      cause: error
    });
  }
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.error_description || data.error || "Google access token refresh failed.";
    throw createCalendarError(normalizeGoogleAuthErrorMessage(data, message), {
      statusCode: data.error === "invalid_grant" ? 409 : 502,
      code: data.error === "invalid_grant" ? "GOOGLE_CALENDAR_AUTH_REVOKED" : "GOOGLE_CALENDAR_AUTH_ERROR"
    });
  }

  return data.access_token;
}

async function createGoogleCalendarEventRequest(settings, event) {
  const accessToken = await getGoogleAccessToken(settings);
  const calendarId = encodeURIComponent(settings.googleCalendarId || "primary");
  let response;
  try {
    response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event),
      signal: googleRequestTimeoutSignal()
    });
  } catch (error) {
    throw createCalendarError("Google Calendar event creation failed. Check the Calendar connection and try scheduling again.", {
      code: "GOOGLE_CALENDAR_EVENT_REQUEST_FAILED",
      cause: error
    });
  }
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createCalendarError(
      data.error?.message || data.error || `Google Calendar event creation failed with status ${response.status}.`,
      { code: "GOOGLE_CALENDAR_EVENT_CREATE_FAILED" }
    );
  }

  return data;
}

async function createGoogleCalendarEvent(settings, job, scheduledAt, durationMinutes) {
  if (!scheduledAt) {
    throw createCalendarError("Schedule date/time is required.", {
      statusCode: 400,
      code: "INVALID_SCHEDULE_PAYLOAD"
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(scheduledAt))) {
    throw createCalendarError("Schedule date/time is invalid. Use a value like 2026-06-05T09:00.", {
      statusCode: 400,
      code: "INVALID_SCHEDULE_PAYLOAD"
    });
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
    throwCalendarSetupError("Google client ID is missing. Open Settings and save your Google client ID.");
  }
  if (!settings.googleClientSecret) {
    throwCalendarSetupError("Google client secret is missing. Open Settings and save your Google client secret.");
  }
  if (!settings.googleRedirectUri) {
    throwCalendarSetupError("Google redirect URI is missing. Open Settings and save your Google redirect URI.");
  }
  if (requireRefreshToken && !settings.googleRefreshToken) {
    throwCalendarSetupError("Google Calendar is not connected yet. Open Settings and click Connect Google Calendar.");
  }
}

function throwCalendarSetupError(message) {
  throw createCalendarError(message, {
    statusCode: 409,
    code: "GOOGLE_CALENDAR_NOT_CONFIGURED"
  });
}

function normalizeGoogleAuthErrorMessage(data, fallback) {
  if (data?.error === "invalid_grant") {
    return "Google Calendar access has expired or was revoked. Open Settings and click Connect Google again before scheduling jobs.";
  }

  return fallback;
}

function googleRequestTimeoutSignal() {
  return AbortSignal.timeout(15000);
}

function createCalendarError(message, { statusCode = 502, code = "GOOGLE_CALENDAR_ACTION_FAILED", cause = null } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.exposeToClient = true;
  if (cause) {
    error.cause = cause;
  }
  return error;
}

module.exports = {
  buildGoogleAuthUrl,
  createGoogleCalendarEvent,
  createGoogleCalendarEventRequest,
  createCalendarError,
  exchangeGoogleCode,
  getGoogleAccessToken
};
