function createSettingsUserRoutes({
  buildCsrfToken,
  buildGoogleAuthUrl,
  createAppUser,
  deleteAppUser,
  exchangeGoogleCode,
  getContextStore,
  isOwnerSession,
  normalizeSettings,
  publicAccount,
  publicSessionUser,
  publicSettings,
  publicUser,
  publicUsers,
  readCurrentAccount,
  readRequestBody,
  readSettings,
  readUsers,
  readWebhookEvents,
  requestFallbackUser,
  sendError,
  sendJson,
  writeSettings
}) {
  async function handleSettingsUserRoutes(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/settings") {
      sendJson(response, 200, {
        settings: publicSettings(await readSettings(), { hidePlatformCredentials: !isOwnerSession() }),
        account: publicAccount(await readCurrentAccount())
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/session") {
      const account = await readCurrentAccount();
      sendJson(response, 200, {
        user: publicSessionUser(getContextStore()?.session) || (getContextStore()?.authDisabled
          ? requestFallbackUser
          : null),
        account: publicAccount(account),
        csrfToken: buildCsrfToken(request)
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/users") {
      if (!isOwnerSession()) {
        sendError(response, 403, "Owner access required.");
        return true;
      }
      sendJson(response, 200, { users: publicUsers(await readUsers()) });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/users") {
      if (!isOwnerSession()) {
        sendError(response, 403, "Owner access required.");
        return true;
      }
      try {
        const input = await readRequestBody(request);
        const result = await createAppUser(input);
        sendJson(response, 201, { user: publicUser(result.user), users: publicUsers(result.users) });
      } catch (error) {
        sendError(response, 400, error.message);
      }
      return true;
    }

    const userDeleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (request.method === "DELETE" && userDeleteMatch) {
      if (!isOwnerSession()) {
        sendError(response, 403, "Owner access required.");
        return true;
      }
      try {
        const [, userId] = userDeleteMatch;
        const result = await deleteAppUser(userId);
        sendJson(response, 200, { users: publicUsers(result.users) });
      } catch (error) {
        sendError(response, 400, error.message);
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/api/webhooks/square/events") {
      if (!isOwnerSession()) {
        sendError(response, 403, "Owner access required.");
        return true;
      }
      sendJson(response, 200, { events: await readWebhookEvents() });
      return true;
    }

    if (request.method === "POST" && url.pathname === "/api/settings") {
      const existing = await readSettings();
      const input = await readRequestBody(request);
      const settings = normalizeSettings(input, existing);
      if (!isOwnerSession()) {
        settings.mapboxPublicToken = "";
        settings.googleClientId = "";
        settings.googleClientSecret = "";
        settings.googleRedirectUri = "";
      }
      await writeSettings(settings);
      sendJson(response, 200, {
        settings: publicSettings(settings, { hidePlatformCredentials: !isOwnerSession() }),
        account: publicAccount(await readCurrentAccount())
      });
      return true;
    }

    if (request.method === "GET" && url.pathname === "/auth/google/start") {
      const settings = await readSettings();
      const authUrl = buildGoogleAuthUrl(settings);
      response.writeHead(302, { location: authUrl });
      response.end();
      return true;
    }

    if (request.method === "GET" && url.pathname === "/auth/google/callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end("<h1>Google authorization failed</h1><p>No authorization code was returned.</p>");
        return true;
      }

      const settings = await readSettings();
      const tokens = await exchangeGoogleCode(settings, code);
      settings.googleRefreshToken = tokens.refresh_token || settings.googleRefreshToken;
      await writeSettings(settings);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>Google Calendar connected</h1><p>You can close this tab and return to PressureFlow.</p>");
      return true;
    }

    return false;
  }

  return { handleSettingsUserRoutes };
}

module.exports = {
  createSettingsUserRoutes
};
