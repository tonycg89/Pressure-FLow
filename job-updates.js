const { statuses } = require("./db");
const {
  buildFullAddress,
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

module.exports = {
  didPricingChange,
  normalizeComparableLineItems,
  resetJobForPricingChange,
  updateJob
};
