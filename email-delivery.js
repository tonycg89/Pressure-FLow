const {
  buildCompletionCertificateEmailMessage,
  buildContractEmailMessage,
  buildEstimateEmailMessage,
  buildEstimateFollowUpEmailMessage,
  buildFollowUpEmailMessage,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage
} = require("./email-content");
const { sendGmailEmail } = require("./integrations/google");
const { sendSmtpEmail } = require("./integrations/smtp");
const { getBaseUrlFromLink } = require("./rendering");
const {
  buildScheduleInviteAttachment,
  formatScheduledWindow,
  getDayOfServiceInstructions
} = require("./scheduling");

function createEmailDelivery({ warn = console.warn } = {}) {
  async function sendEstimateEmail(job, settings) {
    await sendCustomerEmail(settings, buildEstimateEmailMessage(job, settings));
  }

  async function sendEstimateFollowUpEmail(job, settings, type = "estimate_followup") {
    await sendCustomerEmail(settings, buildFollowUpEmailMessage(job, settings, type));
  }

  async function sendContractEmail(job, settings) {
    await sendCustomerEmail(settings, buildContractEmailMessage(job, settings));
  }

  async function sendPressureFlowInvoiceEmail(job, settings, invoiceType, invoiceUrl) {
    await sendCustomerEmail(settings, buildPressureFlowInvoiceEmailMessage(job, settings, invoiceType, invoiceUrl));
  }

  async function sendCompletionCertificateEmail(job, settings, baseUrl) {
    await sendCustomerEmail(settings, buildCompletionCertificateEmailMessage(job, settings, baseUrl));
  }

  async function sendCompletionCertificateEmailSafe(job, settings, baseUrl) {
    try {
      await sendCompletionCertificateEmail(job, settings, baseUrl || getBaseUrlFromLink(job.squareFinalInvoiceUrl || job.completionProofUrl || ""));
    } catch (error) {
      warn(`Unable to send completion certificate for job ${job.id}: ${error.message}`);
    }
  }

  async function sendScheduleConfirmationEmail(job, settings, baseUrl) {
    const scheduleText = formatScheduledWindow(job);
    const instructions = getDayOfServiceInstructions(settings);
    await sendCustomerEmail(settings, buildScheduleConfirmationEmailMessage(
      job,
      settings,
      baseUrl,
      buildScheduleInviteAttachment(job, settings),
      scheduleText,
      instructions
    ));
  }

  return {
    sendCompletionCertificateEmail,
    sendCompletionCertificateEmailSafe,
    sendContractEmail,
    sendEstimateEmail,
    sendEstimateFollowUpEmail,
    sendPressureFlowInvoiceEmail,
    sendScheduleConfirmationEmail
  };
}

async function sendCustomerEmail(settings, message) {
  if (process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY === "true") {
    return { id: `skipped-email-${Date.now()}`, skipped: true, to: message.to };
  }

  if (settings.emailSendProvider === "smtp") {
    return sendSmtpEmail(settings, message);
  }

  return sendGmailEmail(settings, message);
}

module.exports = {
  createEmailDelivery,
  sendCustomerEmail
};
