const { statuses } = require("./db");
const { normalizeDiscountType } = require("./billing");
const {
  buildFullAddress,
  FIELD_LIMITS,
  limitText,
  normalizeJobPhotos,
  normalizeLineItems,
  normalizeMeasurement
} = require("./records");

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
      job[field] = limitText(input[field], getJobFieldLimit(field));
    }
  });

  if (["streetAddress", "addressUnit", "city", "state", "zip"].some((field) => Object.hasOwn(input, field))) {
    job.state = String(job.state || "").trim().toUpperCase();
    job.address = limitText(input.address || buildFullAddress(job) || job.address, FIELD_LIMITS.address);
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

  if (Object.hasOwn(input, "discountType") || Object.hasOwn(input, "discountValue") || Object.hasOwn(input, "discountPercent")) {
    const discountType = normalizeDiscountType(input.discountType ?? job.discountType);
    const discountValue = input.discountValue !== undefined && input.discountValue !== null && input.discountValue !== ""
      ? Number(input.discountValue)
      : Number(input.discountPercent ?? job.discountValue ?? job.discountPercent ?? 0);
    job.discountType = discountType;
    job.discountValue = discountValue;
    job.discountPercent = discountType === "percent" ? discountValue : 0;
  }

  if (Object.hasOwn(input, "depositPercent")) {
    job.depositPercent = Number(input.depositPercent);
  }
}

function didPricingChange(job, input) {
  if (Object.hasOwn(input, "estimate") && Number(input.estimate) !== Number(job.estimate || 0)) {
    return true;
  }
  if (
    (Object.hasOwn(input, "discountType") || Object.hasOwn(input, "discountValue") || Object.hasOwn(input, "discountPercent")) &&
    (
      normalizeDiscountType(input.discountType ?? job.discountType) !== normalizeDiscountType(job.discountType) ||
      Number(input.discountValue ?? input.discountPercent ?? 0) !== Number(job.discountValue ?? job.discountPercent ?? 0)
    )
  ) {
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

async function resetJobForPricingChange(job, cancelStoredInvoiceIfPossible) {
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

function getJobFieldLimit(field) {
  return {
    customerName: FIELD_LIMITS.customerName,
    customerId: FIELD_LIMITS.email,
    email: FIELD_LIMITS.email,
    phone: FIELD_LIMITS.phone,
    address: FIELD_LIMITS.address,
    serviceType: FIELD_LIMITS.serviceType,
    notes: FIELD_LIMITS.jobNotes,
    accessNotes: FIELD_LIMITS.jobNotes,
    sensitiveAreas: FIELD_LIMITS.jobNotes,
    squareEstimateId: FIELD_LIMITS.email,
    squareEstimateUrl: FIELD_LIMITS.address,
    squareContractId: FIELD_LIMITS.email,
    squareContractUrl: FIELD_LIMITS.address,
    leadSource: FIELD_LIMITS.serviceType
  }[field] || FIELD_LIMITS.address;
}

module.exports = {
  didPricingChange,
  normalizeComparableLineItems,
  resetJobForPricingChange,
  updateJob
};
