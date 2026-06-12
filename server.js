const http = require("node:http");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const {
  statuses,
  ensureDataFile,
  readJobs: readAllJobs,
  writeJobs: writeAllJobs,
  readCustomers: readAllCustomers,
  writeCustomers: writeAllCustomers,
  readExpenses: readAllExpenses,
  writeExpenses: writeAllExpenses,
  readFollowUpTasks,
  writeFollowUpTasks,
  readAccounts,
  writeAccounts,
  readUsers,
  writeUsers,
  readUserSettings,
  writeUserSettings,
  readWebhookEvents,
  writeWebhookEvents
} = require("./db");
const { CSRF_HEADER, SESSION_COOKIE, createAuthHelpers } = require("./auth");
const { createInlineFileRecord } = require("./storage");
const {
  jobsToCsv,
  normalizeCustomer,
  normalizeExpense,
  normalizeJob,
  normalizePhotos,
  validateCustomer,
  validateExpense,
  validateJob
} = require("./records");
const {
  renderCompletionProofPage,
  renderContractSigningPage,
  renderEstimateApprovalPage,
  renderEstimateApprovalWordTemplate,
  renderEstimateMessagePage,
  renderPressureFlowInvoicePage
} = require("./public-pages");
const {
  MAX_CUSTOM_TEMPLATES,
  MAX_TEMPLATE_DATA_URL_BYTES,
  getTemplateMetadata,
  normalizeCustomTemplates,
  normalizeSettings,
  publicSettings
} = require("./settings");
const { buildGoogleAuthUrl, createGoogleCalendarEvent, exchangeGoogleCode } = require("./integrations/google");
const {
  cancelSquareInvoice,
  createSquareInvoice,
  getSquareInvoice,
  verifySquareSignature
} = require("./integrations/square");
const { verifyStripeSignature } = require("./integrations/stripe");
const { sendAdminTextAlertSafe } = require("./integrations/twilio");
const {
  createPublicWorkflowHandlers
} = require("./public-workflows");
const { createWebhookHandlers, isSquareInvoicePaid } = require("./webhooks");
const { createMeasurementHandlers, deleteCustomerMeasurementArea } = require("./measurements");
const { didPricingChange, resetJobForPricingChange, updateJob } = require("./job-updates");
const { createJobActionHandler } = require("./job-actions");
const { createWorkspaceAccess } = require("./workspace");
const { createPaymentHandlers } = require("./payment-workflows");
const { createFollowUpHandlers } = require("./follow-ups");
const { createEmailDelivery } = require("./email-delivery");
const { createExportTemplateRoutes } = require("./export-template-routes");
const { createSettingsUserRoutes } = require("./settings-user-routes");
const { createRecordRoutes } = require("./record-routes");
const {
  contentTypes,
  getAppBaseUrl,
  loginPage,
  parseJsonRequestText,
  readFormOrJsonBody,
  readRawRequestBody,
  readRequestBody,
  sanitizeDownloadFileName,
  sendError,
  sendHtml,
  sendJson,
  serveStatic
} = require("./http-utils");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const requestContext = new AsyncLocalStorage();
const jobActionLocks = new Map();

const {
  authenticateLogin,
  buildCsrfToken,
  buildSessionCookie,
  clearLoginAttempts,
  createAppUser,
  deleteAppUser,
  getLoginRateLimitKey,
  getValidSession,
  hasValidCsrfToken,
  isAuthEnabled,
  isLoginRateLimited,
  isOwnerSession,
  isPublicPath,
  publicAccount,
  publicSessionUser,
  publicUser,
  publicUsers,
  recordFailedLoginAttempt,
  requiresCsrfToken,
  validateStartupSecurity
} = createAuthHelpers({
  readUsers,
  writeUsers,
  readAccounts,
  writeAccounts,
  safeCompare,
  getContextStore: () => requestContext.getStore()
});

