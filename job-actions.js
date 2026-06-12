const {
  formatAlertCustomer,
  formatAlertMoney,
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const {
  buildCompletionNotice,
  buildContractMailto,
  buildEstimateMailto
} = require("./email-content");
const {
  buildCompletionProofUrl,
  buildContractApprovalUrl,
  buildEstimateApprovalUrl
} = require("./public-workflows");
const { getNextStatus, normalizeJobPhotos } = require("./records");
const { formatScheduledWindow } = require("./scheduling");

function createJobActionHandler({
  createGoogleCalendarEvent,
  createPressureFlowInvoice,
  readSettings,
  randomToken,
  sendAdminTextAlertSafe,
  sendCompletionCertificateEmailSafe,
  sendContractEmail,
  sendEstimateEmail,
  sendScheduleConfirmationEmail,
  writeSettings
}) {
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
      if (job.estimateSentAt && job.estimateApprovalToken && job.estimateApprovalUrl) {
        job.status = job.status || "Estimate Sent";
        return;
      }

      const settings = await readSettings();
      job.status = "Estimate Sent";
      job.estimateApprovalToken = job.estimateApprovalToken || randomToken();
      job.estimateApprovalUrl = buildEstimateApprovalUrl(input._baseUrl, job);
      job.estimateMailto = buildEstimateMailto(job, settings);
      try {
        await sendEstimateEmail(job, settings);
      } catch (error) {
        await clearRevokedGoogleToken(settings, error, writeSettings);
        throw error;
      }
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
      if (job.contractSentAt && job.contractApprovalToken && job.contractApprovalUrl) {
        job.status = job.status || "Contract Sent";
        return;
      }

      const settings = await readSettings();
      job.status = "Contract Sent";
      job.contractApprovalToken = job.contractApprovalToken || randomToken();
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
      recordManualPayment(job, "deposit", input);
      await sendAdminTextAlertSafe(`PressureFlow: Deposit marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    }

    if (action === "check-deposit-payment") {
      job.status = "Deposit Paid";
      job.squareDepositInvoiceStatus = "PAID";
      job.squareDepositPaidAt = new Date().toISOString();
      recordAutomaticPayment(job, "deposit", "Square");
      await sendAdminTextAlertSafe(`PressureFlow: Deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    }

    if (action === "complete") {
      const settings = await readSettings();
      if (Object.hasOwn(input, "jobPhotos")) {
        job.jobPhotos = normalizeJobPhotos(input.jobPhotos);
      }
      job.completionProofToken = job.completionProofToken || randomToken();
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
      recordManualPayment(job, "final", input);
      await sendCompletionCertificateEmailSafe(job, settings, input._baseUrl);
      await sendAdminTextAlertSafe(`PressureFlow: Final invoice marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    if (action === "check-final-payment") {
      const settings = await readSettings();
      job.status = "Paid";
      job.squareFinalInvoiceStatus = "PAID";
      job.squareFinalPaidAt = new Date().toISOString();
      recordAutomaticPayment(job, "final", "Square");
      await sendCompletionCertificateEmailSafe(job, settings, input._baseUrl);
      await sendAdminTextAlertSafe(`PressureFlow: Final invoice paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }
  }

  return { applyAction };
}

function recordManualPayment(job, invoiceType, input = {}) {
  recordPayment(job, {
    invoiceType,
    source: "manual",
    method: normalizePaymentMethod(input.paymentMethod),
    reference: String(input.paymentReference || "").trim().slice(0, 120),
    amount: invoiceType === "deposit" ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100
  });
}

function recordAutomaticPayment(job, invoiceType, method) {
  recordPayment(job, {
    invoiceType,
    source: "auto",
    method,
    reference: "",
    amount: invoiceType === "deposit" ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100
  });
}

function recordPayment(job, payment) {
  const records = Array.isArray(job.paymentRecords) ? job.paymentRecords : [];
  const existingIndex = records.findIndex((item) => item.invoiceType === payment.invoiceType);
  const record = {
    id: `${payment.invoiceType}-${Date.now()}`,
    invoiceType: payment.invoiceType,
    source: payment.source,
    method: payment.method,
    reference: payment.reference,
    amount: Number(payment.amount || 0),
    paidAt: new Date().toISOString(),
    quickBooksSyncStatus: "pending"
  };

  job.paymentRecords = existingIndex >= 0
    ? records.map((item, index) => index === existingIndex ? record : item)
    : [...records, record];
}

function normalizePaymentMethod(value) {
  const allowed = new Set(["Venmo", "Zelle", "Cash App", "Cash", "Check", "Other"]);
  const method = String(value || "").trim();
  return allowed.has(method) ? method : "Other";
}

async function clearRevokedGoogleToken(settings, error, writeSettings) {
  if (error?.code !== "GOOGLE_AUTH_REVOKED" || !settings?.googleRefreshToken || typeof writeSettings !== "function") {
    return;
  }

  settings.googleRefreshToken = "";
  await writeSettings(settings);
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

module.exports = {
  clearRevokedGoogleToken,
  createJobActionHandler,
  normalizeNumber
};
