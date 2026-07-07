const {
  buildCompletionCertificateEmailMessage,
  buildCompletionNoticeEmailMessage,
  buildContractEmailMessage,
  buildEstimateEmailMessage,
  buildEstimateFollowUpEmailMessage,
  buildFollowUpEmailMessage,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage
} = require("./email-content");
const { sendGmailEmail } = require("./integrations/gmail");
const { sendSmtpEmail } = require("./integrations/smtp");
const {
  createOperationalLogger,
  maskEmail,
  recipientDomain
} = require("./operational-logger");
const { getBaseUrlFromLink } = require("./rendering");
const {
  buildScheduleInviteAttachment,
  formatScheduledWindow,
  getDayOfServiceInstructions
} = require("./scheduling");

function createEmailDelivery({ logger = createOperationalLogger(), warn = console.warn } = {}) {
  async function sendEstimateEmail(job, settings) {
    await sendCustomerEmail(settings, buildEstimateEmailMessage(job, settings), { ...emailContext("estimate", job, settings), logger });
  }

  async function sendEstimateFollowUpEmail(job, settings, type = "estimate_followup") {
    await sendCustomerEmail(settings, buildFollowUpEmailMessage(job, settings, type), { ...emailContext(type, job, settings), logger });
  }

  async function sendContractEmail(job, settings) {
    await sendCustomerEmail(settings, buildContractEmailMessage(job, settings), { ...emailContext("contract", job, settings), logger });
  }

  async function sendPressureFlowInvoiceEmail(job, settings, invoiceType, invoiceUrl) {
    await sendCustomerEmail(settings, buildPressureFlowInvoiceEmailMessage(job, settings, invoiceType, invoiceUrl), { ...emailContext(`${invoiceType}_invoice`, job, settings), logger });
  }

  async function sendCompletionCertificateEmail(job, settings, baseUrl) {
    await sendCustomerEmail(settings, buildCompletionCertificateEmailMessage(job, settings, baseUrl), { ...emailContext("completion_proof", job, settings), logger });
  }

  async function sendCompletionNoticeEmail(job, settings) {
    await sendCustomerEmail(settings, buildCompletionNoticeEmailMessage(job, settings), { ...emailContext("completion_notice", job, settings), logger });
  }

  async function sendCompletionCertificateEmailSafe(job, settings, baseUrl) {
    try {
      await sendCompletionCertificateEmail(job, settings, baseUrl || getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
    } catch (error) {
      logger.warn("email_send_safe_completion_failed", {
        ...emailContext("completion_proof", job, settings),
        error
      });
      warn(`Unable to send completion certificate for job ${job.id}: ${error.message}`);
    }
  }

  async function sendScheduleConfirmationEmail(job, settings, baseUrl, options = {}) {
    const scheduleText = formatScheduledWindow(job);
    const previousScheduleText = options.previousScheduledAt
      ? formatScheduledWindow({
        ...job,
        scheduledAt: options.previousScheduledAt,
        jobDurationMinutes: options.previousJobDurationMinutes ?? job.jobDurationMinutes
      })
      : "";
    const instructions = getDayOfServiceInstructions(settings);
    await sendCustomerEmail(settings, buildScheduleConfirmationEmailMessage(
      job,
      settings,
      baseUrl,
      buildScheduleInviteAttachment(job, settings),
      scheduleText,
      instructions,
      {
        isReschedule: Boolean(options.isReschedule),
        previousScheduleText
      }
    ), { ...emailContext(options.isReschedule ? "schedule_reschedule" : "schedule_confirmation", job, settings), logger });
  }

  return {
    sendCompletionCertificateEmail,
    sendCompletionCertificateEmailSafe,
    sendCompletionNoticeEmail,
    sendContractEmail,
    sendEstimateEmail,
    sendEstimateFollowUpEmail,
    sendPressureFlowInvoiceEmail,
    sendScheduleConfirmationEmail
  };
}

async function sendCustomerEmail(settings, message, context = {}) {
  const logger = context.logger || createOperationalLogger();
  const { logger: _logger, ...safeContext } = context;
  const provider = settings.emailSendProvider === "smtp" ? "smtp" : "google";
  const logContext = {
    ...safeContext,
    provider,
    recipient: maskEmail(message.to),
    recipientDomain: recipientDomain(message.to)
  };

  if (process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY === "true") {
    if (settings.emailSendProvider !== "smtp" && !settings.googleRefreshToken && !isAuditGoogleMockEnabled()) {
      const error = createEmailDeliveryError(
        "Google/Gmail is not connected yet. Open Settings and connect Google before sending customer emails, or switch email delivery to SMTP.",
        { statusCode: 409, code: "EMAIL_PROVIDER_NOT_CONNECTED" }
      );
      logger.error("email_send_failed", {
        ...logContext,
        reason: "google_email_not_connected",
        error
      });
      throw error;
    }
    const result = { id: `skipped-email-${Date.now()}`, skipped: true, to: message.to };
    if (isAuditGoogleMockEnabled()) {
      result.auditGoogleMock = true;
      logger.info("email_send_skipped_audit_mock", logContext);
    }
    return result;
  }

  try {
    if (settings.emailSendProvider === "smtp") {
      return await sendSmtpEmail(settings, message);
    }

    return await sendGmailEmail(settings, message);
  } catch (error) {
    markEmailDeliveryError(error);
    logger.error("email_send_failed", {
      ...logContext,
      error
    });
    throw error;
  }
}

function emailContext(type, job = {}, settings = {}) {
  return {
    emailType: type,
    accountId: job.accountId || "owner",
    jobId: job.id || "",
    customerId: job.customerId || "",
    provider: settings.emailSendProvider === "smtp" ? "smtp" : "google"
  };
}

function isAuditGoogleMockEnabled() {
  return process.env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK === "true";
}

function createEmailDeliveryError(message, { statusCode = 502, code = "EMAIL_DELIVERY_FAILED" } = {}) {
  const error = new Error(message);
  markEmailDeliveryError(error, { statusCode, code });
  return error;
}

function markEmailDeliveryError(error, { statusCode = 502, code = "EMAIL_DELIVERY_FAILED" } = {}) {
  if (!error || typeof error !== "object") return error;
  error.statusCode = error.statusCode || statusCode;
  error.code = error.code || code;
  error.exposeToClient = true;
  return error;
}

module.exports = {
  createEmailDelivery,
  createEmailDeliveryError,
  isAuditGoogleMockEnabled,
  markEmailDeliveryError,
  sendCustomerEmail
};