const {
  getWorkspaceId,
  itemWorkspaceId,
  readCurrentAccount,
  readCustomers,
  readExpenses,
  readJobs,
  readSettings,
  readSettingsForJob,
  writeCustomers,
  writeExpenses,
  writeJobs,
  writeSettings
} = createWorkspaceAccess({
  getContextStore: () => requestContext.getStore(),
  readAccounts,
  readAllCustomers,
  readAllExpenses,
  readAllJobs,
  readUserSettings,
  writeAllCustomers,
  writeAllExpenses,
  writeAllJobs,
  writeUserSettings
});

const {
  sendCompletionCertificateEmailSafe,
  sendContractEmail,
  sendEstimateEmail,
  sendEstimateFollowUpEmail,
  sendPressureFlowInvoiceEmail,
  sendScheduleConfirmationEmail
} = createEmailDelivery();

const {
  cancelManualFollowUp,
  cancelPendingFollowUp,
  processDueFollowUps,
  scheduleFollowUp,
  scheduleEstimateFollowUp,
  sendManualEstimateFollowUp,
  setSuppressEstimateFollowUp
} = createFollowUpHandlers({
  itemWorkspaceId,
  readAllJobs,
  readFollowUpTasks,
  readJobs,
  readSettingsForJob,
  sendEstimateFollowUpEmail,
  writeAllJobs,
  writeFollowUpTasks,
  writeJobs
});

const {
  cancelStoredInvoiceIfPossible,
  createPressureFlowInvoice,
  createStripeCheckoutSession
} = createPaymentHandlers({
  cancelSquareInvoice,
  getSquareInvoice,
  isSquareInvoicePaid,
  itemWorkspaceId,
  readSettingsForJob,
  sendPressureFlowInvoiceEmail
});

const {
  approvePublicEstimate,
  findPublicCompletionProof,
  findPublicContract,
  findPublicEstimate,
  findPublicInvoice,
  rejectPublicEstimate,
  signPublicContract
} = createPublicWorkflowHandlers({
  cancelPendingFollowUp,
  scheduleFollowUp,
  createPressureFlowInvoice,
  itemWorkspaceId,
  readJobs,
  readSettingsForJob,
  sendAdminTextAlertSafe,
  sendContractEmail,
  writeJobs
});

const {
  getSquareWebhookSettings,
  getStripeWebhookSecret,
  handleSquareWebhook,
  handleStripeWebhook,
  recordWebhookEvent
} = createWebhookHandlers({
  cancelPendingFollowUp,
  readAllJobs,
  readJobs,
  readSettings,
  readSettingsForJob,
  readWebhookEvents,
  sendAdminTextAlertSafe,
  sendCompletionCertificateEmailSafe,
  writeAllJobs,
  writeJobs,
  writeWebhookEvents
});

const {
  findSavedMeasurements,
  syncJobMeasurementToCustomerFile
} = createMeasurementHandlers({
  readCustomers,
  readJobs,
  writeCustomers
});

const { applyAction } = createJobActionHandler({
  cancelManualFollowUp,
  cancelPendingFollowUp,
  createGoogleCalendarEvent,
  createPressureFlowInvoice,
  readSettings,
  randomToken: () => crypto.randomBytes(24).toString("hex"),
  scheduleEstimateFollowUp,
  scheduleFollowUp,
  sendAdminTextAlertSafe,
  sendCompletionCertificateEmailSafe,
  sendContractEmail,
  sendEstimateEmail,
  sendManualEstimateFollowUp,
  sendScheduleConfirmationEmail,
  setSuppressEstimateFollowUp,
  writeSettings
});

const { handleExportTemplateRoutes } = createExportTemplateRoutes({
  contentTypes,
  createInlineFileRecord,
  dateStamp,
  getTemplateMetadata,
  getWorkspaceId,
  isOwnerSession,
  jobsToCsv,
  MAX_CUSTOM_TEMPLATES,
  MAX_TEMPLATE_DATA_URL_BYTES,
  normalizeCustomTemplates,
  publicSettings,
  readJobs,
  readRequestBody,
  readSettings,
  renderEstimateApprovalWordTemplate,
  root: ROOT,
  sanitizeDownloadFileName,
  sendError,
  sendJson,
  statuses,
  writeSettings,
  randomId: () => crypto.randomUUID()
});

