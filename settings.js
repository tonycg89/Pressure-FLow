const crypto = require("node:crypto");
const { createInlineFileRecord, publicFileRecord } = require("./storage");

const MAX_CUSTOM_TEMPLATES = 25;
const MAX_TEMPLATE_DATA_URL_BYTES = 7_000_000;
const SETTINGS_LIMITS = Object.freeze({
  businessName: 120,
  businessPhone: 40,
  paymentHandle: 80,
  paymentInstructions: 2000,
  integrationId: 254,
  integrationSecret: 2000,
  reviewUrl: 500
});

const privateSettingKeys = new Set([
  "squareAccessToken",
  "squareWebhookSignatureKey",
  "smtpPassword",
  "stripeSecretKey",
  "stripeWebhookSecret",
  "quickBooksClientSecret",
  "quickBooksRefreshToken",
  "googleClientSecret",
  "googleRefreshToken"
]);

function publicSettings(settings, options = {}) {
  const publicValues = omitPrivateSettings(settings);
  const values = {
    ...publicValues,
    customTemplates: getTemplateMetadata(settings.customTemplates || []),
    hasSquareAccessToken: Boolean(settings.squareAccessToken),
    hasSquareWebhookSignatureKey: Boolean(settings.squareWebhookSignatureKey),
    hasSmtpPassword: Boolean(settings.smtpPassword),
    hasStripeSecretKey: Boolean(settings.stripeSecretKey),
    hasStripeWebhookSecret: Boolean(settings.stripeWebhookSecret),
    hasQuickBooksClientSecret: Boolean(settings.quickBooksClientSecret),
    hasQuickBooksRefreshToken: Boolean(settings.quickBooksRefreshToken),
    hasGoogleClientSecret: Boolean(settings.googleClientSecret),
    hasGoogleRefreshToken: Boolean(settings.googleRefreshToken),
    hasConfiguredInvoicePaymentMethod: hasConfiguredInvoicePaymentMethod(settings)
  };
  if (options.hidePlatformCredentials) {
    values.googleClientId = "";
    values.googleRedirectUri = "";
    values.hasGoogleClientSecret = false;
    values.hasMapboxPublicToken = Boolean(settings.mapboxPublicToken);
  }
  return values;
}

function hasConfiguredInvoicePaymentMethod(settings = {}) {
  return Boolean(
    (settings.squareAccessToken && settings.squareLocationId) ||
    settings.stripeSecretKey ||
    settings.zellePayment ||
    settings.cashAppPayment ||
    settings.venmoPayment ||
    settings.paymentInstructions
  );
}

function requireConfiguredInvoicePaymentMethod(settings = {}) {
  if (hasConfiguredInvoicePaymentMethod(settings)) {
    return;
  }

  const error = new Error("Payment options are not configured yet. Customers will not have a clear way to pay this invoice.");
  error.statusCode = 400;
  error.code = "PAYMENT_OPTIONS_NOT_CONFIGURED";
  throw error;
}

function omitPrivateSettings(settings = {}) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => !privateSettingKeys.has(key))
  );
}

function getTemplateMetadata(templates = []) {
  return templates.map(({ dataUrl, file, ...template }) => ({
    ...template,
    file: publicFileRecord(file)
  }));
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
      uploadedAt: String(template.uploadedAt || new Date().toISOString()),
      file: template.file || null
    }))
    .filter((template) => template.name && isAllowedTemplateDataUrl(template.dataUrl, MAX_TEMPLATE_DATA_URL_BYTES))
    .map((template) => ({
      ...template,
      file: createInlineFileRecord({
        ...template.file,
        id: template.file?.id || template.id,
        accountId: template.file?.accountId || "owner",
        ownerType: "settings",
        ownerId: "customTemplates",
        purpose: "custom-template",
        name: template.fileName,
        mimeType: template.mimeType,
        dataUrl: template.dataUrl,
        createdAt: template.uploadedAt
      })
    }))
    .slice(0, MAX_CUSTOM_TEMPLATES);
}

