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
  readUsers,
  writeUsers,
  readSettings: readGlobalSettings,
  writeSettings: writeGlobalSettings,
  readUserSettings,
  writeUserSettings,
  readWebhookEvents,
  writeWebhookEvents
} = require("./db");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const SQUARE_VERSION = "2026-05-20";
const SESSION_COOKIE = "pressureflow_session";
const serviceAgreementTemplate = require("./templates/pressure-washing-service-agreement.json");
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const requestContext = new AsyncLocalStorage();

function readSettings() {
  return readUserSettings(requestContext.getStore()?.session?.userId || "");
}

function writeSettings(settings) {
  return writeUserSettings(requestContext.getStore()?.session?.userId || "", settings);
}

function readSettingsForJob(job) {
  return readUserSettings(itemWorkspaceId(job) === "owner" ? "env-admin" : itemWorkspaceId(job));
}

function getWorkspaceId() {
  const context = requestContext.getStore();
  if (context?.authDisabled || context?.session?.userId === "env-admin") {
    return "owner";
  }
  return context?.session?.userId || "";
}

function itemWorkspaceId(item) {
  return item.accountId || "owner";
}

async function readWorkspaceItems(readAll) {
  const items = await readAll();
  const workspaceId = getWorkspaceId();
  return workspaceId ? items.filter((item) => itemWorkspaceId(item) === workspaceId) : items;
}