const { handleSettingsUserRoutes } = createSettingsUserRoutes({
  buildCsrfToken,
  buildGoogleAuthUrl,
  createAppUser,
  deleteAppUser,
  exchangeGoogleCode,
  getContextStore: () => requestContext.getStore(),
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
  requestFallbackUser: { id: "local-owner", accountId: "owner", email: "", role: "owner", isOwner: true },
  sendError,
  sendJson,
  writeSettings
});

const { handleRecordRoutes } = createRecordRoutes({
  cancelPendingFollowUp,
  cancelStoredInvoiceIfPossible,
  deleteCustomerMeasurementArea,
  didPricingChange,
  findSavedMeasurements,
  itemWorkspaceId,
  normalizeCustomer,
  normalizeExpense,
  normalizeJob,
  readCustomers,
  readExpenses,
  readJobs,
  readRequestBody,
  resetJobForPricingChange,
  sendError,
  sendJson,
  statuses,
  syncJobMeasurementToCustomerFile,
  updateJob,
  validateCustomer,
  validateExpense,
  validateJob,
  writeCustomers,
  writeExpenses,
  writeJobs
});

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (requiresCsrfToken(request, url) && !hasValidCsrfToken(request)) {
    sendError(response, 403, "Security token expired. Refresh the page and try again.");
    return;
  }

  if (request.method === "GET" && url.pathname === "/login") {
    sendHtml(response, 200, loginPage.replace("%ERROR%", ""));
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const body = await readFormOrJsonBody(request);
    const rateLimitKey = getLoginRateLimitKey(request, body.email);

    if (isLoginRateLimited(rateLimitKey)) {
      sendHtml(response, 429, loginPage.replace("%ERROR%", "Too many login attempts. Please try again in a few minutes."));
      return;
    }

    const login = await authenticateLogin(body.email, body.password);
    if (login) {
      clearLoginAttempts(rateLimitKey);
      response.writeHead(302, {
        "set-cookie": buildSessionCookie(login),
        location: "/"
      });
      response.end();
      return;
    }

    recordFailedLoginAttempt(rateLimitKey);
    sendHtml(response, 401, loginPage.replace("%ERROR%", "Invalid email or password."));
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    response.writeHead(302, {
      "set-cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
      location: "/login"
    });
    response.end();
    return;
  }

  const estimatePageMatch = url.pathname.match(/^\/estimate\/([^/]+)$/);
  if (request.method === "GET" && estimatePageMatch) {
    const [, jobId] = estimatePageMatch;
    const job = await findPublicEstimate(jobId, url.searchParams.get("token") || "");
    if (!job) {
      sendHtml(response, 404, renderEstimateMessagePage("Estimate not found", "This estimate link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderEstimateApprovalPage(job, await readSettingsForJob(job)));
    return;
  }

  const approveEstimateMatch = url.pathname.match(/^\/api\/public\/estimates\/([^/]+)\/approve$/);
  if (request.method === "POST" && approveEstimateMatch) {
    const [, jobId] = approveEstimateMatch;
    const body = await readFormOrJsonBody(request);
    const result = await approvePublicEstimate(jobId, body.token || "");
    if (!result) {
      sendHtml(response, 404, renderEstimateMessagePage("Estimate not found", "This estimate link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderEstimateMessagePage("Estimate approved", "Thank you. Your approval has been recorded. Your service agreement has been sent to your email."));
    return;
  }

  const rejectEstimateMatch = url.pathname.match(/^\/api\/public\/estimates\/([^/]+)\/reject$/);
  if (request.method === "POST" && rejectEstimateMatch) {
    const [, jobId] = rejectEstimateMatch;
    const body = await readFormOrJsonBody(request);
    const result = await rejectPublicEstimate(jobId, body.token || "", body.reason || "", body.otherReason || "");
    if (!result) {
      sendHtml(response, 404, renderEstimateMessagePage("Estimate not found", "This estimate link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderEstimateMessagePage("Estimate declined", "Thank you for letting us know. The business has recorded your response and may follow up if needed."));
    return;
  }

  const contractPageMatch = url.pathname.match(/^\/contract\/([^/]+)$/);
  if (request.method === "GET" && contractPageMatch) {
    const [, jobId] = contractPageMatch;
    const job = await findPublicContract(jobId, url.searchParams.get("token") || "");
    if (!job) {
      sendHtml(response, 404, renderEstimateMessagePage("Service agreement not found", "This service agreement link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderContractSigningPage(job, { settings: await readSettingsForJob(job) }));
    return;
  }

  const executedContractMatch = url.pathname.match(/^\/contract\/([^/]+)\/executed$/);
  if (request.method === "GET" && executedContractMatch) {
    const [, jobId] = executedContractMatch;
    const job = await findPublicContract(jobId, url.searchParams.get("token") || "");
    if (!job || !job.contractSignedAt) {
      sendHtml(response, 404, renderEstimateMessagePage("Signed agreement not found", "This signed agreement link is invalid or has not been signed yet."));
      return;
    }

    sendHtml(response, 200, renderContractSigningPage(job, { executedOnly: true, settings: await readSettingsForJob(job) }));
    return;
  }

  const signContractMatch = url.pathname.match(/^\/api\/public\/contracts\/([^/]+)\/sign$/);
  if (request.method === "POST" && signContractMatch) {
    const [, jobId] = signContractMatch;
    const body = await readFormOrJsonBody(request);
    const result = await signPublicContract(jobId, body.token || "", body.signerName || "", body.signedDate || "");
    if (!result) {
      sendHtml(response, 404, renderEstimateMessagePage("Service agreement not found", "This service agreement link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderEstimateMessagePage("Agreement signed", "Thank you. Your signed agreement has been recorded. The deposit invoice has been sent to your email."));
    return;
  }

  const proofPageMatch = url.pathname.match(/^\/proof\/([^/]+)$/);
  if (request.method === "GET" && proofPageMatch) {
    const [, jobId] = proofPageMatch;
    const job = await findPublicCompletionProof(jobId, url.searchParams.get("token") || "");
    if (!job) {
      sendHtml(response, 404, renderEstimateMessagePage("Proof page not found", "This completion proof link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderCompletionProofPage(job, await readSettingsForJob(job)));
    return;
  }

  const invoicePageMatch = url.pathname.match(/^\/invoice\/([^/]+)$/);
  if (request.method === "GET" && invoicePageMatch) {
    const [, jobId] = invoicePageMatch;
    const invoiceType = url.searchParams.get("type") === "deposit" ? "deposit" : "final";
    const job = await findPublicInvoice(jobId, invoiceType, url.searchParams.get("token") || "");
    if (!job) {
      sendHtml(response, 404, renderEstimateMessagePage("Invoice not found", "This invoice link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderPressureFlowInvoicePage(job, await readSettingsForJob(job), invoiceType));
    return;
  }

  if (await handleExportTemplateRoutes(request, response, url)) {
    return;
  }

  if (await handleSettingsUserRoutes(request, response, url)) {
    return;
  }

  if (await handleRecordRoutes(request, response, url)) {
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/follow-up-tasks") {
    const tasks = await readFollowUpTasks({ accountId: getWorkspaceId() });
    sendJson(response, 200, { tasks });
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/square") {
    const rawBody = await readRawRequestBody(request);
    if (!(await verifySquareWebhookSignature(request, rawBody))) {
      await recordWebhookEvent({ provider: "square", status: "rejected", reason: "invalid signature" });
      sendError(response, 401, "Invalid Square webhook signature.");
      return;
    }

    const event = parseJsonRequestText(rawBody);
    const result = await handleSquareWebhook(event);
    await recordWebhookEvent({
      provider: "square",
      status: "processed",
      type: event.type || "",
      eventId: event.event_id || "",
      result
    });
    sendJson(response, 200, { ok: true, result });
    return;
  }

  if (request.method === "POST" && url.pathname === "/webhooks/stripe") {
    const rawBody = await readRawRequestBody(request);
    if (!(await verifyStripeWebhookSignature(request, rawBody))) {
      sendError(response, 401, "Invalid Stripe webhook signature.");
      return;
    }

    const event = parseJsonRequestText(rawBody);
    const result = await handleStripeWebhook(event);
    sendJson(response, 200, { ok: true, result });
    return;
  }

  const cardPayMatch = url.pathname.match(/^\/api\/public\/invoices\/([^/]+)\/pay-card$/);
  if (request.method === "POST" && cardPayMatch) {
    const [, jobId] = cardPayMatch;
    const body = await readFormOrJsonBody(request);
    const invoiceType = body.type === "deposit" ? "deposit" : "final";
    const job = await findPublicInvoice(jobId, invoiceType, body.token || "");
    if (!job) {
      sendError(response, 404, "Invoice not found.");
      return;
    }

    const checkout = await createStripeCheckoutSession(job, await readSettingsForJob(job), invoiceType, getAppBaseUrl(request));
    response.writeHead(303, { location: checkout.url });
    response.end();
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/([^/]+)$/);
  if (request.method === "POST" && actionMatch) {
    const [, jobId, action] = actionMatch;
    await withJobActionLock(jobId, async () => {
      const jobs = await readJobs();
      const job = jobs.find((item) => item.id === jobId);

      if (!job) {
        sendError(response, 404, "Job not found.");
        return;
      }

      const input = await readRequestBody(request);
      input._baseUrl = getAppBaseUrl(request);
      await applyAction(job, action, input);
      job.updatedAt = new Date().toISOString();
      await writeJobs(jobs);
      sendJson(response, 200, { job });
    });
    return;
  }

  sendError(response, 404, "API route not found.");
}

async function withJobActionLock(jobId, task) {
  const key = String(jobId || "");
  const previous = jobActionLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current, () => current);
  jobActionLocks.set(key, queued);

  await previous.catch(() => null);
  try {
    return await task();
  } finally {
    release();
    if (jobActionLocks.get(key) === queued) {
      jobActionLocks.delete(key);
    }
  }
}

async function verifySquareWebhookSignature(request, rawBody) {
  const settings = await getSquareWebhookSettings(rawBody);
  return verifySquareSignature(request, rawBody, settings.squareWebhookSignatureKey, safeCompare);
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

async function verifyStripeWebhookSignature(request, rawBody) {
  const secret = await getStripeWebhookSecret(rawBody);
  return verifyStripeSignature(request.headers["stripe-signature"], rawBody, secret, safeCompare);
}

function ignoresSessionForPublicWorkflow(pathname) {
  return pathname.startsWith("/estimate/") ||
    pathname.startsWith("/contract/") ||
    pathname.startsWith("/proof/") ||
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/api/public/");
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const session = getValidSession(request);
    const authEnabled = await isAuthEnabled();

    if (authEnabled && !isPublicPath(url.pathname) && !session) {
      if (url.pathname.startsWith("/api/")) {
        sendError(response, 401, "Authentication required.");
        return;
      }

      response.writeHead(302, { location: "/login" });
      response.end();
      return;
    }

    await requestContext.run({
      session: ignoresSessionForPublicWorkflow(url.pathname) ? null : session,
      authDisabled: !authEnabled
    }, async () => {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/estimate/") || url.pathname.startsWith("/contract/") || url.pathname.startsWith("/proof/") || url.pathname.startsWith("/invoice/") || url.pathname === "/login" || url.pathname === "/health" || url.pathname === "/webhooks/square" || url.pathname === "/webhooks/stripe") {
        await handleApi(request, response, url);
        return;
      }

      await serveStatic(response, url, ROOT);
    });
  } catch (error) {
    sendError(response, error.statusCode || 500, error.message || "Unexpected server error.");
  }
});

ensureDataFile()
  .then(validateStartupSecurity)
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PressureFlow running at http://localhost:${PORT}`);
    });
    processDueFollowUps().catch((error) => {
      console.warn(`Unable to process follow-up tasks on startup: ${error.message}`);
    });
    const followUpInterval = setInterval(() => {
      processDueFollowUps().catch((error) => {
        console.warn(`Unable to process follow-up tasks: ${error.message}`);
      });
    }, 15 * 60 * 1000);
    followUpInterval.unref?.();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
