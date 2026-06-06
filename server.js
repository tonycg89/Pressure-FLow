const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
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
const { createEmailDelivery } = require("./email-delivery");
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
  sendPressureFlowInvoiceEmail,
  sendScheduleConfirmationEmail
} = createEmailDelivery();

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
  createPressureFlowInvoice,
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
  createGoogleCalendarEvent,
  createPressureFlowInvoice,
  readSettings,
  randomToken: () => crypto.randomBytes(24).toString("hex"),
  sendAdminTextAlertSafe,
  sendCompletionCertificateEmailSafe,
  sendContractEmail,
  sendEstimateEmail,
  sendScheduleConfirmationEmail
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

    sendHtml(response, 200, renderEstimateMessagePage("Estimate approved", "Thank you. Your approval has been recorded. Your service contract has been sent to your email."));
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
      sendHtml(response, 404, renderEstimateMessagePage("Contract not found", "This contract link is invalid or has expired."));
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
      sendHtml(response, 404, renderEstimateMessagePage("Executed contract not found", "This executed contract link is invalid or has not been signed yet."));
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
      sendHtml(response, 404, renderEstimateMessagePage("Contract not found", "This contract link is invalid or has expired."));
      return;
    }

    sendHtml(response, 200, renderEstimateMessagePage("Contract signed", "Thank you. Your signed contract has been recorded. The deposit invoice has been sent to your email."));
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

  if (request.method === "GET" && url.pathname === "/api/jobs") {
    sendJson(response, 200, { jobs: await readJobs(), statuses });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/customers") {
    sendJson(response, 200, { customers: await readCustomers() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/expenses") {
    sendJson(response, 200, { expenses: await readExpenses() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/property-measurements") {
    const address = url.searchParams.get("address") || "";
    sendJson(response, 200, { measurements: await findSavedMeasurements(address) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export/jobs.csv") {
    const csv = jobsToCsv(await readJobs());
    response.writeHead(200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pressureflow-jobs-${dateStamp()}.csv"`
    });
    response.end(csv);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export/backup.json") {
    if (!isOwnerSession()) {
      sendError(response, 403, "Owner access required.");
      return;
    }

    const backup = {
      exportedAt: new Date().toISOString(),
      app: "PressureFlow",
      version: 1,
      statuses,
      settings: publicSettings(await readSettings()),
      jobs: await readJobs()
    };
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pressureflow-backup-${dateStamp()}.json"`
    });
    response.end(JSON.stringify(backup, null, 2));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/templates/service-agreement.docx") {
    const file = await readFile(path.join(ROOT, "Pressure Washing Service Agreement.docx"));
    response.writeHead(200, {
      "content-type": contentTypes[".docx"],
      "content-disposition": 'attachment; filename="Pressure Washing Service Agreement.docx"'
    });
    response.end(file);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/templates/estimate-approval.doc") {
    const settings = await readSettings();
    const doc = renderEstimateApprovalWordTemplate(settings);
    response.writeHead(200, {
      "content-type": `${contentTypes[".doc"]}; charset=utf-8`,
      "content-disposition": 'attachment; filename="PressureFlow Estimate Approval Template.doc"'
    });
    response.end(doc);
    return;
  }

  const customTemplateMatch = url.pathname.match(/^\/api\/templates\/custom\/([^/]+)$/);
  if (request.method === "GET" && customTemplateMatch) {
    const [, templateId] = customTemplateMatch;
    const settings = await readSettings();
    const template = normalizeCustomTemplates(settings.customTemplates).find((item) => item.id === templateId);
    if (!template) {
      sendError(response, 404, "Template not found.");
      return;
    }

    const [, base64Data = ""] = template.dataUrl.split(",");
    const file = Buffer.from(base64Data, "base64");
    response.writeHead(200, {
      "content-type": template.mimeType,
      "content-disposition": `attachment; filename="${sanitizeDownloadFileName(template.fileName)}"`
    });
    response.end(file);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/templates/custom") {
    const input = await readRequestBody(request);
    const settings = await readSettings();
    const templates = normalizeCustomTemplates(settings.customTemplates);
    if (Buffer.byteLength(String(input.dataUrl || ""), "utf8") > MAX_TEMPLATE_DATA_URL_BYTES) {
      sendError(response, 400, "Template is too large. Please upload a smaller Word document.");
      return;
    }

    const template = normalizeCustomTemplates([{
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      fileName: input.fileName,
      mimeType: input.mimeType,
      dataUrl: input.dataUrl,
      uploadedAt: new Date().toISOString()
    }])[0];

    if (!template) {
      sendError(response, 400, "Upload a valid Word document.");
      return;
    }

    if (!/\.docx?$/i.test(template.fileName)) {
      sendError(response, 400, "Only .doc and .docx templates are supported.");
      return;
    }

    template.file = createInlineFileRecord({
      ...template.file,
      accountId: getWorkspaceId() || "owner",
      ownerType: "settings",
      ownerId: "customTemplates",
      purpose: "custom-template",
      name: template.fileName,
      mimeType: template.mimeType,
      dataUrl: template.dataUrl,
      createdAt: template.uploadedAt
    });

    settings.customTemplates = [template, ...templates].slice(0, MAX_CUSTOM_TEMPLATES);
    await writeSettings(settings);
    sendJson(response, 200, { templates: getTemplateMetadata(settings.customTemplates) });
    return;
  }

  if (request.method === "DELETE" && customTemplateMatch) {
    const [, templateId] = customTemplateMatch;
    const settings = await readSettings();
    settings.customTemplates = normalizeCustomTemplates(settings.customTemplates).filter((template) => template.id !== templateId);
    await writeSettings(settings);
    sendJson(response, 200, { templates: getTemplateMetadata(settings.customTemplates) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/settings") {
    sendJson(response, 200, {
      settings: publicSettings(await readSettings(), { hidePlatformCredentials: !isOwnerSession() }),
      account: publicAccount(await readCurrentAccount())
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    const account = await readCurrentAccount();
    sendJson(response, 200, {
      user: publicSessionUser(requestContext.getStore()?.session) || (requestContext.getStore()?.authDisabled
        ? { id: "local-owner", accountId: "owner", email: "", role: "owner", isOwner: true }
        : null),
      account: publicAccount(account),
      csrfToken: buildCsrfToken(request)
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/users") {
    if (!isOwnerSession()) {
      sendError(response, 403, "Owner access required.");
      return;
    }
    sendJson(response, 200, { users: publicUsers(await readUsers()) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/users") {
    if (!isOwnerSession()) {
      sendError(response, 403, "Owner access required.");
      return;
    }
    try {
      const input = await readRequestBody(request);
      const result = await createAppUser(input);
      sendJson(response, 201, { user: publicUser(result.user), users: publicUsers(result.users) });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/webhooks/square/events") {
    if (!isOwnerSession()) {
      sendError(response, 403, "Owner access required.");
      return;
    }
    sendJson(response, 200, { events: await readWebhookEvents() });
    return;
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
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/google/start") {
    const settings = await readSettings();
    const authUrl = buildGoogleAuthUrl(settings);
    response.writeHead(302, { location: authUrl });
    response.end();
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/google/callback") {
    const code = url.searchParams.get("code");
    if (!code) {
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      response.end("<h1>Google authorization failed</h1><p>No authorization code was returned.</p>");
      return;
    }

    const settings = await readSettings();
    const tokens = await exchangeGoogleCode(settings, code);
    settings.googleRefreshToken = tokens.refresh_token || settings.googleRefreshToken;
    await writeSettings(settings);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<h1>Google Calendar connected</h1><p>You can close this tab and return to PressureFlow.</p>");
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/jobs") {
    const job = normalizeJob(await readRequestBody(request));
    const validationError = validateJob(job);

    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }

    const jobs = await readJobs();
    jobs.unshift(job);
    await syncJobMeasurementToCustomerFile(job);
    await writeJobs(jobs);
    sendJson(response, 201, { job });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/customers") {
    const customer = normalizeCustomer(await readRequestBody(request));
    const validationError = validateCustomer(customer);

    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }

    const customers = await readCustomers();
    customers.unshift(customer);
    await writeCustomers(customers);
    sendJson(response, 201, { customer });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/expenses") {
    const expense = normalizeExpense(await readRequestBody(request));
    const validationError = validateExpense(expense);

    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }

    const expenses = await readExpenses();
    expenses.unshift(expense);
    await writeExpenses(expenses);
    sendJson(response, 201, { expense });
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

  const updateMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
  const customerUpdateMatch = url.pathname.match(/^\/api\/customers\/([^/]+)$/);
  const customerMeasurementDeleteMatch = url.pathname.match(/^\/api\/customers\/([^/]+)\/measurements\/([^/]+)$/);
  const userDeleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);

  if (request.method === "DELETE" && userDeleteMatch) {
    if (!isOwnerSession()) {
      sendError(response, 403, "Owner access required.");
      return;
    }
    try {
      const [, userId] = userDeleteMatch;
      const result = await deleteAppUser(userId);
      sendJson(response, 200, { users: publicUsers(result.users) });
    } catch (error) {
      sendError(response, 400, error.message);
    }
    return;
  }

  if (request.method === "DELETE" && customerMeasurementDeleteMatch) {
    const [, customerId, measurementId] = customerMeasurementDeleteMatch;
    const body = await readRequestBody(request);
    const customers = await readCustomers();
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      sendError(response, 404, "Customer not found.");
      return;
    }

    const removed = deleteCustomerMeasurementArea(customer, measurementId, body.areaKey || "");
    if (!removed) {
      sendError(response, 404, "Saved service area not found.");
      return;
    }

    customer.updatedAt = new Date().toISOString();
    await writeCustomers(customers);
    sendJson(response, 200, { customer });
    return;
  }

  if (request.method === "PATCH" && customerUpdateMatch) {
    const [, customerId] = customerUpdateMatch;
    const customers = await readCustomers();
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      sendError(response, 404, "Customer not found.");
      return;
    }

    const updatedCustomer = normalizeCustomer(await readRequestBody(request), customer);
    const validationError = validateCustomer(updatedCustomer);
    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }

    Object.assign(customer, updatedCustomer);
    await writeCustomers(customers);
    sendJson(response, 200, { customer });
    return;
  }

  if (request.method === "DELETE" && customerUpdateMatch) {
    const [, customerId] = customerUpdateMatch;
    const customers = await readCustomers();
    const remainingCustomers = customers.filter((item) => item.id !== customerId);

    if (remainingCustomers.length === customers.length) {
      sendError(response, 404, "Customer not found.");
      return;
    }

    await writeCustomers(remainingCustomers);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "DELETE" && updateMatch) {
    const [, jobId] = updateMatch;
    const jobs = await readJobs();
    const remainingJobs = jobs.filter((item) => item.id !== jobId);

    if (remainingJobs.length === jobs.length) {
      sendError(response, 404, "Job not found.");
      return;
    }

    await writeJobs(remainingJobs);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "PATCH" && updateMatch) {
    const [, jobId] = updateMatch;
    const jobs = await readJobs();
    const job = jobs.find((item) => item.id === jobId);

    if (!job) {
      sendError(response, 404, "Job not found.");
      return;
    }

    const input = await readRequestBody(request);
    const pricingChanged = didPricingChange(job, input);
    updateJob(job, input);
    const validationError = validateJob(job);
    if (validationError) {
      sendError(response, 400, validationError);
      return;
    }

    if (pricingChanged) {
      await resetJobForPricingChange(job, cancelStoredInvoiceIfPossible);
    }

    await syncJobMeasurementToCustomerFile(job);
    job.updatedAt = new Date().toISOString();
    await writeJobs(jobs);
    sendJson(response, 200, { job });
    return;
  }

  const actionMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/([^/]+)$/);
  if (request.method === "POST" && actionMatch) {
    const [, jobId, action] = actionMatch;
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
    return;
  }

  sendError(response, 404, "API route not found.");
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

    await requestContext.run({ session, authDisabled: !authEnabled }, async () => {
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
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
