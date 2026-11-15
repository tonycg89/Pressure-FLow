const {
  createAccountLink,
  createConnectedAccount,
  retrieveAccount,
  summarizeAccountStatus
} = require("./integrations/stripe-connect");

// Settings → "Connect with Stripe" onboarding routes. All require a session
// (none are public paths). The start route is a CSRF-protected POST because it
// creates a Stripe account; refresh/return are GETs because Stripe redirects
// the browser to them, and they only act on the account already saved.
function createStripeConnectRoutes({
  getAppBaseUrl,
  getWorkspaceId,
  logger,
  readSettings,
  renderMessagePage,
  sendError,
  sendHtml,
  sendJson,
  writeSettings
}) {
  const startLocks = new Map();

  async function withStartLock(key, task) {
    const previous = startLocks.get(key) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => { release = resolve; });
    const queued = previous.then(() => current, () => current);
    startLocks.set(key, queued);
    await previous.catch(() => null);
    try {
      return await task();
    } finally {
      release();
      if (startLocks.get(key) === queued) {
        startLocks.delete(key);
      }
    }
  }

  async function ensureConnectedAccount() {
    const settings = await readSettings();
    if (settings.stripeAccountId && !settings.stripeConnectStatus?.deauthorized) {
      return settings;
    }
    const account = await createConnectedAccount({
      pressureflowAccountId: getWorkspaceId(),
      email: settings.businessEmail || "",
      businessName: settings.businessName || ""
    });
    settings.stripeAccountId = account.id;
    settings.stripeConnectStatus = summarizeAccountStatus(account);
    await writeSettings(settings);
    logger.info("stripe_connect_account_created", { accountId: getWorkspaceId() });
    return settings;
  }

  function buildOnboardingLink(request, stripeAccountId) {
    const base = getAppBaseUrl(request);
    return createAccountLink({
      stripeAccountId,
      refreshUrl: `${base}/auth/stripe/connect/refresh`,
      returnUrl: `${base}/auth/stripe/connect/return`
    });
  }

  function sendConnectError(response, error) {
    logger.warn("stripe_connect_failed", { accountId: getWorkspaceId(), error });
    sendHtml(response, error.statusCode || 502, renderMessagePage(
      "Stripe connection problem",
      `${error.message || "Stripe could not be reached."} Close this tab and try Connect with Stripe again from Settings.`
    ));
  }

  async function handleStripeConnectRoutes(request, response, url) {
    if (request.method === "POST" && url.pathname === "/api/stripe/connect/start") {
      try {
        const link = await withStartLock(getWorkspaceId(), async () => {
          const settings = await ensureConnectedAccount();
          return buildOnboardingLink(request, settings.stripeAccountId);
        });
        sendJson(response, 200, { url: link.url });
      } catch (error) {
        logger.warn("stripe_connect_failed", { accountId: getWorkspaceId(), error });
        sendError(response, error.statusCode || 502, error.message || "Unable to start Stripe onboarding.");
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/auth/stripe/connect/refresh") {
      try {
        const settings = await readSettings();
        if (!settings.stripeAccountId) {
          response.writeHead(302, { location: "/?stripeConnect=missing" });
          response.end();
          return true;
        }
        const link = await buildOnboardingLink(request, settings.stripeAccountId);
        response.writeHead(302, { location: link.url });
        response.end();
      } catch (error) {
        sendConnectError(response, error);
      }
      return true;
    }

    if (request.method === "GET" && url.pathname === "/auth/stripe/connect/return") {
      try {
        const settings = await readSettings();
        if (settings.stripeAccountId) {
          // The return URL carries no state; Stripe's account object is the truth.
          const account = await retrieveAccount(settings.stripeAccountId);
          settings.stripeConnectStatus = summarizeAccountStatus(account);
          await writeSettings(settings);
        }
        response.writeHead(302, { location: "/?stripeConnect=return" });
        response.end();
      } catch (error) {
        sendConnectError(response, error);
      }
      return true;
    }

    return false;
  }

  return { handleStripeConnectRoutes };
}

module.exports = {
  createStripeConnectRoutes
};
