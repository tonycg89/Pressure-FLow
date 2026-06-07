const crypto = require("node:crypto");
const { defaultSettings, statuses } = require("./db");
const { createInlineFileRecord } = require("./storage");
const { isAllowedImageDataUrl, normalizeServiceUnit } = require("./settings");

const MAX_PHOTOS_PER_COLLECTION = 40;
const MAX_PHOTO_DATA_URL_BYTES = 1_500_000;

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
    name: String(item.name || "").trim().slice(0, 100),
    unit: normalizeServiceUnit(item.unit),
    quantity: normalizePositiveNumber(item.quantity, 0, 1_000_000),
    price: normalizePositiveNumber(item.price, 0, 1_000_000),
    total: normalizePositiveNumber(item.total, 0, 100_000_000)
  })).filter((item) => item.name && item.quantity > 0);
}

function normalizePositiveNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
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

  return photos
    .map((photo) => normalizePhoto(photo))
    .filter((photo) => isAllowedImageDataUrl(photo.dataUrl, MAX_PHOTO_DATA_URL_BYTES))
    .slice(0, MAX_PHOTOS_PER_COLLECTION);
}

function normalizePhoto(photo = {}) {
  const normalized = {
    id: String(photo.id || crypto.randomUUID()),
    name: String(photo.name || "Photo").trim(),
    section: String(photo.section || "").trim(),
    dataUrl: String(photo.dataUrl || "").trim(),
    capturedAt: String(photo.capturedAt || new Date().toISOString())
  };
  normalized.file = createInlineFileRecord({
    ...photo.file,
    id: photo.file?.id || normalized.id,
    accountId: photo.file?.accountId || "owner",
    ownerType: photo.file?.ownerType || "inline-photo",
    ownerId: photo.file?.ownerId || "",
    purpose: photo.file?.purpose || normalized.section || "photo",
    name: normalized.name,
    mimeType: getDataUrlMimeType(normalized.dataUrl),
    dataUrl: normalized.dataUrl,
    createdAt: normalized.capturedAt
  });
  return normalized;
}

function getDataUrlMimeType(dataUrl) {
  return String(dataUrl || "").match(/^data:([^;,]+)[;,]/i)?.[1] || "";
}

function csvEscape(value) {
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

module.exports = {
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
};
