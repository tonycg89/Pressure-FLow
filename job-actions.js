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
const { getNextStatus, isValidLocalDateTime, normalizeJobPhotos } = require("./records");
const { formatScheduledWindow } = require("./scheduling");
const { isAuditGoogleMockEnabled } = require("./email-delivery");

function createJobActionHandler({
  cancelManualFollowUp = async () => {},
  cancelPendingFollowUp = async () => {},
  createGoogleCalendarEvent,
  createPressureFlowInvoice,
  readSettings,
  randomToken,
  scheduleFollowUp = async () => {},
  scheduleEstimateFollowUp = async () => {},
  sendAdminTextAlertSafe,
  sendCompletionNoticeEmail = async () => {},
  sendContractEmail,
  sendEstimateEmail,
  sendManualEstimateFollowUp = async () => {},
  sendScheduleConfirmationEmail,
  setSuppressEstimateFollowUp = async (job, suppressed) => {
    job.suppressEstimateFollowUp = Boolean(suppressed);
  },
  requireConfiguredInvoicePaymentMethod = () => {},
  writeSettings
}) {
  async function applyAction(job, action, input) {
    applyDeliveryPreference(job, action);

    if (action === "advance") {
      const previousStatus = job.status;
      job.status = getNextStatus(job.status);
      if (previousStatus === "Estimate Sent" && job.status !== "Estimate Sent") {
        await cancelPendingFollowUp(job.id, "approved", job.accountId || "owner");
      }
      if (previousStatus === "Contract Sent" && job.status !== "Contract Sent") {
        await cancelPendingFollowUp(job.id, "signed", job.accountId || "owner", "contract_followup");
      }
      if (previousStatus === "Deposit Sent" && job.status !== "Deposit Sent") {
        await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "deposit_followup");
      }
      if (previousStatus === "Final Invoice Sent" && job.status !== "Final Invoice Sent") {
        await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "invoice_followup");
      }
    }

    if (action === "schedule") {
      const settings = await readSettings();
      const scheduledAt = input.scheduledAt || "";
      if (!isValidLocalDateTime(scheduledAt)) {
        throw validationError("Schedule date/time must be a real date and time.");
      }
      const duration = normalizeNumber(
        input.jobDurationMinutes,
        settings.defaultJobDurationMinutes,
        30,
        720
      );
      const calendarEvent = shouldCreateGoogleCalendarEvent(settings)
        ? await createGoogleCalendarEvent(settings, job, scheduledAt, duration)
        : {};
      job.status = "Scheduled";
      job.scheduledAt = scheduledAt;
      job.scheduledEventAt = new Date().toISOString();
      job.jobDurationMinutes = duration;
      if (calendarEvent.id !== undefined) {
        job.googleCalendarEventId = calendarEvent.id;
      }
      if (calendarEvent.htmlLink !== undefined) {
        job.googleCalendarEventUrl = calendarEvent.htmlLink || "";
      }
      await sendScheduleConfirmationEmail(job, settings, input._baseUrl);
      await sendAdminTextAlertSafe(`PressureFlow: Job scheduled for ${formatAlertCustomer(job)}. ${formatScheduledWindow(job)}.`);
    }

    if (action === "send-square-estimate" || action === "resend-estimate-email" || action === "send-estimate-text") {
      const isEmailDelivery = action !== "send-estimate-text";
      if (action === "send-square-estimate" && job.estimateSentAt && job.estimateApprovalToken && job.estimateApprovalUrl && job.estimateEmailStatus !== "failed") {
        job.status = job.status || "Estimate Sent";
        await scheduleEstimateFollowUp(job, await readSettings());
        return;
      }

      const settings = await readSettings();
      job.status = "Estimate Sent";
      job.estimateApprovalToken = job.estimateApprovalToken || randomToken();
      job.estimateApprovalUrl = buildEstimateApprovalUrl(input._baseUrl, job);
      job.estimateMailto = buildEstimateMailto(job, settings);
      job.squareEstimateId = job.squareEstimateId || `pressureflow-estimate-${Date.now()}`;
      job.squareEstimateUrl = job.estimateApprovalUrl;
      if (!isEmailDelivery) {
        job.estimateTextPreparedAt = new Date().toISOString();
      } else {
        await sendEstimateEmail(job, settings);
        job.estimateEmailStatus = "sent";
        job.estimateEmailError = "";
        job.estimateEmailFailedAt = "";
      }
      job.estimateSentAt = new Date().toISOString();
      job.estimateRejectedAt = "";
      job.estimateRejectionReason = "";
      job.estimateRejectionNote = "";
      await scheduleEstimateFollowUp(job, settings);
    }

    if (action === "mark-estimate-signed") {
      job.status = "Estimate Signed";
      await cancelPendingFollowUp(job.id, "approved", job.accountId || "owner");
    }

    if (action === "send-contract" || action === "resend-contract-email" || action === "send-contract-text") {
      const isEmailDelivery = action !== "send-contract-text";
      if (action === "send-contract" && job.contractSentAt && job.contractApprovalToken && job.contractApprovalUrl) {
        if (job.status === "Estimate Sent") {
          await cancelPendingFollowUp(job.id, "approved", job.accountId || "owner");
        }
        job.status = "Contract Sent";
        await scheduleFollowUp(job, await readSettings(), "contract_followup");
        return;
      }

      const settings = await readSettings();
      await cancelPendingFollowUp(job.id, "approved", job.accountId || "owner");
      job.status = "Contract Sent";
      job.contractApprovalToken = job.contractApprovalToken || randomToken();
      job.contractApprovalUrl = buildContractApprovalUrl(input._baseUrl, job);
      job.contractMailto = buildContractMailto(job, settings);
      if (!isEmailDelivery) {
        job.contractTextPreparedAt = new Date().toISOString();
      } else {
        await sendContractEmail(job, settings);
        job.contractSentAt = new Date().toISOString();
      }
      job.contractSentAt = job.contractSentAt || new Date().toISOString();
      job.squareContractId = job.squareContractId || `pressureflow-contract-${Date.now()}`;
      job.squareContractUrl = job.contractApprovalUrl;
      await scheduleFollowUp(job, settings, "contract_followup");
    }

    if (action === "send-estimate-follow-up") {
      const settings = await readSettings();
      await sendManualEstimateFollowUp(job, settings);
    }

    if (action === "cancel-estimate-follow-up") {
      await cancelManualFollowUp(job);
    }

    if (action === "suppress-estimate-follow-up") {
      await setSuppressEstimateFollowUp(job, input.suppressed);
    }

    if (action === "mark-contract-signed") {
      job.status = "Contract Signed";
      await cancelPendingFollowUp(job.id, "signed", job.accountId || "owner", "contract_followup");
    }

    if (action === "send-deposit-invoice" || action === "resend-deposit-invoice-email" || action === "send-deposit-invoice-text") {
      const settings = await readSettings();
      await cancelPendingFollowUp(job.id, "signed", job.accountId || "owner", "contract_followup");
      if (getDepositCents(job) <= 0) {
        job.status = "Contract Signed";
        job.squareDepositInvoiceId = "";
        job.squareDepositInvoiceUrl = "";
        job.squareDepositInvoiceStatus = "";
        return { job, jobs };
      }
      requireConfiguredInvoicePaymentMethod(settings);
      const invoice = await createPressureFlowInvoice(job, settings, "deposit", input._baseUrl, {
        sendEmail: action !== "send-deposit-invoice-text"
      });
      job.status = "Deposit Sent";
      job.squareDepositInvoiceId = invoice.invoiceId;
      job.squareDepositInvoiceUrl = invoice.publicUrl;
      if (action === "send-deposit-invoice-text") {
        job.depositInvoiceTextPreparedAt = new Date().toISOString();
      }
      await scheduleFollowUp(job, settings, "deposit_followup");
    }

    if (action === "mark-deposit-paid") {
      job.status = "Deposit Paid";
      job.squareDepositInvoiceStatus = "PAID";
      job.squareDepositPaidAt = job.squareDepositPaidAt || new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "deposit_followup");
      recordManualPayment(job, "deposit", input);
      await sendAdminTextAlertSafe(`PressureFlow: Deposit marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    }

    if (action === "check-deposit-payment") {
      job.status = "Deposit Paid";
      job.squareDepositInvoiceStatus = "PAID";
      job.squareDepositPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "deposit_followup");
      recordAutomaticPayment(job, "deposit", "Square");
      await sendAdminTextAlertSafe(`PressureFlow: Deposit paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "deposit")} ${formatAlertMoney(getDepositCents(job) / 100)}.`);
    }

    if (action === "complete" || action === "complete-text") {
      const settings = await readSettings();
      requireConfiguredInvoicePaymentMethod(settings);
      if (Object.hasOwn(input, "jobPhotos")) {
        job.jobPhotos = normalizeJobPhotos(input.jobPhotos);
      }
      job.completionProofToken = job.completionProofToken || randomToken();
      job.completionProofUrl = buildCompletionProofUrl(input._baseUrl, job);
      const invoice = job.squareFinalInvoiceId
        ? { invoiceId: job.squareFinalInvoiceId, publicUrl: job.squareFinalInvoiceUrl }
        : await createPressureFlowInvoice(job, settings, "final", input._baseUrl, {
          sendEmail: action !== "complete-text"
        });
      job.status = "Final Invoice Sent";
      job.squareFinalInvoiceId = invoice.invoiceId;
      job.squareFinalInvoiceUrl = invoice.publicUrl;
      if (action === "complete-text") {
        job.completionNoticeTextPreparedAt = new Date().toISOString();
      }
      await scheduleFollowUp(job, settings, "invoice_followup");
    }

    if (action === "send-final-invoice" || action === "resend-final-invoice-email" || action === "send-final-invoice-text") {
      const settings = await readSettings();
      requireConfiguredInvoicePaymentMethod(settings);
      const invoice = await createPressureFlowInvoice(job, settings, "final", input._baseUrl, {
        sendEmail: action !== "send-final-invoice-text"
      });
      job.status = "Final Invoice Sent";
      job.squareFinalInvoiceId = invoice.invoiceId;
      job.squareFinalInvoiceUrl = invoice.publicUrl;
      if (action === "send-final-invoice-text") {
        job.finalInvoiceTextPreparedAt = new Date().toISOString();
      }
      await scheduleFollowUp(job, settings, "invoice_followup");
    }

    if (action === "send-completion-notice-email" || action === "send-completion-notice-text") {
      const settings = await readSettings();
      job.completionProofToken = job.completionProofToken || randomToken();
      job.completionProofUrl = buildCompletionProofUrl(input._baseUrl, job);
      const notice = buildCompletionNotice(job, settings);
      job.completionNoticeSubject = notice.subject;
      job.completionNoticeBody = notice.body;
      job.completionNoticeMailto = notice.mailto;
      if (action === "send-completion-notice-email") {
        await sendCompletionNoticeEmail(job, settings);
        job.completionNoticeSentAt = new Date().toISOString();
      } else {
        job.completionNoticeTextPreparedAt = new Date().toISOString();
      }
    }

    if (action === "mark-paid") {
      const settings = await readSettings();
      job.status = "Paid";
      job.squareFinalInvoiceStatus = "PAID";
      job.squareFinalPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "invoice_followup");
      recordManualPayment(job, "final", input);
      await scheduleFollowUp(job, settings, "review_request");
      await sendAdminTextAlertSafe(`PressureFlow: Final invoice marked paid for ${formatAlertCustomer(job)}. ${getPressureFlowInvoiceNumber(job, "final")} ${formatAlertMoney(getFinalBalanceCents(job) / 100)}.`);
    }

    if (action === "check-final-payment") {
      const settings = await readSettings();
      job.status = "Paid";
      job.squareFinalInvoiceStatus = "PAID";
      job.squareFinalPaidAt = new Date().toISOString();
      await cancelPendingFollowUp(job.id, "paid", job.accountId || "owner", "invoice_followup");
      recordAutomaticPayment(job, "final", "Square");
      await scheduleFollowUp(job, settings, "review_request");
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

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(number, min), max);
}

function validationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function shouldCreateGoogleCalendarEvent(settings = {}) {
  if (settings.googleRefreshToken) {
    return true;
  }

  return !isAuditGoogleMockEnabled();
}

function applyDeliveryPreference(job, action) {
  if (isTextDeliveryAction(action)) {
    job.preferredDeliveryMethod = "text";
    return;
  }

  if (isEmailDeliveryAction(action)) {
    job.preferredDeliveryMethod = "email";
  }
}

function isTextDeliveryAction(action) {
  return action === "send-estimate-text" ||
    action === "send-contract-text" ||
    action === "send-deposit-invoice-text" ||
    action === "send-final-invoice-text" ||
    action === "complete-text" ||
    action === "send-completion-notice-text";
}

function isEmailDeliveryAction(action) {
  return action === "send-square-estimate" ||
    action === "resend-estimate-email" ||
    action === "send-contract" ||
    action === "resend-contract-email" ||
    action === "send-deposit-invoice" ||
    action === "resend-deposit-invoice-email" ||
    action === "send-final-invoice" ||
    action === "resend-final-invoice-email" ||
    action === "complete" ||
    action === "send-completion-notice-email";
}

module.exports = {
  createJobActionHandler,
  normalizeNumber,
  shouldCreateGoogleCalendarEvent
};