function normalizeTemplateMimeType(mimeType, fileName = "") {
  const lowerName = String(fileName || "").toLowerCase();
  if (mimeType === "application/msword" || lowerName.endsWith(".doc")) {
    return "application/msword";
  }
  return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function isAllowedTemplateDataUrl(value, maxBytes) {
  const dataUrl = String(value || "").trim();
  return /^data:(application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,/i.test(dataUrl) &&
    Buffer.byteLength(dataUrl, "utf8") <= maxBytes;
}

function normalizeSettings(input, existing) {
  const depositPercent = Number(input.defaultDepositPercent ?? existing.defaultDepositPercent);
  return {
    ...existing,
    businessName: limitText(input.businessName, SETTINGS_LIMITS.businessName),
    businessEmail: normalizeEmail(input.businessEmail),
    businessPhone: limitText(input.businessPhone, SETTINGS_LIMITS.businessPhone),
    serviceIndustry: normalizeServiceIndustry(input.serviceIndustry ?? existing.serviceIndustry),
    customerSegment: normalizeCustomerSegment(input.customerSegment ?? existing.customerSegment),
    onboardingServiceScope: normalizeOnboardingServiceScope(input.onboardingServiceScope ?? existing.onboardingServiceScope),
    businessLogoDataUrl: normalizeBusinessLogoDataUrl(input.businessLogoDataUrl ?? existing.businessLogoDataUrl),
    defaultDepositEnabled: Boolean(input.defaultDepositEnabled ?? existing.defaultDepositEnabled ?? true),
    defaultDepositPercent: Number.isFinite(depositPercent) ? Math.min(Math.max(depositPercent, 0), 100) : 25,
    defaultJobDurationMinutes: normalizeNumber(input.defaultJobDurationMinutes, existing.defaultJobDurationMinutes, 30, 720),
    finalInvoiceTiming: "immediate_after_completion",
    squareEnvironment: ["sandbox", "production"].includes(input.squareEnvironment) ? input.squareEnvironment : existing.squareEnvironment || "sandbox",
    squareAccessToken: normalizePrivateSetting(input, existing, "squareAccessToken"),
    squareLocationId: limitText(input.squareLocationId, SETTINGS_LIMITS.integrationId) || existing.squareLocationId || "",
    squareWebhookSignatureKey: normalizePrivateSetting(input, existing, "squareWebhookSignatureKey"),
    emailSendProvider: ["google", "smtp"].includes(input.emailSendProvider) ? input.emailSendProvider : existing.emailSendProvider || "google",
    smtpHost: limitText(input.smtpHost, SETTINGS_LIMITS.integrationId),
    smtpPort: normalizeNumber(input.smtpPort, existing.smtpPort || 587, 1, 65535),
    smtpSecurity: ["ssl", "starttls", "none"].includes(input.smtpSecurity) ? input.smtpSecurity : existing.smtpSecurity || "starttls",
    smtpUsername: limitText(input.smtpUsername, SETTINGS_LIMITS.integrationId),
    smtpPassword: normalizePrivateSetting(input, existing, "smtpPassword"),
    smtpFromEmail: normalizeEmail(input.smtpFromEmail),
    stripeSecretKey: normalizePrivateSetting(input, existing, "stripeSecretKey"),
    stripeWebhookSecret: normalizePrivateSetting(input, existing, "stripeWebhookSecret"),
    quickBooksCompanyId: limitText(input.quickBooksCompanyId, SETTINGS_LIMITS.integrationId) || existing.quickBooksCompanyId || "",
    quickBooksClientId: limitText(input.quickBooksClientId, SETTINGS_LIMITS.integrationId) || existing.quickBooksClientId || "",
    quickBooksClientSecret: normalizePrivateSetting(input, existing, "quickBooksClientSecret"),
    quickBooksRedirectUri: normalizeUrl(input.quickBooksRedirectUri) || existing.quickBooksRedirectUri || "",
    quickBooksRefreshToken: normalizePrivateSetting(input, existing, "quickBooksRefreshToken"),
    googleClientId: Object.hasOwn(input, "googleClientId") ? limitText(input.googleClientId, SETTINGS_LIMITS.integrationId) : existing.googleClientId || "",
    googleClientSecret: normalizePrivateSetting(input, existing, "googleClientSecret"),
    googleRedirectUri: Object.hasOwn(input, "googleRedirectUri") ? normalizeUrl(input.googleRedirectUri) || existing.googleRedirectUri : existing.googleRedirectUri,
    googleCalendarId: limitText(input.googleCalendarId, SETTINGS_LIMITS.integrationId),
    mapboxPublicToken: limitText(input.mapboxPublicToken, SETTINGS_LIMITS.integrationSecret) || existing.mapboxPublicToken,
    zellePayment: limitText(input.zellePayment, SETTINGS_LIMITS.paymentHandle),
    cashAppPayment: limitText(input.cashAppPayment, SETTINGS_LIMITS.paymentHandle),
    venmoPayment: limitText(input.venmoPayment, SETTINGS_LIMITS.paymentHandle),
    paymentInstructions: limitText(input.paymentInstructions, SETTINGS_LIMITS.paymentInstructions),
    paymentFollowUpHours: normalizePaymentFollowUpHours(input.paymentFollowUpHours ?? existing.paymentFollowUpHours),
    estimateFollowUpEnabled: normalizeBoolean(input.estimateFollowUpEnabled ?? existing.estimateFollowUpEnabled ?? true),
    estimateFollowUpDelayHours: normalizeEstimateFollowUpDelayHours(input.estimateFollowUpDelayHours ?? existing.estimateFollowUpDelayHours),
    estimateFollowUpSubject: normalizeShortTemplate(input.estimateFollowUpSubject || existing.estimateFollowUpSubject || ""),
    estimateFollowUpBody: normalizeLongText(input.estimateFollowUpBody || existing.estimateFollowUpBody || ""),
    reviewRequestEnabled: normalizeBoolean(input.reviewRequestEnabled ?? existing.reviewRequestEnabled ?? true),
    reviewRequestDelayHours: normalizeReviewRequestDelayHours(input.reviewRequestDelayHours ?? existing.reviewRequestDelayHours),
    reviewRequestSubject: normalizeShortTemplate(input.reviewRequestSubject || existing.reviewRequestSubject || ""),
    reviewRequestBody: normalizeLongText(input.reviewRequestBody || existing.reviewRequestBody || ""),
    googleReviewUrl: normalizeUrl(input.googleReviewUrl ?? existing.googleReviewUrl),
    yelpReviewUrl: normalizeUrl(input.yelpReviewUrl ?? existing.yelpReviewUrl),
    facebookReviewUrl: normalizeUrl(input.facebookReviewUrl ?? existing.facebookReviewUrl),
    otherReviewUrl: normalizeUrl(input.otherReviewUrl ?? existing.otherReviewUrl),
    dayOfServiceInstructions: normalizeLongText(input.dayOfServiceInstructions ?? existing.dayOfServiceInstructions),
    onboardingCompleted: Boolean(input.onboardingCompleted ?? existing.onboardingCompleted),
    customTemplates: normalizeCustomTemplates(existing.customTemplates),
    customServices: normalizeCustomServices(input.customServices ?? existing.customServices),
    customServiceTypes: normalizeStringList(input.customServiceTypes ?? existing.customServiceTypes),
    customPhotoSections: normalizeStringList(input.customPhotoSections ?? existing.customPhotoSections)
  };
}

function normalizePaymentFollowUpHours(value) {
  const allowed = new Set([0, 24, 48, 72, 168]);
  const hours = Number(value);
  return allowed.has(hours) ? hours : 48;
}

function normalizeEstimateFollowUpDelayHours(value) {
  const allowed = new Set([24, 48, 72, 168]);
  const hours = Number(value);
  return allowed.has(hours) ? hours : 24;
}

function normalizeReviewRequestDelayHours(value) {
  const allowed = new Set([24, 48, 72, 168]);
  const hours = Number(value);
  return allowed.has(hours) ? hours : 24;
}

function normalizeShortTemplate(value) {
  return String(value || "").trim().slice(0, 180);
}

function validateSettingsInput(input = {}) {
  if (Object.hasOwn(input, "businessEmail")) {
    const email = String(input.businessEmail || "").trim();
    if (email && !isValidEmail(email)) {
      return "Business email must be a valid email address.";
    }
  }
  return "";
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "on" || value === "1";
}

function normalizePrivateSetting(input, existing, key) {
  if (!privateSettingKeys.has(key)) {
    return "";
  }

  const submittedValue = Object.hasOwn(input, key) ? limitText(input[key], SETTINGS_LIMITS.integrationSecret) : "";
  return submittedValue || existing[key] || "";
}

function normalizeCustomerSegment(value) {
  return ["residential", "commercial", "both"].includes(value) ? value : "residential";
}

function normalizeOnboardingServiceScope(value) {
  return ["starter", "recommended", "full", "custom"].includes(value) ? value : "recommended";
}

function normalizeLongText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, 5000);
}

