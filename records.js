const crypto = require("node:crypto");
const { defaultSettings, statuses } = require("./db");
const { createInlineFileRecord } = require("./storage");
const { isAllowedImageDataUrl, normalizeServiceUnit } = require("./settings");

const MAX_PHOTOS_PER_COLLECTION = 40;
const MAX_PHOTO_DATA_URL_BYTES = 1_500_000;
const MAX_EXPENSE_AMOUNT = 1_000_000;
const FIELD_LIMITS = Object.freeze({
  customerName: 120,
  email: 254,
  phone: 40,
  address: 300,
  streetAddress: 160,
  addressUnit: 40,
  city: 80,
  state: 2,
  zip: 20,
  serviceType: 120,
  jobNotes: 2000,
  expenseVendor: 120,
  expenseCategory: 80,
  expenseNotes: 1000,
  publicSignerName: 120
});

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
    customerId: limitText(input.customerId, FIELD_LIMITS.email),
    customerName: limitText(input.customerName, FIELD_LIMITS.customerName),
    email: limitText(input.email, FIELD_LIMITS.email),
    phone: limitText(input.phone, FIELD_LIMITS.phone),
    ...addressParts,
    address: limitText(input.address || buildFullAddress(addressParts), FIELD_LIMITS.address),
    serviceType: limitText(input.serviceType || "Driveway cleaning", FIELD_LIMITS.serviceType),
    leadSource: normalizeLeadSource(input.leadSource),
    estimate: Number(input.estimate || 0),
    lineItems: normalizeLineItems(input.lineItems),
    measurement: normalizeMeasurement(input.measurement),
    jobPhotos: normalizeJobPhotos(input.jobPhotos),
    discountPercent: Number(input.discountPercent || 0),
    depositPercent: Number(input.depositPercent ?? defaultSettings.defaultDepositPercent),
    notes: limitText(input.notes, FIELD_LIMITS.jobNotes),
    accessNotes: limitText(input.accessNotes, FIELD_LIMITS.jobNotes),
    sensitiveAreas: limitText(input.sensitiveAreas, FIELD_LIMITS.jobNotes),
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
    paymentRecords: [],
    suppressEstimateFollowUp: false,
    preferredDeliveryMethod: "email",
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
    customerName: limitText(input.customerName || existing.customerName, FIELD_LIMITS.customerName),
    email: limitText(input.email || existing.email, FIELD_LIMITS.email),
    phone: limitText(input.phone || existing.phone, FIELD_LIMITS.phone),
    ...addressParts,
    address: limitText(input.address || buildFullAddress(addressParts) || existing.address, FIELD_LIMITS.address),
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
    streetAddress: limitText(input.streetAddress ?? existing.streetAddress, FIELD_LIMITS.streetAddress),
    addressUnit: limitText(input.addressUnit ?? existing.addressUnit, FIELD_LIMITS.addressUnit),
    city: limitText(input.city ?? existing.city, FIELD_LIMITS.city),
    state: limitText(input.state ?? existing.state, FIELD_LIMITS.state).toUpperCase(),
    zip: limitText(input.zip ?? existing.zip, FIELD_LIMITS.zip)
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
        label: limitText(item.label || "Service area", FIELD_LIMITS.serviceType),
        address: limitText(item.address || measurement.address, FIELD_LIMITS.address),
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
    jobId: String(input.jobId ?? existing.jobId ?? "").trim(),
    vendor: limitText(input.vendor || existing.vendor, FIELD_LIMITS.expenseVendor),
    category: limitText(input.category || existing.category, FIELD_LIMITS.expenseCategory),
    amount: normalizeMoneyDollars(input.amount ?? existing.amount ?? 0),
    expenseDate: String(input.expenseDate || existing.expenseDate || new Date().toISOString().slice(0, 10)).slice(0, 10),
    notes: limitText(input.notes || existing.notes, FIELD_LIMITS.expenseNotes),
    receiptPhotos: normalizePhotos(input.receiptPhotos ?? existing.receiptPhotos),
    createdAt: existing.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function normalizeMoneyDollars(value) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return NaN;
  return Math.round(amount * 100) / 100;
}

function validateExpense(expense) {
  if (!expense.vendor) return "Vendor is required.";
  if (!Number.isFinite(expense.amount) || expense.amount < 0) return "Expense amount must be 0 or greater.";
  if (expense.amount > MAX_EXPENSE_AMOUNT) return "Expense amount must be $1,000,000 or less.";
  if (!isValidDateOnly(expense.expenseDate)) return "Expense date must be a real date in YYYY-MM-DD format.";
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
  if (customer.email && !isValidEmail(customer.email)) return "Customer email must be a valid email address.";
  if ((customer.propertyMeasurements || []).some((item) => !isSafeStaticImageUrl(item.measurement?.staticImageUrl))) {
    return "Measurement preview image URL must be empty, http(s), or a valid image data URL.";
  }
  return "";
}

function validateJob(job) {
  if (!job.customerName) return "Customer name is required.";
  if (!job.email) return "Email is required.";
  if (!isValidEmail(job.email)) return "Job email must be a valid email address.";
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
  if (job.scheduledAt && !isValidLocalDateTime(job.scheduledAt)) {
    return "Scheduled date/time must be a real date and time.";
  }
  if (!isSafeStaticImageUrl(job.measurement?.staticImageUrl)) {
    return "Measurement preview image URL must be empty, http(s), or a valid image data URL.";
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
        name: limitText(area.name || area.label || `Service area ${index + 1}`, FIELD_LIMITS.serviceType),
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
  if (!normalizedAreas.length && !measurement.geojson && !measurement.staticImageUrl) {
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
    address: limitText(measurement.address, FIELD_LIMITS.address),
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
    name: limitText(photo.name || "Photo", FIELD_LIMITS.serviceType),
    section: limitText(photo.section, FIELD_LIMITS.serviceType),
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

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  return email.length <= FIELD_LIMITS.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function isValidDateOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function isValidLocalDateTime(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !isValidDateOnly(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function isSafeStaticImageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return true;
  if (isAllowedImageDataUrl(url, MAX_PHOTO_DATA_URL_BYTES)) return true;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
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
  FIELD_LIMITS,
  MAX_EXPENSE_AMOUNT,
  buildFullAddress,
  getNextStatus,
  isSafeStaticImageUrl,
  isValidDateOnly,
  isValidEmail,
  isValidLocalDateTime,
  jobsToCsv,
  limitText,
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
