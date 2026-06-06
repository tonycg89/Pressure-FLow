const http = require("node:http");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const {
  defaultSettings,
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
  readSettings: readGlobalSettings,
  writeSettings: writeGlobalSettings,
  readUserSettings,
  writeUserSettings,
  readWebhookEvents,
  writeWebhookEvents
} = require("./db");
const { CSRF_HEADER, SESSION_COOKIE, createAuthHelpers } = require("./auth");
const {
  formatAlertCustomer,
  formatAlertMoney,
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const { createInlineFileRecord } = require("./storage");
const {
  buildFullAddress,
  getNextStatus,
  jobsToCsv,
  normalizeCustomer,
  normalizeExpense,
  normalizeJob,
  normalizeJobPhotos,
  normalizeLineItems,
  normalizeMeasurement,
  normalizePhotos,
  normalizePropertyMeasurements,
  validateCustomer,
  validateExpense,
  validateJob
} = require("./records");
const { getBaseUrlFromLink } = require("./rendering");
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
const {
  buildScheduleInviteAttachment,
  formatScheduledWindow,
  getDayOfServiceInstructions
} = require("./scheduling");
const { buildGoogleAuthUrl, createGoogleCalendarEvent, exchangeGoogleCode, sendGmailEmail } = require("./integrations/google");
const { sendSmtpEmail } = require("./integrations/smtp");
const {
  cancelSquareInvoice,
  createSquareInvoice,
  extractSquareInvoice,
  getSquareInvoice,
  parseSquareWebhookInvoiceId,
  verifySquareSignature
} = require("./integrations/square");
const { createStripeCheckoutSessionRequest, parseStripeWebhookMetadata, verifyStripeSignature } = require("./integrations/stripe");
const { sendAdminTextAlertSafe } = require("./integrations/twilio");
const {
  buildCompletionCertificateEmailMessage,
  buildCompletionNotice,
  buildContractEmailMessage,
  buildContractMailto,
  buildEstimateEmailMessage,
  buildEstimateMailto,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage
} = require("./email-content");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024;
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

function readSettings() {
  return readUserSettings(requestContext.getStore()?.session?.userId || "");
}

function writeSettings(settings) {
  return writeUserSettings(requestContext.getStore()?.session?.userId || "", settings);
}

async function readCurrentAccount() {
  const accountId = getWorkspaceId();
  if (!accountId) {
    return null;
  }

  const accounts = await readAccounts();
  return accounts.find((account) => account.id === accountId) || {
    id: accountId,
    name: accountId === "owner" ? "Owner Account" : "Account",
    plan: accountId === "owner" ? "owner" : "tester",
    status: "active"
  };
}

function readSettingsForJob(job) {
  return readUserSettings(itemWorkspaceId(job) === "owner" ? "env-admin" : itemWorkspaceId(job));
}

function getWorkspaceId() {
  const context = requestContext.getStore();
  if (context?.authDisabled || context?.session?.userId === "env-admin") {
    return "owner";
  }
  return context?.session?.accountId || context?.session?.userId || "";
}

function itemWorkspaceId(item) {
  return item.accountId || "owner";
}

async function readWorkspaceItems(readAll) {
  const workspaceId = getWorkspaceId();
  if (process.env.DATABASE_URL && workspaceId) {
    return readAll({ accountId: workspaceId });
  }

  const items = await readAll();
  return workspaceId ? items.filter((item) => itemWorkspaceId(item) === workspaceId) : items;
}

async function writeWorkspaceItems(readAll, writeAll, items) {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) {
    return writeAll(items);
  }

  const scopedItems = items.map((item) => ({ ...item, accountId: workspaceId }));
  if (process.env.DATABASE_URL) {
    return writeAll(scopedItems, { accountId: workspaceId });
  }

  const allItems = await readAll();
  const otherWorkspaceItems = allItems.filter((item) => itemWorkspaceId(item) !== workspaceId);
  return writeAll([...scopedItems, ...otherWorkspaceItems]);
}

function readJobs() {
  return readWorkspaceItems(readAllJobs);
}

function writeJobs(items) {
  return writeWorkspaceItems(readAllJobs, writeAllJobs, items);
}

function readCustomers() {
  return readWorkspaceItems(readAllCustomers);
}

function writeCustomers(items) {
  return writeWorkspaceItems(readAllCustomers, writeAllCustomers, items);
}

function readExpenses() {
  return readWorkspaceItems(readAllExpenses);
}

function writeExpenses(items) {
  return writeWorkspaceItems(readAllExpenses, writeAllExpenses, items);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
};

const staticFileAllowlist = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "favicon.ico"
]);