function normalizeCustomServices(value) {
  return (Array.isArray(value) ? value : [])
    .map((service) => ({
      id: String(service.id || crypto.randomUUID()),
      source: service.source === "onboarding" ? "onboarding" : "custom",
      name: String(service.name || "").trim().slice(0, 100),
      unit: normalizeServiceUnit(service.unit),
      price: normalizeMoneyNumber(service.price, 0, 1_000_000)
    }))
    .filter((service) => service.name)
    .slice(0, 100);
}

function normalizeStringList(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim().slice(0, 100))
    .filter(Boolean))]
    .slice(0, 100);
}

function normalizeServiceUnit(value) {
  const aliases = { QTY: "Qty", LNF: "LFN" };
  const normalized = aliases[String(value || "").trim()] || String(value || "").trim();
  return ["Qty", "SqFt", "Hours", "LFN", "Each"].includes(normalized) ? normalized : "Qty";
}

function normalizeServiceIndustry(value) {
  const industry = String(value || "").trim();
  return ["Pressure Washing", "Landscaping", "Handyman", "Construction", "Misc"].includes(industry) ? industry : "";
}

function normalizeMoneyNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(Math.max(number, min), max);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().slice(0, 254);
  return !email || isValidEmail(email) ? email : "";
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  return email.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function normalizeUrl(value) {
  const raw = String(value || "").trim().slice(0, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeBusinessLogoDataUrl(value) {
  const logo = String(value || "").trim();
  if (!logo) {
    return "";
  }
  return isAllowedImageDataUrl(logo, 900000) ? logo : "";
}

function isAllowedImageDataUrl(value, maxBytes) {
  const dataUrl = String(value || "").trim();
  return /^data:image\/(png|jpe?g|webp);base64,/i.test(dataUrl) &&
    Buffer.byteLength(dataUrl, "utf8") <= maxBytes;
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

module.exports = {
  MAX_CUSTOM_TEMPLATES,
  MAX_TEMPLATE_DATA_URL_BYTES,
  SETTINGS_LIMITS,
  getTemplateMetadata,
  isAllowedImageDataUrl,
  normalizeCustomTemplates,
  normalizeServiceUnit,
  normalizeSettings,
  publicSettings,
  hasConfiguredInvoicePaymentMethod,
  requireConfiguredInvoicePaymentMethod,
  validateSettingsInput
};