async function writeWorkspaceItems(readAll, writeAll, items) {
  const workspaceId = getWorkspaceId();
  if (!workspaceId) {
    return writeAll(items);
  }

  const allItems = await readAll();
  const otherWorkspaceItems = allItems.filter((item) => itemWorkspaceId(item) !== workspaceId);
  const scopedItems = items.map((item) => ({ ...item, accountId: workspaceId }));
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

function publicSettings(settings) {
  const {
    squareAccessToken,
    squareWebhookSignatureKey,
    googleClientSecret,
    googleRefreshToken,
    customTemplates,
    ...publicValues
  } = settings;
  return {
    ...publicValues,
    customTemplates: getTemplateMetadata(customTemplates || []),
    hasSquareAccessToken: Boolean(squareAccessToken),
    hasSquareWebhookSignatureKey: Boolean(squareWebhookSignatureKey),
    hasGoogleClientSecret: Boolean(googleClientSecret),
    hasGoogleRefreshToken: Boolean(googleRefreshToken)
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readRawRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
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

function getTemplateMetadata(templates = []) {
  return templates.map(({ dataUrl, ...template }) => template);
}

function normalizeCustomTemplates(value) {
  const templates = Array.isArray(value) ? value : [];
  return templates
    .map((template) => ({
      id: String(template.id || crypto.randomUUID()),
      name: String(template.name || template.fileName || "Uploaded template").trim(),
      description: String(template.description || "").trim(),
      fileName: String(template.fileName || "template.docx").trim(),
      mimeType: normalizeTemplateMimeType(template.mimeType, template.fileName),
      dataUrl: String(template.dataUrl || "").trim(),
      uploadedAt: String(template.uploadedAt || new Date().toISOString())
    }))
    .filter((template) => template.dataUrl.startsWith("data:") && template.name);
}

function normalizeTemplateMimeType(mimeType, fileName = "") {
  const lowerName = String(fileName || "").toLowerCase();
  if (mimeType === "application/msword" || lowerName.endsWith(".doc")) {
    return "application/msword";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function sanitizeDownloadFileName(fileName) {
  return String(fileName || "template.docx").replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 120) || "template.docx";
}

function getNextStatus(status) {
  const currentIndex = statuses.indexOf(status);
  if (currentIndex === -1 || currentIndex === statuses.length - 1) {
    return status;
  }

  return statuses[currentIndex + 1];
}

function normalizeJob(input) {
  const addressParts = normalizeAddressParts(input);
  return {
    id: crypto.randomUUID(),
    customerId: String(input.customerId || "").trim(),
    customerName: String(input.customerName || "").trim(),
    email: String(input.email || "").trim(),
    phone: String(input.phone || "").trim(),
    ...addressParts,
    address: String(input.address || buildFullAddress(addressParts)).trim(),
    serviceType: String(input.serviceType || "Driveway cleaning").trim(),
    leadSource: normalizeLeadSource(input.leadSource),
    estimate: Number(input.estimate || 0),
    lineItems: normalizeLineItems(input.lineItems),
    measurement: normalizeMeasurement(input.measurement),
    jobPhotos: normalizeJobPhotos(input.jobPhotos),
    discountPercent: Number(input.discountPercent || 0),
    depositPercent: Number(input.depositPercent ?? defaultSettings.defaultDepositPercent),
    notes: String(input.notes || "").trim(),
    accessNotes: String(input.accessNotes || "").trim(),
    sensitiveAreas: String(input.sensitiveAreas || "").trim(),
    status: "Lead",
    scheduledAt: "",
    scheduledEventAt: "",
    jobDurationMinutes: defaultSettings.defaultJobDurationMinutes,
    googleCalendarEventId: "",
    googleCalendarEventUrl: "",
    squareEstimateId: String(input.squareEstimateId || "").trim(),
    squareEstimateUrl: String(input.squareEstimateUrl || "").trim(),
    estimateApprovalToken: "",
    estimateApprovalUrl: "",
    estimateMailto: "",
    estimateSentAt: "",
    estimateApprovedAt: "",
    estimateRejectedAt: "",
    estimateRejectionReason: "",
    estimateRejectionNote: "",
    squareCustomerId: "",
    squareDepositOrderId: "",
    squareDepositInvoiceId: "",
    squareDepositInvoiceUrl: "",
    squareFinalOrderId: "",
    squareFinalInvoiceId: "",
    squareFinalInvoiceUrl: "",
    squareContractId: "",
    squareContractUrl: "",
    contractApprovalToken: "",
    contractApprovalUrl: "",
    contractMailto: "",
    contractSentAt: "",
    contractSignedAt: "",
    contractSignedDate: "",
    contractSignerName: "",
    completionProofToken: "",
    completionProofUrl: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeCustomer(input, existing = {}) {
  const addressParts = normalizeAddressParts(input, existing);
  return {
    id: existing.id || input.id || crypto.randomUUID(),
    customerName: String(input.customerName || existing.customerName || "").trim(),
    email: String(input.email || existing.email || "").trim(),
    phone: String(input.phone || existing.phone || "").trim(),
    ...addressParts,
    address: String(input.address || buildFullAddress(addressParts) || existing.address || "").trim(),
    leadSource: normalizeLeadSource(input.leadSource || existing.leadSource),
    notes: String(input.notes || existing.notes || "").trim(),
    serviceAreaPhotos: normalizePhotos(input.serviceAreaPhotos ?? existing.serviceAreaPhotos),
    propertyMeasurements: normalizePropertyMeasurements(input.propertyMeasurements ?? existing.propertyMeasurements),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeAddressParts(input = {}, existing = {}) {
  return {
    streetAddress: String(input.streetAddress ?? existing.streetAddress ?? "").trim(),
    addressUnit: String(input.addressUnit ?? existing.addressUnit ?? "").trim(),
    city: String(input.city ?? existing.city ?? "").trim(),
    state: String(input.state ?? existing.state ?? "").trim().toUpperCase(),
    zip: String(input.zip ?? existing.zip ?? "").trim()
  };
}

function buildFullAddress(parts = {}) {
  const streetLine = [parts.streetAddress, parts.addressUnit].filter(Boolean).join(" ");
  const cityLine = [parts.city, [parts.state, parts.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [streetLine, cityLine].filter(Boolean).join(", ");
}

function normalizePropertyMeasurements(value) {
  let measurements = [];
  try {
    measurements = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? JSON.parse(value)
        : [];
  } catch {
    measurements = [];
  }

  return measurements
    .map((item) => {
      const measurement = normalizeMeasurement(item.measurement || item);
      if (!measurement.geojson || !measurement.squareFeet) {
        return null;
      }

      return {
        id: String(item.id || crypto.randomUUID()),
        label: String(item.label || "Service area").trim(),
        address: String(item.address || measurement.address || "").trim(),
        sourceJobId: String(item.sourceJobId || "").trim(),
        updatedAt: String(item.updatedAt || item.capturedAt || measurement.capturedAt || new Date().toISOString()),
        measurement
      };
    })
    .filter(Boolean);
}

function normalizeExpense(input, existing = {}) {
  return {
    id: existing.id || input.id || crypto.randomUUID(),
    vendor: String(input.vendor || existing.vendor || "").trim(),
    category: String(input.category || existing.category || "").trim(),
    amount: Number(input.amount ?? existing.amount ?? 0),
    expenseDate: String(input.expenseDate || existing.expenseDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
    notes: String(input.notes || existing.notes || "").trim(),
    receiptPhotos: normalizePhotos(input.receiptPhotos ?? existing.receiptPhotos),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function validateExpense(expense) {
  if (!expense.vendor) return "Vendor is required.";
  if (!Number.isFinite(expense.amount) || expense.amount < 0) return "Expense amount must be 0 or greater.";
  return "";
}

function normalizeLeadSource(value) {
  const allowed = new Set(["referral", "door-hanger", "door-to-door", "meta-ad", "nextdoor-ad"]);
  const normalized = String(value || "referral").trim();
  return allowed.has(normalized) ? normalized : "referral";
}

function validateCustomer(customer) {
  if (!customer.customerName) return "Customer name is required.";
  if (!customer.email && !customer.phone) return "Email or phone is required.";
  return "";
}

function validateJob(job) {
  if (!job.customerName) return "Customer name is required.";
  if (!job.email) return "Email is required.";
  if (!job.phone) return "Phone is required.";
  if (!job.streetAddress) return "Street address is required.";
  if (!job.city) return "City is required.";
  if (!job.state) return "State is required.";
  if (!job.zip) return "ZIP is required.";
  if (!job.address) return "Service address is required.";
  if (!Number.isFinite(job.estimate) || job.estimate < 0) return "Estimate must be 0 or greater.";
  if (!Number.isFinite(job.discountPercent) || job.discountPercent < 0 || job.discountPercent > 100) {
    return "Discount percent must be between 0 and 100.";
  }
  if (!Number.isFinite(job.depositPercent) || job.depositPercent < 0 || job.depositPercent > 100) {
    return "Deposit percent must be between 0 and 100.";
  }
  return "";
}

function jobsToCsv(jobs) {
  const columns = [
    "id",
    "customerName",
    "email",
    "phone",
    "address",
    "streetAddress",
    "addressUnit",
    "city",
    "state",
    "zip",
    "serviceType",
    "estimate",
    "lineItems",
    "discountPercent",
    "depositPercent",
    "status",
    "scheduledAt",
    "jobDurationMinutes",
    "squareEstimateId",
    "squareEstimateUrl",
    "estimateApprovalUrl",
    "estimateSentAt",
    "estimateApprovedAt",
    "squareContractId",
    "squareContractUrl",
    "squareDepositInvoiceId",
    "squareDepositInvoiceUrl",
    "squareFinalInvoiceId",
    "squareFinalInvoiceUrl",
    "googleCalendarEventId",
    "googleCalendarEventUrl",
    "notes",
    "accessNotes",
    "sensitiveAreas",
    "createdAt",
    "updatedAt"
  ];
  const rows = jobs.map((job) => columns.map((column) => csvEscape(job[column] ?? "")).join(","));
  return `${columns.join(",")}\n${rows.join("\n")}\n`;
}

function normalizeLineItems(value) {
  let items = [];
  try {
    items = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? JSON.parse(value)
        : [];
  } catch {
    items = [];
  }

  return items.map((item) => ({
    name: String(item.name || "").trim(),
    unit: String(item.unit || "").trim(),
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    total: Number(item.total || 0)
  })).filter((item) => item.name && item.quantity > 0);
}

function normalizeMeasurement(value) {
  let measurement = {};
  try {
    measurement = typeof value === "string" && value ? JSON.parse(value) : value || {};
  } catch {
    measurement = {};
  }

  if (!measurement || typeof measurement !== "object") {
    return {};
  }

  const areas = Array.isArray(measurement.areas)
    ? measurement.areas
      .map((area, index) => ({
        id: String(area.id || crypto.randomUUID()),
        name: String(area.name || area.label || `Service area ${index + 1}`).trim(),
        squareFeet: Number(area.squareFeet || 0),
        perimeterFeet: Number(area.perimeterFeet || 0),
        geojson: area.geojson,
        capturedAt: String(area.capturedAt || measurement.capturedAt || new Date().toISOString())
      }))
      .filter((area) => area.geojson && area.squareFeet > 0)
    : [];
  const normalizedAreas = areas.length
    ? areas
    : measurement.geojson && measurement.squareFeet
      ? [{
        id: crypto.randomUUID(),
        name: "Service area 1",
        squareFeet: Number(measurement.squareFeet || 0),
        perimeterFeet: Number(measurement.perimeterFeet || 0),
        geojson: measurement.geojson,
        capturedAt: String(measurement.capturedAt || new Date().toISOString())
      }]
      : [];
  if (!normalizedAreas.length && !measurement.geojson) {
    return {};
  }
  const squareFeet = normalizedAreas.length
    ? normalizedAreas.reduce((sum, area) => sum + Number(area.squareFeet || 0), 0)
    : Number(measurement.squareFeet || 0);
  const perimeterFeet = normalizedAreas.length
    ? normalizedAreas.reduce((sum, area) => sum + Number(area.perimeterFeet || 0), 0)
    : Number(measurement.perimeterFeet || 0);
  const geojson = normalizedAreas.length
    ? { type: "FeatureCollection", features: normalizedAreas.map((area) => area.geojson).filter(Boolean) }
    : measurement.geojson;

  return {
    address: String(measurement.address || "").trim(),
    squareFeet,
    perimeterFeet,
    geojson,
    areas: normalizedAreas,
    center: Array.isArray(measurement.center) ? measurement.center.map(Number).slice(0, 2) : [],
    zoom: Number(measurement.zoom || 18),
    staticImageUrl: String(measurement.staticImageUrl || "").trim(),
    capturedAt: String(measurement.capturedAt || new Date().toISOString())
  };
}

function normalizeJobPhotos(value) {
  let photos = {};
  try {
    photos = typeof value === "string" && value ? JSON.parse(value) : value || {};
  } catch {
    photos = {};
  }

  return {
    before: normalizePhotos(photos.before),
    after: normalizePhotos(photos.after)
  };
}

function normalizePhotos(value) {
  let photos = [];
  try {
    photos = Array.isArray(value)
      ? value
      : typeof value === "string" && value
        ? JSON.parse(value)
        : [];
  } catch {
    photos = [];
  }

  return photos.map((photo) => ({
    id: String(photo.id || crypto.randomUUID()),
    name: String(photo.name || "Photo").trim(),
    section: String(photo.section || "").trim(),
    dataUrl: String(photo.dataUrl || "").trim(),
    capturedAt: String(photo.capturedAt || new Date().toISOString())
  })).filter((photo) => photo.dataUrl.startsWith("data:image/"));
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

function getPressureFlowInvoiceNumber(job, invoiceType) {
  const prefix = invoiceType === "deposit" ? "PPW-D" : "PPW-F";
  const source = `${job.id}-${invoiceType}`;
  return `${prefix}-${displayHash(source).slice(0, 6).toUpperCase()}`;
}

function displayHash(value) {
  let hash = 0x811c9dc5;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getBaseUrlFromLink(link) {
  try {
    const url = new URL(link);
    return url.origin;
  } catch {
    return process.env.APP_BASE_URL || "";
  }
}

function getBusinessName(settings = {}) {
  return settings.businessName || "Your Company";
}

function formatAlertMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatAlertCustomer(job) {
  return `${job.customerName || "Customer"} - ${job.address || "No address"}`;
}

function renderLogoHtml(settings = {}, baseUrl = "", width = 190) {
  const logo = String(settings.businessLogoDataUrl || "");
  if (!logo.startsWith("data:image/")) {
    return "";
  }
  return `<img src="${escapeHtml(logo)}" alt="${escapeHtml(getBusinessName(settings))}" style="display:block;max-width:${width}px;width:100%;height:auto;margin:0 0 14px">`;
}

function buildEstimateMailto(job, settings = {}) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  const subject = `${businessName} estimate for ${job.serviceType} at ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `Your estimate from ${businessName} is ready for review.`,
    "",
    `Estimate total: $${Number(job.estimate || 0).toFixed(2)}`,
    `This estimate is valid through ${formatPublicDate(validUntil)}.`,
    `Approve estimate: ${job.estimateApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  return `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildContractMailto(job, settings = {}) {
  const businessName = getBusinessName(settings);
  const subject = `${businessName} contract for ${job.serviceType} at ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `Your ${businessName} pressure washing service contract is ready for review and signature.`,
    "",
    `Review and sign: ${job.contractApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  return `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function sendEstimateEmail(job, settings) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  const subject = `${businessName} estimate for ${job.serviceType} at ${job.address}`;
  const textBody = [
    `Hi ${job.customerName},`,
    "",
    `Your estimate from ${businessName} is ready for review.`,
    "",
    `Estimate total: $${Number(job.estimate || 0).toFixed(2)}`,
    `This estimate is valid through ${formatPublicDate(validUntil)}.`,
    `Approve estimate: ${job.estimateApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");
  const htmlBody = renderEstimateEmailHtml(job, settings);

  await sendGoogleEmail(settings, {
    to: job.email,
    subject,
    textBody,
    htmlBody
  });
}

async function sendContractEmail(job, settings) {
  const businessName = getBusinessName(settings);
  const subject = `${businessName} contract for ${job.serviceType} at ${job.address}`;
  const textBody = [
    `Hi ${job.customerName},`,
    "",
    `Your ${businessName} pressure washing service contract is ready for review and signature.`,
    "",
    `Review and sign: ${job.contractApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  await sendGoogleEmail(settings, {
    to: job.email,
    subject,
    textBody,
    htmlBody: renderContractEmailHtml(job, settings)
  });
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
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  const subject = `${businessName} ${isDeposit ? "deposit" : "final"} invoice ${invoiceNumber} for ${job.serviceType} at ${job.address}`;
  const textBody = [
    `Hi ${job.customerName},`,
    "",
    `Your ${isDeposit ? "deposit" : "final"} invoice from ${businessName} is ready.`,
    `Invoice number: ${invoiceNumber}`,
    `Amount due: $${amount.toFixed(2)}`,
    `Invoice: ${invoiceUrl}`,
    !isDeposit && job.completionProofUrl ? `Completion photos: ${job.completionProofUrl}` : "",
    "",
    "Payment options:",
    settings.zellePayment ? `Zelle: ${settings.zellePayment}` : "",
    settings.cashAppPayment ? `Cash App: ${settings.cashAppPayment}` : "",
    settings.venmoPayment ? `Venmo: ${settings.venmoPayment}` : "",
    settings.paymentInstructions || "",
    "",
    "Thank you,",
    businessName
  ].filter((line) => line !== "").join("\n");

  await sendGoogleEmail(settings, {
    to: job.email,
    subject,
    textBody,
    htmlBody: renderPressureFlowInvoiceEmailHtml(job, settings, invoiceType, invoiceUrl)
  });
}

function renderPressureFlowInvoiceEmailHtml(job, settings, invoiceType, invoiceUrl) {
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, getBaseUrlFromLink(invoiceUrl))}
      <h2 style="margin:0 0 12px">${isDeposit ? "Deposit invoice" : "Final invoice"}</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your ${isDeposit ? "deposit" : "final"} invoice from ${escapeHtml(businessName)} for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)} is ready.</p>
      <p><strong>Invoice number:</strong> ${escapeHtml(invoiceNumber)}</p>
      <p style="font-size:18px"><strong>Amount due: $${amount.toFixed(2)}</strong></p>
      <p>
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          View invoice
        </a>
      </p>
      ${!isDeposit && job.completionProofUrl ? `<p><a href="${escapeHtml(job.completionProofUrl)}">View completion photos</a></p>` : ""}
      <p><strong>Payment options</strong></p>
      <ul>
        ${settings.zellePayment ? `<li>Zelle: ${escapeHtml(settings.zellePayment)}</li>` : ""}
        ${settings.cashAppPayment ? `<li>Cash App: ${escapeHtml(settings.cashAppPayment)}</li>` : ""}
        ${settings.venmoPayment ? `<li>Venmo: ${escapeHtml(settings.venmoPayment)}</li>` : ""}
      </ul>
      ${settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ""}
      <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(invoiceUrl)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

async function sendCompletionCertificateEmail(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  const paidAmount = getFinalBalanceCents(job) / 100;
  const subject = `${businessName} Certificate of Completion - ${job.address}`;
  const textBody = [
    `Hi ${job.customerName},`,
    "",
    `Thank you for your business! This email confirms that ${businessName} has completed the pressure washing work at ${job.address}.`,
    "",
    `Amount paid: $${paidAmount.toFixed(2)}`,
    job.completionProofUrl ? `Before and after photos: ${job.completionProofUrl}` : "",
    "",
    "We appreciate the opportunity to work on your property.",
    "",
    "Thank you,",
    businessName
  ].filter((line) => line !== "").join("\n");

  await sendGoogleEmail(settings, {
    to: job.email,
    subject,
    textBody,
    htmlBody: renderCompletionCertificateEmailHtml(job, settings, baseUrl)
  });
}

function renderCompletionCertificateEmailHtml(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  const paidAmount = getFinalBalanceCents(job) / 100;
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, baseUrl, 210)}
      <h2 style="margin:0 0 12px">Certificate of Completion</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Thank you for your business! This confirms that ${escapeHtml(businessName)} has completed the pressure washing work at ${escapeHtml(job.address)}.</p>
      <p style="font-size:18px"><strong>Amount paid: $${paidAmount.toFixed(2)}</strong></p>
      ${job.completionProofUrl ? `<p><a href="${escapeHtml(job.completionProofUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">View before and after photos</a></p>` : ""}
      <h3 style="margin:18px 0 8px">Before Photos</h3>
      ${renderEmailPhotoGrid(job.jobPhotos?.before || [])}
      <h3 style="margin:18px 0 8px">Completed Work Photos</h3>
      ${renderEmailPhotoGrid(job.jobPhotos?.after || [])}
      <p>We appreciate the opportunity to work on your property.</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function renderEmailPhotoGrid(photos) {
  if (!photos.length) {
    return `<p style="color:#667085">No photos provided.</p>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:560px">
      ${photos.slice(0, 8).map((photo) => `
        <div style="border:1px solid #d8dee8;border-radius:8px;overflow:hidden;background:#f7f8fb">
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}" style="display:block;width:100%;height:150px;object-fit:cover">
        </div>
      `).join("")}
    </div>
    ${photos.length > 8 ? `<p style="color:#667085">${photos.length - 8} additional photo${photos.length - 8 === 1 ? "" : "s"} available in the proof link.</p>` : ""}
  `;
}

async function sendGoogleEmail(settings, message) {
  const accessToken = await getGoogleAccessToken(settings);
  const raw = buildMimeEmail({
    from: settings.businessEmail || settings.googleCalendarId || "me",
    to: message.to,
    subject: message.subject,
    textBody: message.textBody,
    htmlBody: message.htmlBody
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

async function sendAdminTextAlertSafe(message) {
  try {
    await sendAdminTextAlert(message);
  } catch (error) {
    console.warn(`Unable to send admin text alert: ${error.message}`);
  }
}

async function sendAdminTextAlert(message) {
  if (process.env.ENABLE_TWILIO_ALERTS !== "true") {
    return null;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN || "";
  const fromPhone = process.env.TWILIO_FROM_PHONE || "";
  const toPhone = process.env.ADMIN_ALERT_PHONE || "";

  if (!accountSid || !authToken || !fromPhone || !toPhone) {
    return null;
  }

  const body = String(message || "").trim().slice(0, 1500);
  if (!body) {
    return null;
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      From: fromPhone,
      To: toPhone,
      Body: body
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || data.error_message || "Twilio text send failed.");
  }

  return data;
}

function buildMimeEmail({ from, to, subject, textBody, htmlBody }) {
  const boundary = `pressureflow-${crypto.randomBytes(12).toString("hex")}`;
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
    "",
    `--${boundary}--`
  ].join("\r\n");

  return Buffer.from(mime).toString("base64url");
}

function encodeMimeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(String(value)).toString("base64")}?=`;
}

function renderEstimateEmailHtml(job, settings) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.estimateApprovalUrl))}
      <h2 style="margin:0 0 12px">Your pressure washing estimate is ready</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your estimate from ${escapeHtml(businessName)} for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)} is ready for review.</p>
      <p style="font-size:18px"><strong>Total: $${Number(job.estimate || 0).toFixed(2)}</strong></p>
      <p>This estimate is valid through ${escapeHtml(formatPublicDate(validUntil))}.</p>
      <p>
        <a href="${escapeHtml(job.estimateApprovalUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Review and approve estimate
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(job.estimateApprovalUrl)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function renderContractEmailHtml(job, settings) {
  const businessName = getBusinessName(settings);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.contractApprovalUrl))}
      <h2 style="margin:0 0 12px">Your service contract is ready</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Please review and sign the ${escapeHtml(businessName)} service contract for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)}.</p>
      <p>
        <a href="${escapeHtml(job.contractApprovalUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Review and sign contract
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(job.contractApprovalUrl)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function getAppBaseUrl(request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}`;
}

function renderEstimateApprovalPage(job, settings = {}) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  const subtotal = (job.lineItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0);
  const discountPercent = Number(job.discountPercent || 0);
  const discountAmount = subtotal * (discountPercent / 100);
  const lineRows = (job.lineItems || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td>$${Number(item.price || 0).toFixed(2)}</td>
      <td>$${Number(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Estimate Approval</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.estimateApprovalUrl), 190)}
      <p class="eyebrow">Estimate Only, not an actual Invoice.</p>
      <h1>${escapeHtml(job.serviceType)} for ${escapeHtml(job.customerName)}</h1>
      <p>${escapeHtml(job.address)}</p>
      <section>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Rate</th><th>Total</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </section>
      <section class="totals">
        <div><span>Subtotal</span><strong>$${subtotal.toFixed(2)}</strong></div>
        ${discountAmount > 0 ? `<div><span>Discount</span><strong>-$${discountAmount.toFixed(2)}</strong></div>` : ""}
        <div><span>Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
      </section>
      <section class="notice">
        <strong>Estimate valid for 30 days</strong>
        <p>This estimate is valid through ${escapeHtml(formatPublicDate(validUntil))}.</p>
      </section>
      ${renderMeasurementPreview(job)}
      <form method="post" action="/api/public/estimates/${encodeURIComponent(job.id)}/approve">
        <input type="hidden" name="token" value="${escapeHtml(job.estimateApprovalToken)}">
        <button type="submit">Approve Estimate</button>
      </form>
      <details class="reject-estimate">
        <summary>Decline estimate</summary>
        <form method="post" action="/api/public/estimates/${encodeURIComponent(job.id)}/reject">
          <input type="hidden" name="token" value="${escapeHtml(job.estimateApprovalToken)}">
          <label>
            Reason for declining
            <select name="reason" id="estimateRejectReason">
              <option value="">Prefer not to say</option>
              <option value="price-too-high">Price was too high</option>
              <option value="timing-not-right">Timing is not right</option>
              <option value="went-with-another-company">Went with another company</option>
              <option value="scope-changed">Scope changed</option>
              <option value="just-researching">Just researching</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label id="estimateRejectOtherWrap" hidden>
            Other reason
            <textarea name="otherReason" rows="3" placeholder="Optional"></textarea>
          </label>
          <button type="submit" class="secondary-action">Decline Estimate</button>
        </form>
      </details>
      <script>
        const rejectReason = document.querySelector("#estimateRejectReason");
        const otherWrap = document.querySelector("#estimateRejectOtherWrap");
        rejectReason?.addEventListener("change", () => {
          otherWrap.hidden = rejectReason.value !== "other";
        });
      </script>
    </main>
  </body>
</html>`;
}

function renderEstimateApprovalWordTemplate(settings) {
  const businessName = settings.businessName || "Your Company";
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>PressureFlow Estimate Approval Template</title>
    <style>
      body { font-family: Arial, sans-serif; color: #202124; line-height: 1.45; }
      h1 { font-size: 24pt; margin: 0 0 6pt; }
      h2 { font-size: 14pt; margin: 18pt 0 8pt; }
      p { margin: 0 0 8pt; }
      table { width: 100%; border-collapse: collapse; margin: 8pt 0 14pt; }
      th, td { border: 1px solid #808080; padding: 7pt; text-align: left; vertical-align: top; }
      th { background: #f2f2f2; }
      .muted { color: #666666; }
      .signature { height: 36pt; }
    </style>
  </head>
  <body>
    <h1>Estimate Approval</h1>
    <p><strong>Business:</strong> ${escapeHtml(businessName)}</p>
    <p><strong>Customer:</strong> [Customer Name]</p>
    <p><strong>Property Address:</strong> [Service Address]</p>
    <p><strong>Email:</strong> [Customer Email]</p>
    <p><strong>Phone:</strong> [Customer Phone]</p>

    <h2>Scope and Pricing</h2>
    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Area / Quantity</th>
          <th>Rate</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>[Service Name]</td>
          <td>[SqFt, LNF, or Qty]</td>
          <td>[$ Rate]</td>
          <td>[$ Total]</td>
        </tr>
        <tr>
          <td>[Additional Service]</td>
          <td>[SqFt, LNF, or Qty]</td>
          <td>[$ Rate]</td>
          <td>[$ Total]</td>
        </tr>
      </tbody>
    </table>

    <table>
      <tbody>
        <tr><td><strong>Subtotal</strong></td><td>[$ Subtotal]</td></tr>
        <tr><td><strong>Discount</strong></td><td>[$ Discount, if any]</td></tr>
        <tr><td><strong>Total Estimate</strong></td><td>[$ Total]</td></tr>
        <tr><td><strong>Deposit Required</strong></td><td>[Deposit % and $ Amount]</td></tr>
      </tbody>
    </table>

    <h2>Customer Approval</h2>
    <p>The Customer acknowledges that this estimate identifies the services, pricing, and scope of work for the project. By approving or signing this estimate, the Customer authorizes the Business to proceed with the services described, subject to the service agreement and any written changes approved by both parties.</p>
    <p class="muted">Services, areas, conditions, or work not listed in this estimate are excluded unless approved in writing and may require additional charges.</p>

    <table>
      <tbody>
        <tr>
          <td><strong>Customer Signature</strong><br><br><div class="signature">[Signature]</div></td>
          <td><strong>Date</strong><br><br>[Date]</td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function renderMeasurementPreview(job) {
  if (!job.measurement?.staticImageUrl) {
    return "";
  }

  const area = Math.round(Number(job.measurement.squareFeet || 0)).toLocaleString("en-US");
  const areaRows = Array.isArray(job.measurement.areas) && job.measurement.areas.length
    ? `<ul>
      ${job.measurement.areas.map((item) => `
        <li>${escapeHtml(item.name || "Service area")}: ${Math.round(Number(item.squareFeet || 0)).toLocaleString("en-US")} SqFt</li>
      `).join("")}
    </ul>`
    : "";
  return `<section>
    <h2>Measured Surface</h2>
    <p>${escapeHtml(job.measurement.address || job.address)} | ${area} SqFt</p>
    ${areaRows}
    <div class="measurement-preview-wrap">
      <img class="measurement-preview" src="${escapeHtml(job.measurement.staticImageUrl)}" alt="Satellite measurement with traced polygon">
      <div class="measurement-badge measurement-badge-area">${area} SqFt</div>
    </div>
  </section>`;
}

function getEstimateValidUntil(job) {
  const sentDate = job.estimateSentAt ? new Date(job.estimateSentAt) : new Date();
  const base = Number.isNaN(sentDate.getTime()) ? new Date() : sentDate;
  return new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000);
}

function formatPublicDate(date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function renderEstimateMessagePage(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main>
      ${renderLogoHtml({}, "", 190)}
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

function renderCompletionProofPage(job, settings = {}) {
  const before = job.jobPhotos?.before || [];
  const after = job.jobPhotos?.after || [];
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, "final");
  const finalBalance = getFinalBalanceCents(job) / 100;
  const deposit = getDepositCents(job) / 100;
  const total = Number(job.estimate || 0);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Completion Proof - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .proof-meta { display: grid; gap: 6px; margin: 16px 0 22px; color: #667085; }
      .proof-details { width: 100%; margin: 18px 0 24px; border-collapse: collapse; }
      .proof-details th, .proof-details td { padding: 10px; border: 1px solid #d8dee8; text-align: left; vertical-align: top; }
      .proof-details th { width: 34%; background: #f7f8fb; color: #667085; }
      .proof-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 12px 0 24px; }
      .proof-grid figure { margin: 0; border: 1px solid #d8dee8; border-radius: 8px; overflow: hidden; background: #f7f8fb; }
      .proof-grid img { display: block; width: 100%; height: 150px; object-fit: cover; }
      .print-actions { margin-top: 20px; }
      @media (max-width: 640px) { .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .proof-grid img { height: 128px; } }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } .print-actions { display: none; } }
    </style>
  </head>
  <body>
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.completionProofUrl), 190)}
      <p class="eyebrow">Completion Proof</p>
      <h1>${escapeHtml(job.serviceType)} Completed</h1>
      <div class="proof-meta">
        <span>${escapeHtml(job.customerName)}</span>
        <span>${escapeHtml(job.address)}</span>
        <span>${escapeHtml(new Date(job.completionNoticeSentAt || Date.now()).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</span>
      </div>
      <h2>Completion and Invoice Details</h2>
      <table class="proof-details">
        <tbody>
          <tr><th>Service</th><td>${escapeHtml(job.serviceType || "Pressure washing")}</td></tr>
          <tr><th>Invoice</th><td>${escapeHtml(invoiceNumber)}</td></tr>
          <tr><th>Estimate total</th><td>${escapeHtml(formatAlertMoney(total))}</td></tr>
          <tr><th>Deposit</th><td>${escapeHtml(formatAlertMoney(deposit))}</td></tr>
          <tr><th>Final balance</th><td>${escapeHtml(formatAlertMoney(finalBalance))}</td></tr>
          <tr><th>Status</th><td>${escapeHtml(job.squareFinalInvoiceStatus === "PAID" || job.squareFinalPaidAt ? "Paid" : "Final invoice sent")}</td></tr>
        </tbody>
      </table>
      ${renderCompletionServiceAreas(job)}
      <h2>Before Photos</h2>
      ${renderProofPhotoGrid(before)}
      <h2>Completed Work Photos</h2>
      ${renderProofPhotoGrid(after)}
      <div class="print-actions">
        <button type="button" onclick="window.print()">Print or Save as PDF</button>
      </div>
    </main>
  </body>
</html>`;
}

function renderCompletionServiceAreas(job) {
  if (!job.measurement?.squareFeet) {
    return "";
  }

  const total = Math.round(Number(job.measurement.squareFeet || 0)).toLocaleString("en-US");
  const areas = Array.isArray(job.measurement.areas) && job.measurement.areas.length
    ? `<ul>
      ${job.measurement.areas.map((area) => `
        <li>${escapeHtml(area.name || "Service area")}: ${Math.round(Number(area.squareFeet || 0)).toLocaleString("en-US")} SqFt</li>
      `).join("")}
    </ul>`
    : "";
  return `<h2>Service Area</h2><p>Total serviced area: ${total} SqFt</p>${areas}`;
}

function renderProofPhotoGrid(photos) {
  if (!photos.length) {
    return "<p>No photos provided.</p>";
  }

  return `<div class="proof-grid">
    ${photos.map((photo) => `
      <figure>
        <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}">
      </figure>
    `).join("")}
  </div>`;
}

function renderPressureFlowInvoicePage(job, settings, invoiceType) {
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const title = isDeposit ? "Deposit Invoice" : "Final Invoice";
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} - ${escapeHtml(job.customerName)}</title>
    ${estimatePageStyles()}
    <style>
      .invoice-total { margin: 18px 0; padding: 18px; border: 1px solid #b8e3dc; border-radius: 8px; background: #eef9f7; }
      .invoice-total span { display: block; color: #667085; font-weight: 800; }
      .invoice-total strong { display: block; margin-top: 4px; font-size: 32px; }
      .payment-methods { display: grid; gap: 10px; margin: 18px 0; }
      .payment-methods div { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid #d8dee8; }
      .proof-link { margin: 18px 0; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #f7f8fb; }
      .proof-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .proof-grid img { height: 150px; }
      @media (max-width: 640px) { .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .proof-grid img { height: 128px; } }
      @media print { body { background: white; } main { box-shadow: none; margin: 0; width: 100%; border: 0; } button { display: none; } }
    </style>
  </head>
  <body>
    <main>
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.squareDepositInvoiceUrl || job.squareFinalInvoiceUrl), 190)}
      <p class="eyebrow">${isDeposit ? "Deposit Invoice" : "Final Invoice"}</p>
      <h1>${title}</h1>
      <p>${escapeHtml(invoiceNumber)} | ${escapeHtml(businessName)} for ${escapeHtml(job.customerName)} | ${escapeHtml(job.address)}</p>
      <section class="invoice-total">
        <span>Amount Due</span>
        <strong>$${amount.toFixed(2)}</strong>
      </section>
      <h2>Service</h2>
      <table>
        <tbody>
          ${(job.lineItems || []).map((item) => `
            <tr>
              <td>${escapeHtml(item.name)} (${Number(item.quantity || 0)} ${escapeHtml(item.unit || "")})</td>
              <td>$${Number(item.total || 0).toFixed(2)}</td>
            </tr>
          `).join("")}
          <tr><td>${isDeposit ? `Deposit (${Number(job.depositPercent || 25)}%)` : "Final balance after deposit"}</td><td>$${amount.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <h2>Payment Options</h2>
      ${renderPaymentMethods(settings)}
      ${settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ""}
      ${renderCardPaymentForm(job, invoiceType)}
      ${!isDeposit && job.completionProofUrl ? `<section class="proof-link"><strong>Completion photos:</strong><br><a href="${escapeHtml(job.completionProofUrl)}">View completion proof and photos</a></section>` : ""}
      ${!isDeposit ? `<h2>Before Photos</h2>${renderProofPhotoGrid(job.jobPhotos?.before || [])}<h2>Completed Work Photos</h2>${renderProofPhotoGrid(job.jobPhotos?.after || [])}` : ""}
      <button type="button" onclick="window.print()">Print or Save as PDF</button>
    </main>
  </body>
</html>`;
}

function renderCardPaymentForm(job, invoiceType) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return "";
  }

  const token = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
  return `
    <form method="post" action="/api/public/invoices/${encodeURIComponent(job.id)}/pay-card" style="margin:18px 0">
      <input type="hidden" name="type" value="${escapeHtml(invoiceType)}">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Pay by Credit Card</button>
    </form>
  `;
}

function renderPaymentMethods(settings) {
  const methods = [
    ["Zelle", settings.zellePayment],
    ["Cash App", settings.cashAppPayment],
    ["Venmo", settings.venmoPayment]
  ].filter(([, value]) => value);

  if (!methods.length) {
    return "<p>Payment instructions will be provided by the business.</p>";
  }

  return `<div class="payment-methods">
    ${methods.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
  </div>`;
}

function renderContractSigningPage(job, options = {}) {
  const lineRows = (job.lineItems || []).map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td>
      <td>$${Number(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join("");
  const depositAmount = Number(job.estimate || 0) * (Number(job.depositPercent || 25) / 100);
  const finalAmount = Math.max(Number(job.estimate || 0) - depositAmount, 0);
  const alreadySigned = Boolean(job.contractSignedAt);
  const initials = getCustomerInitials(job.customerName);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Service Contract</title>
    ${estimatePageStyles()}
  </head>
  <body>
    <main>
      ${renderLogoHtml(options.settings || {}, getBaseUrlFromLink(job.contractApprovalUrl), 190)}
      <p class="eyebrow">Service Contract</p>
      <h1>${escapeHtml(serviceAgreementTemplate.title)}</h1>
      <p>${escapeHtml(job.customerName)} | ${escapeHtml(job.address)}</p>

      ${renderContractProjectDetails(job, depositAmount)}

      <section>
        <h2>Scope of Work</h2>
        <table>
          <thead><tr><th>Service</th><th>Amount</th><th>Total</th></tr></thead>
          <tbody>${lineRows}</tbody>
        </table>
      </section>

      <section class="totals">
        <div><span>Estimate Total</span><strong>$${Number(job.estimate || 0).toFixed(2)}</strong></div>
        <div><span>Deposit Due Before Scheduling</span><strong>$${depositAmount.toFixed(2)}</strong></div>
        <div><span>Final Balance After Completion</span><strong>$${finalAmount.toFixed(2)}</strong></div>
      </section>

      ${renderContractTerms(job, { executed: alreadySigned || options.executedOnly, initials })}

      ${alreadySigned ? `
        <section class="notice">
          <strong>Signed</strong>
          <p>This contract was signed by ${escapeHtml(job.contractSignerName || job.customerName)} on ${escapeHtml(new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}.</p>
        </section>
        <section>
          <h2>Signature</h2>
          <table>
            <tbody>
              <tr><th>Signer</th><td>${escapeHtml(job.contractSignerName || job.customerName)}</td></tr>
              <tr><th>Date signed</th><td>${escapeHtml(job.contractSignedDate || new Date(job.contractSignedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))}</td></tr>
            </tbody>
          </table>
        </section>
      ` : `
        <form id="contractSignForm" method="post" action="/api/public/contracts/${encodeURIComponent(job.id)}/sign">
          <input type="hidden" name="token" value="${escapeHtml(job.contractApprovalToken)}">
          <input type="hidden" id="expectedInitials" value="${escapeHtml(initials)}">
          <label>
            Signature date and time
            <input id="signedDateInput" name="signedDate" required readonly placeholder="Click to add current date and time">
          </label>
          <label>
            Type your full name to sign
            <input id="signatureInput" name="signerName" required autocomplete="name" placeholder="Type your full legal name">
          </label>
          <button type="submit">Sign Contract</button>
        </form>
        ${contractSigningScript()}
      `}
    </main>
  </body>
</html>`;
}

function renderContractTerms(job, options = {}) {
  return `<section>
    <h2>Terms and Conditions</h2>
    ${serviceAgreementTemplate.sections.map((section, index) => `
      <article class="term">
        <h3>${index + 1}. ${escapeHtml(section.title)}</h3>
        ${escapeHtml(section.body).split("\n\n").map((paragraph) => `<p>${paragraph}</p>`).join("")}
        ${section.initialsRequired && options.executed ? `
          <div class="executed-initials">
            <span>Client initials</span>
            <strong>${escapeHtml(options.initials || getCustomerInitials(job.customerName))}</strong>
          </div>
        ` : section.initialsRequired ? `
          <label class="initials-field">
            Initials
            <input name="initials_${index}" class="initials-input" form="contractSignForm" required placeholder="Click to initial" autocomplete="off">
          </label>
        ` : ""}
      </article>
    `).join("")}
  </section>`;
}

function renderContractProjectDetails(job, depositAmount) {
  const details = [
    ["Business", "Your Company"],
    ["Client", job.customerName],
    ["Service Address", job.address],
    ["Approved Estimate", "PressureFlow estimate approved online"],
    ["Estimated Price", `$${Number(job.estimate || 0).toFixed(2)}`],
    ["Deposit", `$${depositAmount.toFixed(2)} (${Number(job.depositPercent || 25)}%)`],
    ["Scheduled Date", job.scheduledAt || "To be scheduled after deposit payment"]
  ];

  return `<section>
    <h2>Project Details</h2>
    <table>
      <tbody>
        ${details.map(([label, value]) => `
          <tr>
            <th>${escapeHtml(label)}</th>
            <td>${escapeHtml(value)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  </section>`;
}

function getCustomerInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] || "";
  const last = (parts.length > 1 ? parts.at(-1)?.[0] : "") || "";
  return `${first}${last}`.toUpperCase();
}

function contractSigningScript() {
  return `<script>
    const expectedInitials = document.querySelector("#expectedInitials")?.value || "";
    const signedDateInput = document.querySelector("#signedDateInput");
    document.querySelectorAll(".initials-input").forEach((input) => {
      input.addEventListener("click", () => {
        input.value = expectedInitials;
      });
      input.addEventListener("focus", () => {
        if (!input.value) input.value = expectedInitials;
      });
    });

    if (signedDateInput) {
      const fillSignedDate = () => {
        signedDateInput.value = new Date().toLocaleString("en-US", {
          timeZone: "America/Los_Angeles",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "numeric",
          minute: "2-digit"
        });
      };
      signedDateInput.addEventListener("click", fillSignedDate);
      signedDateInput.addEventListener("focus", fillSignedDate);
    }

    document.querySelector("#contractSignForm")?.addEventListener("submit", (event) => {
      const missingInitials = Array.from(document.querySelectorAll(".initials-input")).some((input) => !input.value.trim());
      if (missingInitials) {
        event.preventDefault();
        alert("Please click each initials box before signing.");
        return;
      }

      if (!signedDateInput?.value.trim()) {
        event.preventDefault();
        alert("Please click the signature date and time box before signing.");
      }
    });
  </script>`;
}

function estimatePageStyles() {
  return `<style>
    body { margin: 0; min-height: 100vh; background: #f7f8fb; color: #202124; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(760px, calc(100vw - 32px)); margin: 32px auto; padding: 24px; border: 1px solid #d8dee8; border-radius: 8px; background: white; box-shadow: 0 12px 28px rgba(16, 24, 40, 0.08); }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    p { margin: 0 0 20px; color: #667085; line-height: 1.45; }
    h2 { margin: 24px 0 8px; font-size: 20px; }
    h3 { margin: 0 0 4px; font-size: 15px; }
    .eyebrow { margin: 0 0 8px; color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    label { display: grid; gap: 6px; margin: 18px 0; color: #667085; font-size: 13px; font-weight: 700; }
    input, select, textarea { width: 100%; border: 1px solid #d8dee8; border-radius: 8px; font: inherit; }
    input, select { min-height: 42px; padding: 0 10px; }
    textarea { padding: 10px; resize: vertical; }
    .initials-field { max-width: 180px; }
    .initials-input { text-align: center; font-weight: 800; cursor: pointer; }
    .executed-initials { display: inline-grid; gap: 4px; min-width: 120px; margin-top: 12px; padding: 10px 12px; border: 1px solid #d8dee8; border-radius: 8px; background: #f7f8fb; }
    .executed-initials span { color: #667085; font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .executed-initials strong { font-size: 18px; }
    .measurement-preview-wrap { position: relative; overflow: hidden; border: 1px solid #d8dee8; border-radius: 8px; background: #101828; }
    .measurement-preview { display: block; width: 100%; }
    .measurement-badge { position: absolute; left: 50%; padding: 0; border: 0; background: transparent; color: #ff1f1f; font-size: 13px; font-weight: 900; line-height: 1.15; text-align: center; text-shadow: 0 1px 2px rgba(255,255,255,0.95), 0 -1px 2px rgba(255,255,255,0.95), 1px 0 2px rgba(255,255,255,0.95), -1px 0 2px rgba(255,255,255,0.95); transform: translate(-50%, -50%); pointer-events: none; }
    .measurement-badge-area { top: 50%; }
    table { width: 100%; border-collapse: collapse; margin: 18px 0; }
    th, td { padding: 12px 8px; border-bottom: 1px solid #d8dee8; text-align: left; }
    th { color: #667085; font-size: 13px; }
    td:last-child, th:last-child { text-align: right; }
    .totals { display: grid; gap: 8px; margin: 18px 0; }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #d8dee8; }
    .totals span { color: #667085; }
    .term { padding: 12px 0; border-bottom: 1px solid #d8dee8; }
    .term p { margin: 0; }
    .term p + p { margin-top: 10px; }
    .notice { padding: 14px; border: 1px solid #b8e3dc; border-radius: 8px; background: #eef9f7; }
    .reject-estimate { margin-top: 18px; padding: 14px; border: 1px solid #d8dee8; border-radius: 8px; background: #fbfcfe; }
    .reject-estimate summary { color: #667085; font-weight: 800; cursor: pointer; }
    button { width: 100%; min-height: 46px; border: 0; border-radius: 8px; background: #1c7c54; color: white; font: inherit; font-weight: 800; cursor: pointer; }
    button.secondary-action { background: #fee4e2; color: #b42318; }
  </style>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function csvEscape(value) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/login") {
    sendHtml(response, 200, loginPage.replace("%ERROR%", ""));
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const body = await readFormOrJsonBody(request);
    const login = await authenticateLogin(body.email, body.password);
    if (login) {
      response.writeHead(302, {
        "set-cookie": buildSessionCookie(login),
        location: "/"
      });
      response.end();
      return;
    }

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

    if (Buffer.byteLength(template.dataUrl, "utf8") > 7_000_000) {
      sendError(response, 400, "Template is too large. Please upload a smaller Word document.");
      return;
    }

    settings.customTemplates = [template, ...templates].slice(0, 25);
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
    sendJson(response, 200, { settings: publicSettings(await readSettings()) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendJson(response, 200, {
      user: publicSessionUser(requestContext.getStore()?.session) || (requestContext.getStore()?.authDisabled
        ? { id: "local-owner", email: "", role: "owner", isOwner: true }
        : null)
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
    sendJson(response, 200, { events: await readWebhookEvents() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/settings") {
    const existing = await readSettings();
    const input = await readRequestBody(request);
    const settings = normalizeSettings(input, existing);
    await writeSettings(settings);
    sendJson(response, 200, { settings: publicSettings(settings) });
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
    const settings = await readSettings();
    const rawBody = await readRawRequestBody(request);
    if (!verifySquareWebhookSignature(request, rawBody, settings)) {
      await recordWebhookEvent({ provider: "square", status: "rejected", reason: "invalid signature" });
      sendError(response, 401, "Invalid Square webhook signature.");
      return;
    }

    const event = JSON.parse(rawBody || "{}");
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
    if (!verifyStripeWebhookSignature(request, rawBody)) {
      sendError(response, 401, "Invalid Stripe webhook signature.");
      return;
    }

    const event = JSON.parse(rawBody || "{}");
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

    const checkout = await createStripeCheckoutSession(job, invoiceType, getAppBaseUrl(request));
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
    return JSON.parse(raw || "{}");
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

async function isAuthEnabled() {
  if (process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_SHA256) {
    return true;
  }

  return (await readUsers()).some((user) => !user.disabled);
}

function isPublicPath(pathname) {
  return pathname === "/login" ||
    pathname === "/auth/login" ||
    pathname === "/auth/logout" ||
    pathname === "/health" ||
    pathname === "/webhooks/square" ||
    pathname.startsWith("/estimate/") ||
    pathname.startsWith("/contract/") ||
    pathname.startsWith("/proof/") ||
    pathname.startsWith("/invoice/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/api/public/") ||
    pathname === "/webhooks/stripe" ||
    pathname === "/favicon.ico";
}

async function authenticateLogin(email, password) {
  const adminLogin = isValidAdminLogin(email, password);
  if (adminLogin) {
    return adminLogin;
  }

  const users = await readUsers();
  const user = users.find((item) => item.email.toLowerCase() === String(email || "").trim().toLowerCase());
  if (!user || user.disabled || !verifyPassword(password, user.passwordHash)) {
    return null;
  }

  user.lastLoginAt = new Date().toISOString();
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
  return {
    userId: user.id,
    email: user.email,
    role: user.role || "tester"
  };
}

function isValidAdminLogin(email, password) {
  const expectedEmail = process.env.ADMIN_EMAIL || "";
  if (expectedEmail && String(email || "").toLowerCase() !== expectedEmail.toLowerCase()) {
    return null;
  }

  if (process.env.ADMIN_PASSWORD_SHA256) {
    const matches = safeCompare(
      crypto.createHash("sha256").update(String(password || "")).digest("hex"),
      process.env.ADMIN_PASSWORD_SHA256
    );
    return matches ? { userId: "env-admin", email: expectedEmail || "admin", role: "owner" } : null;
  }

  const matches = safeCompare(String(password || ""), process.env.ADMIN_PASSWORD || "");
  return matches ? { userId: "env-admin", email: expectedEmail || "admin", role: "owner" } : null;
}

function buildSessionCookie(user = {}) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = base64UrlEncode(JSON.stringify({
    expiresAt,
    userId: user.userId || "",
    email: user.email || "",
    role: user.role || "tester"
  }));
  const signature = signSessionPayload(payload);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

function publicUsers(users) {
  return users.map(publicUser);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email || "",
    role: user.role || "tester",
    disabled: Boolean(user.disabled),
    lastLoginAt: user.lastLoginAt || "",
    createdAt: user.createdAt || ""
  };
}

function publicSessionUser(session) {
  if (!session?.userId) return null;
  return {
    id: session.userId,
    email: session.email || "",
    role: session.role || "tester",
    isOwner: session.role === "owner"
  };
}

function isOwnerSession() {
  const context = requestContext.getStore();
  return context?.authDisabled || context?.session?.role === "owner";
}

async function createAppUser(input) {
  const user = normalizeAppUser(input);
  const users = await readUsers();

  if (users.some((item) => item.email.toLowerCase() === user.email.toLowerCase())) {
    throw new Error("A user with that email already exists.");
  }

  users.push(user);
  await writeUsers(users);
  return { user, users };
}

async function deleteAppUser(userId) {
  const users = await readUsers();
  const remainingUsers = users.filter((user) => user.id !== userId);

  if (remainingUsers.length === users.length) {
    throw new Error("User not found.");
  }

  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_SHA256 && !remainingUsers.some((user) => !user.disabled)) {
    throw new Error("Add another active user before deleting the last login.");
  }

  await writeUsers(remainingUsers);
  return { users: remainingUsers };
}

function normalizeAppUser(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  const role = ["owner", "admin", "tester", "technician"].includes(input.role) ? input.role : "tester";

  if (!name) {
    throw new Error("Enter a user name.");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid user email.");
  }
  if (password.length < 8) {
    throw new Error("Use a temporary password with at least 8 characters.");
  }

  return {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: hashPassword(password),
    role,
    disabled: false,
    settings: {},
    lastLoginAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, iterationsText, salt, expectedHash] = String(storedHash || "").split("$");
  if (scheme !== "pbkdf2-sha256" || !iterationsText || !salt || !expectedHash) {
    return false;
  }

  const iterations = Number(iterationsText);
  if (!Number.isFinite(iterations) || iterations < 10000) {
    return false;
  }

  const actualHash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return safeCompare(actualHash, expectedHash);
}

function getValidSession(request) {
  const cookie = parseCookies(request.headers.cookie || "")[SESSION_COOKIE];
  if (!cookie) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature || !safeCompare(signature, signSessionPayload(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    return Number(session.expiresAt) > Date.now() ? session : null;
  } catch {
    return null;
  }
}

function hasValidSession(request) {
  return Boolean(getValidSession(request));
}

function signSessionPayload(payload) {
  return crypto
    .createHmac("sha256", process.env.SESSION_SECRET || "local-development-session-secret")
    .update(payload)
    .digest("base64url");
}

function parseCookies(header) {
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function normalizeSettings(input, existing) {
  const depositPercent = Number(input.defaultDepositPercent ?? existing.defaultDepositPercent);
  return {
    ...existing,
    businessName: String(input.businessName || "").trim(),
    businessEmail: String(input.businessEmail || "").trim(),
    businessPhone: String(input.businessPhone || "").trim(),
    businessLogoDataUrl: normalizeBusinessLogoDataUrl(input.businessLogoDataUrl ?? existing.businessLogoDataUrl),
    defaultDepositPercent: Number.isFinite(depositPercent) ? Math.min(Math.max(depositPercent, 0), 100) : 25,
    defaultJobDurationMinutes: normalizeNumber(input.defaultJobDurationMinutes, existing.defaultJobDurationMinutes, 30, 720),
    finalInvoiceTiming: "immediate_after_completion",
    squareEnvironment: existing.squareEnvironment || "sandbox",
    squareAccessToken: existing.squareAccessToken || "",
    squareLocationId: existing.squareLocationId || "",
    squareWebhookSignatureKey: existing.squareWebhookSignatureKey || "",
    googleClientId: String(input.googleClientId || "").trim(),
    googleClientSecret: String(input.googleClientSecret || "").trim() || existing.googleClientSecret,
    googleRedirectUri: String(input.googleRedirectUri || "").trim() || existing.googleRedirectUri,
    googleCalendarId: String(input.googleCalendarId || "").trim(),
    mapboxPublicToken: String(input.mapboxPublicToken || "").trim() || existing.mapboxPublicToken,
    zellePayment: String(input.zellePayment || "").trim(),
    cashAppPayment: String(input.cashAppPayment || "").trim(),
    venmoPayment: String(input.venmoPayment || "").trim(),
    paymentInstructions: String(input.paymentInstructions || "").trim(),
    customTemplates: normalizeCustomTemplates(existing.customTemplates),
    customServices: normalizeCustomServices(input.customServices ?? existing.customServices),
    customServiceTypes: normalizeStringList(input.customServiceTypes ?? existing.customServiceTypes),
    customPhotoSections: normalizeStringList(input.customPhotoSections ?? existing.customPhotoSections)
  };
}

function normalizeCustomServices(value) {
  const allowedUnits = new Set(["Qty", "SqFt", "Hours", "LFN", "Each"]);
  return (Array.isArray(value) ? value : [])
    .map((service) => ({
      id: String(service.id || crypto.randomUUID()),
      name: String(service.name || "").trim().slice(0, 100),
      unit: allowedUnits.has(service.unit) ? service.unit : "Qty",
      price: Math.max(Number(service.price || 0), 0)
    }))
    .filter((service) => service.name)
    .slice(0, 100);
}

function normalizeStringList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))]
    .slice(0, 100);
}

function normalizeBusinessLogoDataUrl(value) {
  const logo = String(value || "").trim();
  if (!logo) {
    return "";
  }
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(logo)) {
    return "";
  }
  return logo.length <= 900000 ? logo : "";
}

async function recordWebhookEvent(event) {
  const events = await readWebhookEvents();
  events.push({
    ...event,
    receivedAt: new Date().toISOString()
  });
  await writeWebhookEvents(events);
}

function verifySquareWebhookSignature(request, rawBody, settings) {
  if (!settings.squareWebhookSignatureKey) {
    return true;
  }

  const signature = request.headers["x-square-hmacsha256-signature"];
  if (!signature) {
    return false;
  }

  const notificationUrl = getWebhookNotificationUrl(request);
  const hmac = crypto.createHmac("sha256", settings.squareWebhookSignatureKey);
  hmac.update(`${notificationUrl}${rawBody}`);
  const expected = hmac.digest("base64");
  return safeCompare(signature, expected);
}

function getWebhookNotificationUrl(request) {
  const proto = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  return `${proto}://${host}/webhooks/square`;
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
  const job = jobs.find((item) =>
    item.squareDepositInvoiceId === invoice.id ||
    item.squareFinalInvoiceId === invoice.id
  );

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

function extractSquareInvoice(event) {
  return event.data?.object?.invoice || event.data?.object || null;
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
    const calendarEvent = await createGoogleCalendarEvent(job, settings, scheduledAt, duration);
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

function buildCompletionNotice(job, settings) {
  const businessName = getBusinessName(settings);
  const completedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short"
  });
  const subject = `${businessName} service completed - ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `The pressure washing services by ${businessName} at ${job.address} have been completed as of ${completedAt}.`,
    "",
    "Please review the completed work and let us know within 24 hours if you believe any agreed-upon service was not completed. If anything needs review, we will be happy to take a look.",
    "",
    "Your final invoice for the remaining balance has been sent through PressureFlow.",
    job.completionProofUrl ? `Completion photos and proof page: ${job.completionProofUrl}` : "",
    "",
    "Thank you,",
    businessName
  ].filter((line) => line !== "").join("\n");
  const mailto = `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailto };
}

async function sendScheduleConfirmationEmail(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  const subject = `${businessName} schedule confirmation - ${job.address}`;
  const scheduleText = formatScheduledWindow(job);
  const instructions = getDayOfServiceInstructions();
  const textBody = [
    `Hi ${job.customerName},`,
    "",
    `Your ${businessName} service has been scheduled.`,
    "",
    `Service: ${job.serviceType}`,
    `Address: ${job.address}`,
    `Scheduled time: ${scheduleText}`,
    "",
    "Day-of-service instructions:",
    ...instructions.map((item) => `- ${item}`),
    "",
    "Thank you,",
    businessName
  ].join("\n");

  await sendGoogleEmail(settings, {
    to: job.email,
    subject,
    textBody,
    htmlBody: renderScheduleConfirmationEmailHtml(job, settings, baseUrl)
  });
}

function renderScheduleConfirmationEmailHtml(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, baseUrl, 190)}
      <h2 style="margin:0 0 12px">Schedule Confirmation</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your ${escapeHtml(businessName)} service has been scheduled.</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px;margin:12px 0">
        <tbody>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Service</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(job.serviceType)}</td></tr>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Address</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(job.address)}</td></tr>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Scheduled time</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(formatScheduledWindow(job))}</td></tr>
        </tbody>
      </table>
      <p><strong>Day-of-service instructions</strong></p>
      <ul>
        ${getDayOfServiceInstructions().map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function getDayOfServiceInstructions() {
  return [
    "Move all personal items, outdoor furniture, decor, and fragile items away from the service area.",
    "Move vehicles away from the service area and any areas that may receive water runoff or overspray.",
    "Leave access to the water source unrestricted and make sure exterior water spigots are working.",
    "Close and lock all windows and doors before service begins.",
    "Keep all animals inside the house for the full duration of service.",
    "Unlock gates or provide access instructions before the scheduled arrival window.",
    "Point out any known leaks, loose paint, damaged seals, electrical concerns, or sensitive plants before work begins."
  ];
}

function formatScheduledWindow(job) {
  if (!job.scheduledAt) {
    return "To be scheduled";
  }

  const start = parseLocalDateTimeParts(job.scheduledAt);
  if (!start) {
    return job.scheduledAt;
  }

  const endValue = addMinutesToLocalDateTime(job.scheduledAt.slice(0, 16), Number(job.jobDurationMinutes || 180));
  const end = parseLocalDateTimeParts(endValue);
  const zone = isPacificDaylightTime(job.scheduledAt.slice(0, 16)) ? "PDT" : "PST";
  return `${formatLocalScheduleDate(start)}, ${formatLocalTime(start)} - ${formatLocalTime(end)} ${zone}`;
}

function parseLocalDateTimeParts(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return { year, month, day, hour, minute };
}

function formatLocalScheduleDate(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function formatLocalTime(parts) {
  if (!parts) return "";
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, "0")} ${suffix}`;
}

async function createSquareInvoice(job, settings, invoiceType) {
  requireSquareSettings(settings);

  const amount = invoiceType === "deposit" ? getDepositCents(job) : getFinalBalanceCents(job);
  if (amount <= 0) {
    throw new Error("Invoice amount must be greater than $0.");
  }

  const customerId = job.squareCustomerId || await createSquareCustomer(job, settings);
  const order = await createSquareOrder(job, settings, customerId, invoiceType, amount);
  const invoice = await createSquareDraftInvoice(job, settings, customerId, order.id, invoiceType);
  const published = await publishSquareInvoice(settings, invoice.id, invoice.version);

  return {
    customerId,
    orderId: order.id,
    invoiceId: published.id || invoice.id,
    publicUrl: published.public_url || invoice.public_url || ""
  };
}

async function createStripeCheckoutSession(job, invoiceType, baseUrl) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe is not configured yet. Add STRIPE_SECRET_KEY in Render.");
  }

  const amount = invoiceType === "deposit" ? getDepositCents(job) : getFinalBalanceCents(job);
  if (amount <= 0) {
    throw new Error("Payment amount must be greater than $0.");
  }

  const invoiceToken = invoiceType === "deposit" ? job.squareDepositInvoiceId : job.squareFinalInvoiceId;
  const invoiceUrl = buildInvoiceUrl(baseUrl, job, invoiceType, invoiceToken);
  const params = new URLSearchParams({
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${getBusinessName()} ${invoiceType === "deposit" ? "deposit" : "final balance"}`,
    "line_items[0][price_data][product_data][description]": `${job.serviceType} at ${job.address}`,
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][quantity]": "1",
    customer_email: job.email,
    success_url: `${invoiceUrl}&card=paid`,
    cancel_url: invoiceUrl,
    "metadata[jobId]": job.id,
    "metadata[invoiceType]": invoiceType,
    "metadata[invoiceId]": invoiceToken
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Unable to create Stripe Checkout session.");
  }

  return data;
}

function verifyStripeWebhookSignature(request, rawBody) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  const signature = request.headers["stripe-signature"] || "";
  const timestamp = String(signature).split(",").find((part) => part.startsWith("t="))?.slice(2);
  const expected = String(signature).split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !expected.length) {
    return false;
  }

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${timestamp}.${rawBody}`);
  const digest = hmac.digest("hex");
  return expected.some((candidate) => safeCompare(candidate, digest));
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
  const invoiceType = session.metadata?.invoiceType === "deposit" ? "deposit" : "final";
  const jobs = await readJobs();
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
  await writeJobs(jobs);
  return { action: "job_updated", jobId: job.id, invoiceType, status: job.status };
}

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
    throw new Error(data.error_description || data.error || "Google access token refresh failed.");
  }

  return data.access_token;
}

async function createGoogleCalendarEvent(job, settings, scheduledAt, durationMinutes) {
  if (!scheduledAt) {
    throw new Error("Schedule date/time is required.");
  }

  const accessToken = await getGoogleAccessToken(settings);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(scheduledAt))) {
    throw new Error("Schedule date/time is invalid. Use a value like 2026-06-05T09:00.");
  }

  const startDateTime = withPacificOffset(scheduledAt.slice(0, 16));
  const endDateTime = withPacificOffset(addMinutesToLocalDateTime(scheduledAt.slice(0, 16), durationMinutes));
  const calendarId = encodeURIComponent(settings.googleCalendarId || "primary");
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
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
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error?.message || data.error || `Google Calendar event creation failed with status ${response.status}.`);
  }

  return data;
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

function addMinutesToLocalDateTime(value, minutes) {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  const date = new Date(year, month - 1, day, hour, minute + Number(minutes || 0), 0, 0);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");
  const nextHour = String(date.getHours()).padStart(2, "0");
  const nextMinute = String(date.getMinutes()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}T${nextHour}:${nextMinute}`;
}

function withPacificOffset(localDateTime) {
  const offset = isPacificDaylightTime(localDateTime) ? "-07:00" : "-08:00";
  return `${localDateTime}:00${offset}`;
}

function isPacificDaylightTime(localDateTime) {
  const [datePart] = localDateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const dstStartDay = nthSundayOfMonth(year, 3, 2);
  const dstEndDay = nthSundayOfMonth(year, 11, 1);
  const dateKey = month * 100 + day;
  const startKey = 3 * 100 + dstStartDay;
  const endKey = 11 * 100 + dstEndDay;
  return dateKey >= startKey && dateKey < endKey;
}

function nthSundayOfMonth(year, month, nth) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstSunday = 1 + ((7 - firstDay.getUTCDay()) % 7);
  return firstSunday + (nth - 1) * 7;
}

function requireSquareSettings(settings) {
  if (!settings.squareAccessToken) {
    throw new Error("Square access token is missing. Open Settings and save your Sandbox access token.");
  }
  if (!settings.squareLocationId) {
    throw new Error("Square location ID is missing. Open Settings and save your Square location ID.");
  }
}

async function createSquareCustomer(job, settings) {
  const { givenName, familyName } = splitCustomerName(job.customerName);
  const phoneNumber = normalizePhoneForSquare(job.phone);
  const customer = await squareRequest(settings, "/v2/customers", {
    idempotency_key: shortSquareKey("customer", job.id),
    given_name: givenName,
    family_name: familyName,
    company_name: familyName ? undefined : job.customerName,
    email_address: job.email,
    phone_number: phoneNumber,
    reference_id: job.id,
    note: `PressureFlow customer for ${job.address}`
  });

  return customer.customer.id;
}

async function createSquareOrder(job, settings, customerId, invoiceType, amount) {
  const title = invoiceType === "deposit" ? "Pressure washing deposit" : "Pressure washing final balance";
  const note = invoiceType === "deposit"
    ? `Deposit for ${job.serviceType} at ${job.address}`
    : `Final balance for ${job.serviceType} at ${job.address}`;
  const result = await squareRequest(settings, "/v2/orders", {
    idempotency_key: shortSquareKey(`order-${invoiceType}`, job.id),
    order: {
      location_id: settings.squareLocationId,
      customer_id: customerId,
      reference_id: shortSquareReference(job.id, invoiceType),
      line_items: [
        {
          name: title,
          note,
          quantity: "1",
          base_price_money: {
            amount,
            currency: "USD"
          }
        }
      ]
    }
  });

  return result.order;
}

async function createSquareDraftInvoice(job, settings, customerId, orderId, invoiceType) {
  const today = new Date().toISOString().slice(0, 10);
  const title = invoiceType === "deposit" ? "Deposit Invoice" : "Final Invoice";
  const description = invoiceType === "deposit"
    ? `Deposit required before scheduling ${job.serviceType} at ${job.address}.`
    : `Final balance due for completed ${job.serviceType} at ${job.address}.${job.completionProofUrl ? ` Completion photos: ${job.completionProofUrl}` : ""}`;
  const result = await squareRequest(settings, "/v2/invoices", {
    idempotency_key: shortSquareKey(`invoice-${invoiceType}`, job.id),
    invoice: {
      location_id: settings.squareLocationId,
      order_id: orderId,
      primary_recipient: {
        customer_id: customerId
      },
      payment_requests: [
        {
          request_type: "BALANCE",
          due_date: today,
          tipping_enabled: false
        }
      ],
      accepted_payment_methods: {
        card: true,
        square_gift_card: false,
        bank_account: false,
        buy_now_pay_later: false,
        cash_app_pay: false
      },
      delivery_method: "EMAIL",
      title,
      description,
      sale_or_service_date: today,
      store_payment_method_enabled: false
    }
  });

  return result.invoice;
}

async function publishSquareInvoice(settings, invoiceId, version) {
  const result = await squareRequest(settings, `/v2/invoices/${encodeURIComponent(invoiceId)}/publish`, {
    version,
    idempotency_key: shortSquareKey("publish", invoiceId)
  });

  return result.invoice;
}

async function getSquareInvoice(settings, invoiceId) {
  requireSquareSettings(settings);
  if (!invoiceId) {
    throw new Error("No Square invoice ID is stored for this job yet.");
  }

  const result = await squareRequest(
    settings,
    `/v2/invoices/${encodeURIComponent(invoiceId)}`,
    undefined,
    "GET"
  );
  return result.invoice;
}

async function cancelSquareInvoice(settings, invoiceId, version) {
  requireSquareSettings(settings);
  if (!invoiceId || version === undefined || version === null) {
    throw new Error("Square invoice ID and version are required to cancel an invoice.");
  }

  const result = await squareRequest(settings, `/v2/invoices/${encodeURIComponent(invoiceId)}/cancel`, {
    version
  });
  return result.invoice;
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

async function squareRequest(settings, endpoint, payload, method = "POST") {
  const host = settings.squareEnvironment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
  const response = await fetch(`${host}${endpoint}`, {
    method,
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Authorization": `Bearer ${settings.squareAccessToken}`,
      "Content-Type": "application/json"
    },
    body: payload === undefined ? undefined : JSON.stringify(stripUndefined(payload))
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.errors?.map((error) => error.detail || error.code).join("; ");
    throw new Error(message || `Square request failed with status ${response.status}.`);
  }

  return data;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined && entryValue !== "")
        .map(([key, entryValue]) => [key, stripUndefined(entryValue)])
    );
  }
  return value;
}

function splitCustomerName(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) {
    return { givenName: parts[0] || "Customer", familyName: "" };
  }

  return {
    givenName: parts.slice(0, -1).join(" "),
    familyName: parts.at(-1)
  };
}

function normalizePhoneForSquare(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length === 10 && !digits.startsWith("555")) {
    return `+1${digits}`;
  }

  return "";
}

function shortSquareReference(jobId, suffix) {
  return `${compactHash(jobId)}-${suffix}`.slice(0, 40);
}

function shortSquareKey(prefix, value) {
  return `${prefix}-${compactHash(value)}-${Date.now().toString(36)}`.slice(0, 45);
}

function compactHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 16);
}

function getDepositCents(job) {
  return Math.round(Number(job.estimate || 0) * 100 * (Number(job.depositPercent || 0) / 100));
}

function getFinalBalanceCents(job) {
  return Math.max(Math.round(Number(job.estimate || 0) * 100) - getDepositCents(job), 0);
}

async function serveStatic(response, url) {
  const requestedPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendError(response, 403, "Forbidden.");
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
    sendError(response, 500, error.message || "Unexpected server error.");
  }
});

ensureDataFile()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`PressureFlow running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