const loginPage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>PressureFlow Login</title>
    <style>
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #f7f8fb;
        color: #202124;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: min(420px, calc(100vw - 32px));
        padding: 28px;
        border: 1px solid #d8dee8;
        border-radius: 8px;
        background: white;
        box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08);
      }
      h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
      p { margin: 0 0 20px; color: #667085; line-height: 1.45; }
      label { display: grid; gap: 6px; margin-bottom: 12px; color: #667085; font-size: 13px; font-weight: 700; }
      input { min-height: 42px; padding: 0 10px; border: 1px solid #d8dee8; border-radius: 8px; font: inherit; }
      button { width: 100%; min-height: 42px; border: 0; border-radius: 8px; background: #1c7c54; color: white; font: inherit; font-weight: 800; cursor: pointer; }
      .error { color: #b42318; min-height: 20px; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    <main>
      <h1>PressureFlow</h1>
      <p>Sign in to manage your pressure washing jobs.</p>
      <form method="post" action="/auth/login">
        <label>
          Email
          <input name="email" type="email" autocomplete="username" required>
        </label>
        <label>
          Password
          <input name="password" type="password" autocomplete="current-password" required>
        </label>
        <div class="error">%ERROR%</div>
        <button type="submit">Sign In</button>
      </form>
    </main>
  </body>
</html>`;

async function readRequestBody(request) {
  const raw = await readRawRequestBody(request);
  if (!raw) {
    return {};
  }

  return parseJsonRequestText(raw);
}

async function readRawRequestBody(request, maxBytes = MAX_REQUEST_BODY_BYTES) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw httpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseJsonRequestText(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw httpError(400, "Invalid JSON request body.");
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function sanitizeDownloadFileName(fileName) {
  return String(fileName || "template.docx").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "template.docx";
}

async function findPublicEstimate(jobId, token) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
    return null;
  }
  return job;
}

async function approvePublicEstimate(jobId, token) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
    return null;
  }

  const settings = await readSettingsForJob(job);
  job.status = "Contract Sent";
  job.estimateApprovedAt = new Date().toISOString();
  job.estimateRejectedAt = "";
  job.estimateRejectionReason = "";
  job.estimateRejectionNote = "";
  job.contractApprovalToken = job.contractApprovalToken || crypto.randomBytes(24).toString("hex");
  job.contractApprovalUrl = buildContractApprovalUrl(getBaseUrlFromLink(job.estimateApprovalUrl), job);
  job.contractMailto = buildContractMailto(job, settings);
  await sendContractEmail(job, settings);
  job.contractSentAt = new Date().toISOString();
  job.squareContractId = job.squareContractId || `pressureflow-contract-${Date.now()}`;
  job.squareContractUrl = job.contractApprovalUrl;
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  await sendAdminTextAlertSafe(`PressureFlow: Estimate accepted by ${formatAlertCustomer(job)} for ${formatAlertMoney(job.estimate)}. Contract sent automatically.`);
  return job;
}

async function rejectPublicEstimate(jobId, token, reason, note) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.estimateApprovalToken || job.estimateApprovalToken !== token) {
    return null;
  }

  job.status = "Lead";
  job.estimateRejectedAt = new Date().toISOString();
  job.estimateRejectionReason = normalizeEstimateRejectionReason(reason);
  job.estimateRejectionNote = String(note || "").trim().slice(0, 500);
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  const reasonText = job.estimateRejectionReason ? formatEstimateRejectionReason(job.estimateRejectionReason) : "No reason given";
  await sendAdminTextAlertSafe(`PressureFlow: Estimate rejected by ${formatAlertCustomer(job)}. Reason: ${reasonText}.`);
  return job;
}

function normalizeEstimateRejectionReason(reason) {
  const allowed = new Set([
    "price-too-high",
    "timing-not-right",
    "went-with-another-company",
    "scope-changed",
    "just-researching",
    "other"
  ]);
  const value = String(reason || "").trim();
  return allowed.has(value) ? value : "";
}

function formatEstimateRejectionReason(reason) {
  return {
    "price-too-high": "Price was too high",
    "timing-not-right": "Timing was not right",
    "went-with-another-company": "Went with another company",
    "scope-changed": "Scope changed",
    "just-researching": "Just researching",
    "other": "Other"
  }[reason] || "";
}

async function findPublicContract(jobId, token) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.contractApprovalToken || job.contractApprovalToken !== token) {
    return null;
  }
  return job;
}

async function findPublicCompletionProof(jobId, token) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.completionProofToken || job.completionProofToken !== token) {
    return null;
  }
  return job;
}

async function findPublicInvoice(jobId, invoiceType, token) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  const expectedToken = invoiceType === "deposit" ? job?.squareDepositInvoiceId : job?.squareFinalInvoiceId;
  if (!job || !expectedToken || expectedToken !== token) {
    return null;
  }
  return job;
}

async function signPublicContract(jobId, token, signerName, signedDate) {
  const jobs = await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job || !job.contractApprovalToken || job.contractApprovalToken !== token) {
    return null;
  }

  const settings = await readSettingsForJob(job);
  job.status = "Contract Signed";
  job.contractSignerName = String(signerName || "").trim();
  job.contractSignedAt = new Date().toISOString();
  job.contractSignedDate = String(signedDate || "").trim();
  job.squareContractUrl = buildExecutedContractUrl(getBaseUrlFromLink(job.contractApprovalUrl), job);

  const invoice = await createPressureFlowInvoice(job, settings, "deposit", getBaseUrlFromLink(job.contractApprovalUrl));
  job.status = "Deposit Sent";
  job.squareDepositInvoiceId = invoice.invoiceId;
  job.squareDepositInvoiceUrl = invoice.publicUrl;
  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  await sendAdminTextAlertSafe(`PressureFlow: Contract signed by ${formatAlertCustomer(job)}. Deposit invoice ${getPressureFlowInvoiceNumber(job, "deposit")} sent for ${formatAlertMoney(getDepositCents(job) / 100)}.`);
  return job;
}

function buildEstimateApprovalUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/estimate/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.estimateApprovalToken)}`;
}

function buildContractApprovalUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/contract/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.contractApprovalToken)}`;
}

function buildCompletionProofUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/proof/${encodeURIComponent(job.id)}?token=${encodeURIComponent(job.completionProofToken)}`;
}

function buildInvoiceUrl(baseUrl, job, invoiceType, token) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/invoice/${encodeURIComponent(job.id)}?type=${encodeURIComponent(invoiceType)}&token=${encodeURIComponent(token)}`;
}

function buildExecutedContractUrl(baseUrl, job) {
  const root = String(baseUrl || process.env.APP_BASE_URL || "").replace(/\/$/, "");
  return `${root}/contract/${encodeURIComponent(job.id)}/executed?token=${encodeURIComponent(job.contractApprovalToken)}`;
}

async function sendEstimateEmail(job, settings) {
  await sendGoogleEmail(settings, buildEstimateEmailMessage(job, settings));
}

async function sendContractEmail(job, settings) {
  await sendGoogleEmail(settings, buildContractEmailMessage(job, settings));
}

async function createPressureFlowInvoice(job, settings, invoiceType, baseUrl) {
  const invoiceId = invoiceType === "deposit"
    ? job.squareDepositInvoiceId || `pf-deposit-${crypto.randomBytes(16).toString("hex")}`
    : job.squareFinalInvoiceId || `pf-final-${crypto.randomBytes(16).toString("hex")}`;
  const publicUrl = buildInvoiceUrl(baseUrl, job, invoiceType, invoiceId);

  await sendPressureFlowInvoiceEmail(job, settings, invoiceType, publicUrl);
  return { invoiceId, publicUrl };
}

async function sendPressureFlowInvoiceEmail(job, settings, invoiceType, invoiceUrl) {
  await sendGoogleEmail(settings, buildPressureFlowInvoiceEmailMessage(job, settings, invoiceType, invoiceUrl));
}

async function sendCompletionCertificateEmail(job, settings, baseUrl) {
  await sendGoogleEmail(settings, buildCompletionCertificateEmailMessage(job, settings, baseUrl));
}

async function sendGoogleEmail(settings, message) {
  if (settings.emailSendProvider === "smtp") {
    return sendSmtpEmail(settings, message);
  }

  return sendGmailEmail(settings, message);
}
function getAppBaseUrl(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}`;
}

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
      await resetJobForPricingChange(job);
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

