const crypto = require("node:crypto");
const { getDepositCents, getFinalBalanceCents } = require("./billing");
const { createStripeCheckoutSessionRequest } = require("./integrations/stripe");
const { buildInvoiceUrl } = require("./public-workflows");

function createPaymentHandlers({
  cancelSquareInvoice,
  getSquareInvoice,
  isSquareInvoicePaid,
  itemWorkspaceId,
  readSettingsForJob,
  sendPressureFlowInvoiceEmail,
  warn = console.warn
}) {
  async function createPressureFlowInvoice(job, settings, invoiceType, baseUrl) {
    const invoiceId = invoiceType === "deposit"
      ? job.squareDepositInvoiceId || `pf-deposit-${crypto.randomBytes(16).toString("hex")}`
      : job.squareFinalInvoiceId || `pf-final-${crypto.randomBytes(16).toString("hex")}`;
    const publicUrl = buildInvoiceUrl(baseUrl, job, invoiceType, invoiceId);

    await sendPressureFlowInvoiceEmail(job, settings, invoiceType, publicUrl);
    return { invoiceId, publicUrl };
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
      warn(`Unable to cancel ${invoiceType} invoice ${invoiceId}: ${error.message}`);
    }
  }

  return {
    cancelStoredInvoiceIfPossible,
    createPressureFlowInvoice,
    createStripeCheckoutSession
  };
}

module.exports = {
  createPaymentHandlers
};
