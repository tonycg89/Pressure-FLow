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
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
};