async function readFormOrJsonBody(request) {
  const raw = await readRawRequestBody(request);
  const contentType = request.headers["content-type"] || "";

  if (contentType.includes("application/json")) {
    return parseJsonRequestText(raw);
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

async function recordWebhookEvent(event) {
  const events = await readWebhookEvents();
  events.push({
    ...event,
    receivedAt: new Date().toISOString()
  });
  await writeWebhookEvents(events);
}

async function verifySquareWebhookSignature(request, rawBody) {
  const settings = await getSquareWebhookSettings(rawBody);
  return verifySquareSignature(request, rawBody, settings.squareWebhookSignatureKey, safeCompare);
}

async function getSquareWebhookSettings(rawBody) {
  const invoiceId = parseSquareWebhookInvoiceId(rawBody);
  if (invoiceId) {
    const job = await findJobBySquareInvoiceId(invoiceId);
    if (job) {
      return readSettingsForJob(job);
    }
  }

  return readSettings();
}

async function findJobBySquareInvoiceId(invoiceId, options = {}) {
  if (!invoiceId) {
    return null;
  }

  const jobs = options.jobs || await readAllJobs();
  return jobs.find((item) =>
    item.squareDepositInvoiceId === invoiceId ||
    item.squareFinalInvoiceId === invoiceId
  ) || null;
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

async function handleSquareWebhook(event) {
  const invoice = extractSquareInvoice(event);
  if (!invoice?.id) {
    return { action: "ignored", reason: "no invoice id found" };
  }

  const jobs = await readJobs();
  const job = await findJobBySquareInvoiceId(invoice.id, { jobs });

  if (!job) {
    return { action: "ignored", reason: "invoice not matched", invoiceId: invoice.id };
  }

  const paid = isSquareInvoicePaid(invoice);
  if (!paid) {
    setInvoiceStatus(job, invoice);
    await writeJobs(jobs);
    return { action: "status_recorded", invoiceId: invoice.id, status: invoice.status || "" };
  }

  if (job.squareDepositInvoiceId === invoice.id) {
    job.status = "Deposit Paid";
    job.squareDepositInvoiceStatus = invoice.status || "PAID";
    job.squareDepositPaidAt = new Date().toISOString();
    await sendAdminTextAlertSafe(`PressureFlow: Square deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
  }

  if (job.squareFinalInvoiceId === invoice.id) {
    job.status = "Paid";
    job.squareFinalInvoiceStatus = invoice.status || "PAID";
    job.squareFinalPaidAt = new Date().toISOString();
    await sendCompletionCertificateEmailSafe(job, await readSettingsForJob(job), getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
    await sendAdminTextAlertSafe(`PressureFlow: Square final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
  }

  job.updatedAt = new Date().toISOString();
  await writeJobs(jobs);
  return { action: "job_updated", jobId: job.id, invoiceId: invoice.id, status: job.status };
}

function setInvoiceStatus(job, invoice) {
  if (job.squareDepositInvoiceId === invoice.id) {
    job.squareDepositInvoiceStatus = invoice.status || "";
  }
  if (job.squareFinalInvoiceId === invoice.id) {
    job.squareFinalInvoiceStatus = invoice.status || "";
  }
  job.updatedAt = new Date().toISOString();
}

function updateJob(job, input) {
  const fields = [
    "customerName",
    "customerId",
    "email",
    "phone",
    "address",
    "serviceType",
    "leadSource",
    "notes",
    "accessNotes",
    "sensitiveAreas",
    "squareEstimateId",
    "squareEstimateUrl",
    "squareContractId",
    "squareContractUrl"
  ];

  fields.forEach((field) => {
    if (Object.hasOwn(input, field)) {
      job[field] = String(input[field] || "").trim();
    }
  });

  if (["streetAddress", "addressUnit", "city", "state", "zip"].some((field) => Object.hasOwn(input, field))) {
    job.state = String(job.state || "").trim().toUpperCase();
    job.address = String(input.address || buildFullAddress(job) || job.address || "").trim();
  }

  if (Object.hasOwn(input, "estimate")) {
    job.estimate = Number(input.estimate);
  }

  if (Object.hasOwn(input, "lineItems")) {
    job.lineItems = normalizeLineItems(input.lineItems);
  }

  if (Object.hasOwn(input, "measurement")) {
    job.measurement = normalizeMeasurement(input.measurement);
  }

  if (Object.hasOwn(input, "jobPhotos")) {
    job.jobPhotos = normalizeJobPhotos(input.jobPhotos);
  }

  if (Object.hasOwn(input, "discountPercent")) {
    job.discountPercent = Number(input.discountPercent);
  }

  if (Object.hasOwn(input, "depositPercent")) {
    job.depositPercent = Number(input.depositPercent);
  }
}

async function findSavedMeasurements(address) {
  const target = normalizeAddressKey(address);
  if (!target) {
    return [];
  }

  const seen = new Set();
  const customerMeasurements = (await readCustomers())
    .filter((customer) => normalizeAddressKey(customer.address) === target)
    .flatMap((customer) => (customer.propertyMeasurements || []).flatMap((item) =>
      expandSavedMeasurementAreas({
        id: item.id,
        customerId: customer.id,
        customerName: customer.customerName,
        label: item.label || "",
        address: item.address || customer.address,
        updatedAt: item.updatedAt || customer.updatedAt || "",
        measurement: item.measurement || item
      })
    ));

  const jobMeasurements = (await readJobs())
    .filter((job) => normalizeAddressKey(job.address) === target && job.measurement?.geojson && job.measurement?.squareFeet)
    .flatMap((job) => expandSavedMeasurementAreas({
      jobId: job.id,
      customerName: job.customerName,
      label: `${job.serviceType || "Service"} measurement`,
      address: job.address,
      updatedAt: job.updatedAt || job.createdAt || "",
      measurement: job.measurement
    }));

  return [...customerMeasurements, ...jobMeasurements]
    .filter((item) => {
      const key = JSON.stringify(item.measurement.geojson);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 24);
}

function expandSavedMeasurementAreas(item) {
  const measurement = normalizeMeasurement(item.measurement);
  const areas = Array.isArray(measurement.areas) && measurement.areas.length
    ? measurement.areas
    : measurement.geojson && measurement.squareFeet
      ? [{
        id: crypto.randomUUID(),
        name: item.label || "Saved measurement",
        squareFeet: measurement.squareFeet,
        perimeterFeet: measurement.perimeterFeet,
        geojson: measurement.geojson,
        capturedAt: measurement.capturedAt
      }]
      : [];

  return areas.map((area) => ({
    ...item,
    label: area.name || item.label || "Saved measurement",
    measurement: {
      address: measurement.address || item.address || "",
      squareFeet: Number(area.squareFeet || 0),
      perimeterFeet: Number(area.perimeterFeet || 0),
      geojson: area.geojson,
      areas: [{
        id: String(area.id || crypto.randomUUID()),
        name: area.name || item.label || "Saved measurement",
        squareFeet: Number(area.squareFeet || 0),
        perimeterFeet: Number(area.perimeterFeet || 0),
        geojson: area.geojson,
        capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
      }],
      center: measurement.center || [],
      zoom: measurement.zoom || 18,
      staticImageUrl: measurement.staticImageUrl || "",
      capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
    }
  }));
}

async function syncJobMeasurementToCustomerFile(job) {
  if (!job.measurement?.geojson || !job.measurement?.squareFeet) {
    return;
  }

  const customers = await readCustomers();
  let customer = customers.find((item) =>
    item.id === job.customerId ||
    (job.email && item.email === job.email) ||
    (normalizeAddressKey(item.address) && normalizeAddressKey(item.address) === normalizeAddressKey(job.address))
  );

  if (!customer) {
    customer = normalizeCustomer({
      customerName: job.customerName,
      email: job.email,
      phone: job.phone,
      address: job.address,
      leadSource: job.leadSource,
      notes: `Created from measured job on ${new Date().toLocaleDateString("en-US")}.`,
      serviceAreaPhotos: [],
      propertyMeasurements: []
    });
    customers.unshift(customer);
    job.customerId = customer.id;
  }

  const propertyMeasurements = normalizePropertyMeasurements(customer.propertyMeasurements || []);
  const savedMeasurements = buildPerAreaPropertyMeasurements(job);
  const savedKeys = new Set(savedMeasurements.map((item) => JSON.stringify(item.measurement?.geojson)));
  const retainedMeasurements = propertyMeasurements.filter((item) => !savedKeys.has(JSON.stringify(item.measurement?.geojson)));

  customer.propertyMeasurements = [...savedMeasurements, ...retainedMeasurements].slice(0, 24);
  customer.updatedAt = new Date().toISOString();
  await writeCustomers(customers);
}

function buildPerAreaPropertyMeasurements(job) {
  const measurement = normalizeMeasurement(job.measurement);
  const areas = Array.isArray(measurement.areas) && measurement.areas.length
    ? measurement.areas
    : measurement.geojson && measurement.squareFeet
      ? [{
        id: crypto.randomUUID(),
        name: `${job.serviceType || "Service area"} measurement`,
        squareFeet: measurement.squareFeet,
        perimeterFeet: measurement.perimeterFeet,
        geojson: measurement.geojson,
        capturedAt: measurement.capturedAt
      }]
      : [];

  return areas.map((area) => ({
    id: crypto.randomUUID(),
    label: area.name || "Service area",
    address: measurement.address || job.address,
    sourceJobId: job.id,
    updatedAt: new Date().toISOString(),
    measurement: {
      address: measurement.address || job.address,
      squareFeet: Number(area.squareFeet || 0),
      perimeterFeet: Number(area.perimeterFeet || 0),
      geojson: area.geojson,
      areas: [{
        id: String(area.id || crypto.randomUUID()),
        name: area.name || "Service area",
        squareFeet: Number(area.squareFeet || 0),
        perimeterFeet: Number(area.perimeterFeet || 0),
        geojson: area.geojson,
        capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
      }],
      center: measurement.center || [],
      zoom: measurement.zoom || 18,
      staticImageUrl: "",
      capturedAt: area.capturedAt || measurement.capturedAt || new Date().toISOString()
    }
  })).filter((item) => item.measurement.geojson && item.measurement.squareFeet > 0);
}

function normalizeAddressKey(address) {
  return String(address || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deleteCustomerMeasurementArea(customer, measurementId, areaKey) {
  const propertyMeasurements = normalizePropertyMeasurements(customer.propertyMeasurements || []);
  let removed = false;
  const nextMeasurements = [];

  propertyMeasurements.forEach((item) => {
    if (item.id !== measurementId) {
      nextMeasurements.push(item);
      return;
    }

    const measurement = normalizeMeasurement(item.measurement);
    const areas = Array.isArray(measurement.areas) ? measurement.areas : [];
    if (!areaKey) {
      removed = true;
      return;
    }

    const remainingAreas = areas.filter((area) => JSON.stringify(area.geojson || {}) !== areaKey);
    if (remainingAreas.length === areas.length) {
      nextMeasurements.push(item);
      return;
    }

    removed = true;
    if (!remainingAreas.length) {
      return;
    }

    const updatedMeasurement = normalizeMeasurement({
      ...measurement,
      areas: remainingAreas,
      staticImageUrl: ""
    });
    nextMeasurements.push({
      ...item,
      label: remainingAreas.map((area) => area.name).filter(Boolean).join(" + ") || item.label,
      updatedAt: new Date().toISOString(),
      measurement: updatedMeasurement
    });
  });

  customer.propertyMeasurements = nextMeasurements;
  return removed;
}

function didPricingChange(job, input) {
  if (Object.hasOwn(input, "estimate") && Number(input.estimate) !== Number(job.estimate || 0)) {
    return true;
  }
  if (Object.hasOwn(input, "discountPercent") && Number(input.discountPercent) !== Number(job.discountPercent || 0)) {
    return true;
  }
  if (Object.hasOwn(input, "depositPercent") && Number(input.depositPercent) !== Number(job.depositPercent || 0)) {
    return true;
  }
  if (Object.hasOwn(input, "lineItems")) {
    return JSON.stringify(normalizeComparableLineItems(normalizeLineItems(input.lineItems))) !==
      JSON.stringify(normalizeComparableLineItems(job.lineItems || []));
  }
  return false;
}

function normalizeComparableLineItems(items) {
  return items.map((item) => ({
    name: String(item.name || ""),
    unit: String(item.unit || ""),
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    total: Number(item.total || 0)
  }));
}

async function resetJobForPricingChange(job) {
  if (statuses.indexOf(job.status) < statuses.indexOf("Estimate Sent")) {
    return;
  }

  await cancelStoredInvoiceIfPossible(job, "deposit");
  await cancelStoredInvoiceIfPossible(job, "final");

  job.status = "Lead";
  job.estimateApprovalToken = "";
  job.estimateApprovalUrl = "";
  job.estimateMailto = "";
  job.estimateSentAt = "";
  job.estimateApprovedAt = "";
  job.estimateRejectedAt = "";
  job.estimateRejectionReason = "";
  job.estimateRejectionNote = "";
  job.squareEstimateId = "";
  job.squareEstimateUrl = "";
  job.contractApprovalToken = "";
  job.contractApprovalUrl = "";
  job.contractMailto = "";
  job.contractSentAt = "";
  job.contractSignedAt = "";
  job.contractSignerName = "";
  job.squareContractId = "";
  job.squareContractUrl = "";
  job.squareDepositOrderId = "";
  job.squareDepositInvoiceId = "";
  job.squareDepositInvoiceUrl = "";
  job.squareDepositInvoiceStatus = "";
  job.squareDepositPaidAt = "";
  job.squareFinalOrderId = "";
  job.squareFinalInvoiceId = "";
  job.squareFinalInvoiceUrl = "";
  job.squareFinalInvoiceStatus = "";
  job.squareFinalPaidAt = "";
}

async function cancelStoredInvoiceIfPossible(job, invoiceType) {
  const invoiceId = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
  const status = invoiceType === "deposit" ? job.squareDepositInvoiceStatus : job.squareFinalInvoiceStatus;
  if (!invoiceId || status === "PAID") {
    return;
  }

  try {
    const settings = await readSettingsForJob(job);
    const invoice = await getSquareInvoice(settings, invoiceId);
    if (!isSquareInvoicePaid(invoice) && invoice.status !== "CANCELED") {
      await cancelSquareInvoice(settings, invoice.id, invoice.version);
    }
  } catch (error) {
    console.warn(`Unable to cancel ${invoiceType} invoice ${invoiceId}: ${error.message}`);
  }
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

async function applyAction(job, action, input) {
  if (action === "advance") {
    job.status = getNextStatus(job.status);
  }

  if (action === "schedule") {
    const settings = await readSettings();
    const scheduledAt = input.scheduledAt || "";
    const duration = normalizeNumber(
      input.jobDurationMinutes,
      settings.defaultJobDurationMinutes,
      30,
      720
    );
    const calendarEvent = await createGoogleCalendarEvent(settings, job, scheduledAt, duration);
    job.status = "Scheduled";
    job.scheduledAt = scheduledAt;
    job.scheduledEventAt = new Date().toISOString();
    job.jobDurationMinutes = duration;
    job.googleCalendarEventId = calendarEvent.id;
    job.googleCalendarEventUrl = calendarEvent.htmlLink || "";
    await sendScheduleConfirmationEmail(job, settings, input._baseUrl);
    await sendAdminTextAlertSafe(`PressureFlow: Job scheduled for ${formatAlertCustomer(job)}. ${formatScheduledWindow(job)}.`);
  }

  if (action === "send-square-estimate") {
    const settings = await readSettings();
    job.status = "Estimate Sent";
    job.estimateApprovalToken = job.estimateApprovalToken || crypto.randomBytes(24).toString("hex");
    job.estimateApprovalUrl = buildEstimateApprovalUrl(input._baseUrl, job);
    job.estimateMailto = buildEstimateMailto(job, settings);
    await sendEstimateEmail(job, settings);
    job.estimateSentAt = new Date().toISOString();
    job.estimateRejectedAt = "";
    job.estimateRejectionReason = "";
    job.estimateRejectionNote = "";
    job.squareEstimateId = job.squareEstimateId || `pressureflow-estimate-${Date.now()}`;
    job.squareEstimateUrl = job.estimateApprovalUrl;
  }

  if (action === "mark-estimate-signed") {
    job.status = "Estimate Signed";
  }

  if (action === "send-contract") {
    const settings = await readSettings();
    job.status = "Contract Sent";
    job.contractApprovalToken = job.contractApprovalToken || crypto.randomBytes(24).toString("hex");
    job.contractApprovalUrl = buildContractApprovalUrl(input._baseUrl, job);
    job.contractMailto = buildContractMailto(job, settings);
    await sendContractEmail(job, settings);
    job.contractSentAt = new Date().toISOString();
    job.squareContractId = job.squareContractId || `pressureflow-contract-${Date.now()}`;
    job.squareContractUrl = job.contractApprovalUrl;
  }

  if (action === "mark-contract-signed") {
    job.status = "Contract Signed";
  }

  if (action === "send-deposit-invoice") {
    const settings = await readSettings();
    const invoice = await createPressureFlowInvoice(job, settings, "deposit", input._baseUrl);
    job.status = "Deposit Sent";
    job.squareDepositInvoiceId = invoice.invoiceId;
    job.squareDepositInvoiceUrl = invoice.publicUrl;
  }

  if (action === "mark-deposit-paid") {
    job.status = "Deposit Paid";
    job.squareDepositInvoiceStatus = "PAID";
    job.squareDepositPaidAt = job.squareDepositPaidAt || new Date().toISOString();
    await sendAdminTextAlertSafe(`PressureFlow: Deposit marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
  }

  if (action === "check-deposit-payment") {
    job.status = "Deposit Paid";
    job.squareDepositInvoiceStatus = "PAID";
    job.squareDepositPaidAt = new Date().toISOString();
    await sendAdminTextAlertSafe(`PressureFlow: Deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
  }

  if (action === "complete") {
    const settings = await readSettings();
    if (Object.hasOwn(input, "jobPhotos")) {
      job.jobPhotos = normalizeJobPhotos(input.jobPhotos);
    }
    job.completionProofToken = job.completionProofToken || crypto.randomBytes(24).toString("hex");
    job.completionProofUrl = buildCompletionProofUrl(input._baseUrl, job);
    const notice = buildCompletionNotice(job, settings);
    const invoice = job.squareFinalInvoiceId
      ? { invoiceId: job.squareFinalInvoiceId, publicUrl: job.squareFinalInvoiceUrl }
      : await createPressureFlowInvoice(job, settings, "final", input._baseUrl);
    job.status = "Final Invoice Sent";
    job.completionNoticeSentAt = new Date().toISOString();
    job.completionNoticeSubject = notice.subject;
    job.completionNoticeBody = notice.body;
    job.completionNoticeMailto = notice.mailto;
    job.squareFinalInvoiceId = invoice.invoiceId;
    job.squareFinalInvoiceUrl = invoice.publicUrl;
  }

  if (action === "send-final-invoice") {
    const settings = await readSettings();
    const invoice = await createPressureFlowInvoice(job, settings, "final", input._baseUrl);
    job.status = "Final Invoice Sent";
    job.squareFinalInvoiceId = invoice.invoiceId;
    job.squareFinalInvoiceUrl = invoice.publicUrl;
  }

  if (action === "mark-paid") {
    const settings = await readSettings();
    job.status = "Paid";
    job.squareFinalInvoiceStatus = "PAID";
    job.squareFinalPaidAt = new Date().toISOString();
    await sendCompletionCertificateEmailSafe(job, settings, input._baseUrl);
    await sendAdminTextAlertSafe(`PressureFlow: Final invoice marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
  }

  if (action === "check-final-payment") {
    const settings = await readSettings();
    job.status = "Paid";
    job.squareFinalInvoiceStatus = "PAID";
    job.squareFinalPaidAt = new Date().toISOString();
    await sendCompletionCertificateEmailSafe(job, settings, input._baseUrl);
    await sendAdminTextAlertSafe(`PressureFlow: Final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
  }
}

async function sendCompletionCertificateEmailSafe(job, settings, baseUrl) {
  try {
    await sendCompletionCertificateEmail(job, settings, baseUrl || getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
  } catch (error) {
    console.warn(`Unable to send completion certificate for job ${job.id}: ${error.message}`);
  }
}

async function sendScheduleConfirmationEmail(job, settings, baseUrl) {
  const scheduleText = formatScheduledWindow(job);
  const instructions = getDayOfServiceInstructions();
  await sendGoogleEmail(settings, buildScheduleConfirmationEmailMessage(
    job,
    settings,
    baseUrl,
    buildScheduleInviteAttachment(job, settings),
    scheduleText,
    instructions
  ));
}

async function createStripeCheckoutSession(job, settings, invoiceType, baseUrl) {
  const amount = invoiceType === "deposit" ? getDepositCents(job) : getFinalBalanceCents(job);
  const invoiceToken = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
  const invoiceUrl = buildInvoiceUrl(baseUrl, job, invoiceType, invoiceToken);
  return createStripeCheckoutSessionRequest({
    settings,
    job,
    invoiceType,
    amount,
    invoiceUrl,
    accountId: itemWorkspaceId(job)
  });
}

async function verifyStripeWebhookSignature(request, rawBody) {
  const secret = await getStripeWebhookSecret(rawBody);
  return verifyStripeSignature(request.headers["stripe-signature"], rawBody, secret, safeCompare);
}

async function getStripeWebhookSecret(rawBody) {
  const metadata = parseStripeWebhookMetadata(rawBody);
  if (metadata.jobId) {
    const jobs = metadata.accountId
      ? await readAllJobs({ accountId: metadata.accountId })
      : await readAllJobs();
    const job = jobs.find((item) => item.id === metadata.jobId);
    if (job) {
      const settings = await readSettingsForJob(job);
      if (settings.stripeWebhookSecret) {
        return settings.stripeWebhookSecret;
      }
    }
  }

  return process.env.STRIPE_WEBHOOK_SECRET || "";
}

async function handleStripeWebhook(event) {
  if (event.type !== "checkout.session.completed") {
    return { action: "ignored", type: event.type || "" };
  }

  const session = event.data?.object || {};
  if (session.payment_status && session.payment_status !== "paid") {
    return { action: "ignored", reason: "checkout not paid" };
  }

  const jobId = session.metadata?.jobId || "";
  const accountId = String(session.metadata?.accountId || "");
  const invoiceType = session.metadata?.invoiceType === "deposit" ? "deposit" : "final";
  const jobs = accountId && process.env.DATABASE_URL
    ? await readAllJobs({ accountId })
    : await readJobs();
  const job = jobs.find((item) => item.id === jobId);
  if (!job) {
    return { action: "ignored", reason: "job not found", jobId };
  }

  if (invoiceType === "deposit") {
    job.status = "Deposit Paid";
    job.squareDepositInvoiceStatus = "PAID";
    job.squareDepositPaidAt = new Date().toISOString();
    await sendAdminTextAlertSafe(`PressureFlow: Card deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
  } else {
    job.status = "Paid";
    job.squareFinalInvoiceStatus = "PAID";
    job.squareFinalPaidAt = new Date().toISOString();
    await sendCompletionCertificateEmailSafe(job, await readSettingsForJob(job), getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
    await sendAdminTextAlertSafe(`PressureFlow: Card final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
  }

  job.updatedAt = new Date().toISOString();
  if (accountId && process.env.DATABASE_URL) {
    await writeAllJobs(jobs, { accountId });
  } else {
    await writeJobs(jobs);
  }
  return { action: "job_updated", jobId: job.id, invoiceType, status: job.status };
}

function isSquareInvoicePaid(invoice) {
  if (invoice.status === "PAID") {
    return true;
  }

  const requests = invoice.payment_requests || [];
  return requests.length > 0 && requests.every((request) => {
    const total = request.computed_amount_money?.amount || 0;
    const completed = request.total_completed_amount_money?.amount || 0;
    return total > 0 && completed >= total;
  });
}

function getStaticFilePath(pathname) {
  let requestedPath;

  try {
    requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const normalizedPath = path.normalize(requestedPath);
  const isAllowedRootFile = staticFileAllowlist.has(normalizedPath);
  const isAllowedAsset = normalizedPath.startsWith(`assets${path.sep}`) && !normalizedPath.includes(`..${path.sep}`);

  if (!isAllowedRootFile && !isAllowedAsset) {
    return null;
  }

  const filePath = path.resolve(ROOT, normalizedPath);
  const rootPath = path.resolve(ROOT);

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    return null;
  }

  return filePath;
}

async function serveStatic(response, url) {
  const filePath = getStaticFilePath(url.pathname);

  if (!filePath) {
    sendError(response, 404, "File not found.");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    sendError(response, 404, "File not found.");
  }
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

      await serveStatic(response, url);
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
