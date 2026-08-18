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

function formatAlertMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function roundMoney(amount) {
  return Math.round(Number(amount || 0) * 100) / 100;
}

function getEstimateSubtotal(job) {
  return roundMoney((job.lineItems || []).reduce((sum, item) => sum + Number(item.total || 0), 0));
}

function normalizeDiscountType(value) {
  return value === "flat" ? "flat" : "percent";
}

function getDiscountValue(job) {
  if (job.discountValue !== undefined && job.discountValue !== null && job.discountValue !== "") {
    return Number(job.discountValue);
  }
  return Number(job.discountPercent || 0);
}

function getEstimateDiscount(job) {
  const subtotal = getEstimateSubtotal(job);
  const type = normalizeDiscountType(job.discountType);
  const rawValue = getDiscountValue(job);
  const value = Number.isFinite(rawValue) ? Math.max(rawValue, 0) : 0;
  const discountAmount = type === "flat"
    ? Math.min(value, subtotal)
    : subtotal * (Math.min(value, 100) / 100);
  return {
    type,
    value,
    subtotal,
    amount: roundMoney(discountAmount)
  };
}

function formatAlertCustomer(job) {
  return `${job.customerName || "Customer"} - ${job.address || "No address"}`;
}

function getDepositCents(job) {
  return Math.round(Number(job.estimate || 0) * 100 * (Number(job.depositPercent || 0) / 100));
}

function getFinalBalanceCents(job) {
  return Math.max(Math.round(Number(job.estimate || 0) * 100) - getDepositCents(job), 0);
}

module.exports = {
  formatAlertCustomer,
  formatAlertMoney,
  getEstimateDiscount,
  getEstimateSubtotal,
  getDepositCents,
  getFinalBalanceCents,
  normalizeDiscountType,
  getPressureFlowInvoiceNumber
};
