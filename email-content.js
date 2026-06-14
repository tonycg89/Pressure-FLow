const {
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("./billing");
const {
  escapeHtml,
  formatPublicDate,
  getBaseUrlFromLink,
  getBusinessName,
  getEstimateValidUntil,
  renderLogoHtml
} = require("./rendering");

const emailTheme = Object.freeze({
  green: "#1F7A4D",
  white: "#FFFFFF",
  text: "#1A1D1B",
  muted: "#5C635E",
  border: "#E2E6E3",
  background: "#F7F8F7",
  surface: "#FFFFFF"
});

function buildEstimateMailto(job, settings = {}) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  const subject = `${businessName} estimate for ${job.serviceType} at ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `Your estimate from ${businessName} is ready for review.`,
    "",
    `Estimate total: $${Number(job.estimate || 0).toFixed(2)}`,
    `This estimate is valid through ${formatPublicDate(validUntil)}.`,
    `Approve estimate: ${job.estimateApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  return `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildContractMailto(job, settings = {}) {
  const businessName = getBusinessName(settings);
  const subject = `${businessName} service agreement for ${job.serviceType} at ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `Your ${businessName} service agreement is ready for review and signature.`,
    "",
    `Review and sign: ${job.contractApprovalUrl}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  return `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function buildEstimateEmailMessage(job, settings) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  return {
    to: job.email,
    subject: `${businessName} estimate for ${job.serviceType} at ${job.address}`,
    textBody: [
      `Hi ${job.customerName},`,
      "",
      `Your estimate from ${businessName} is ready for review.`,
      "",
      `Estimate total: $${Number(job.estimate || 0).toFixed(2)}`,
      `This estimate is valid through ${formatPublicDate(validUntil)}.`,
      `Approve estimate: ${job.estimateApprovalUrl}`,
      "",
      "Thank you,",
      businessName
    ].join("\n"),
    htmlBody: renderEstimateEmailHtml(job, settings)
  };
}

function buildEstimateFollowUpEmailMessage(job, settings) {
  const subjectTemplate = settings.estimateFollowUpSubject || "Following up on your estimate - {jobTitle} at {address}";
  const bodyTemplate = settings.estimateFollowUpBody || [
    "Hi {firstName},",
    "",
    "Just wanted to follow up on the estimate we sent for {jobTitle} at {address}.",
    "",
    "Your estimate of {estimateTotal} is still available for review. Let us know if you have any questions - we're happy to walk you through it.",
    "",
    "Thank you,",
    "{businessName}"
  ].join("\n");
  const subject = renderEstimateFollowUpTemplate(subjectTemplate, job, settings);
  const textBody = [
    renderEstimateFollowUpTemplate(bodyTemplate, job, settings),
    "",
    `Review and approve estimate: ${job.estimateApprovalUrl}`
  ].join("\n");

  return {
    to: job.email,
    subject,
    textBody,
    htmlBody: renderEstimateFollowUpEmailHtml(job, settings, bodyTemplate)
  };
}

function buildFollowUpEmailMessage(job, settings, type = "estimate_followup") {
  if (type === "estimate_followup") {
    return buildEstimateFollowUpEmailMessage(job, settings);
  }

  const config = getFollowUpEmailConfig(job, type);
  const businessName = getBusinessName(settings);
  const textBody = [
    `Hi ${getFirstName(job)},`,
    "",
    config.body,
    "",
    `${config.cta}: ${config.url}`,
    "",
    "Thank you,",
    businessName
  ].join("\n");

  return {
    to: job.email,
    subject: `${businessName} follow-up - ${job.serviceType || "your service"} at ${job.address || ""}`,
    textBody,
    htmlBody: renderFollowUpEmailHtml(job, settings, config)
  };
}

function buildContractEmailMessage(job, settings) {
  const businessName = getBusinessName(settings);
  return {
    to: job.email,
    subject: `${businessName} service agreement for ${job.serviceType} at ${job.address}`,
    textBody: [
      `Hi ${job.customerName},`,
      "",
      `Your ${businessName} service agreement is ready for review and signature.`,
      "",
      `Review and sign: ${job.contractApprovalUrl}`,
      "",
      "Thank you,",
      businessName
    ].join("\n"),
    htmlBody: renderContractEmailHtml(job, settings)
  };
}

function buildPressureFlowInvoiceEmailMessage(job, settings, invoiceType, invoiceUrl) {
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  return {
    to: job.email,
    subject: `${businessName} ${isDeposit ? "deposit" : "final"} invoice ${invoiceNumber} for ${job.serviceType} at ${job.address}`,
    textBody: [
      `Hi ${job.customerName},`,
      "",
      `Your ${isDeposit ? "deposit" : "final"} invoice from ${businessName} is ready.`,
      `Invoice number: ${invoiceNumber}`,
      `Amount due: $${amount.toFixed(2)}`,
      `Invoice: ${invoiceUrl}`,
      !isDeposit && job.completionProofUrl ? `Completion photos: ${job.completionProofUrl}` : "",
      "",
      "Payment options:",
      settings.zellePayment ? `Zelle: ${settings.zellePayment}` : "",
      settings.cashAppPayment ? `Cash App: ${settings.cashAppPayment}` : "",
      settings.venmoPayment ? `Venmo: ${settings.venmoPayment}` : "",
      settings.paymentInstructions || "",
      "",
      "Thank you,",
      businessName
    ].filter((line) => line !== "").join("\n"),
    htmlBody: renderPressureFlowInvoiceEmailHtml(job, settings, invoiceType, invoiceUrl)
  };
}

function buildCompletionCertificateEmailMessage(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  const paidAmount = getFinalBalanceCents(job) / 100;
  return {
    to: job.email,
    subject: `${businessName} Certificate of Completion - ${job.address}`,
    textBody: [
      `Hi ${job.customerName},`,
      "",
      `Thank you for your business! This email confirms that ${businessName} has completed the scheduled service work at ${job.address}.`,
      "",
      `Amount paid: $${paidAmount.toFixed(2)}`,
      job.completionProofUrl ? `Before and after photos: ${job.completionProofUrl}` : "",
      "",
      "We appreciate the opportunity to work on your property.",
      "",
      "Thank you,",
      businessName
    ].filter((line) => line !== "").join("\n"),
    htmlBody: renderCompletionCertificateEmailHtml(job, settings, baseUrl)
  };
}

function buildCompletionNotice(job, settings) {
  const businessName = getBusinessName(settings);
  const completedAt = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short"
  });
  const subject = `${businessName} service completed - ${job.address}`;
  const body = [
    `Hi ${job.customerName},`,
    "",
    `The scheduled services by ${businessName} at ${job.address} have been completed as of ${completedAt}.`,
    "",
    "Please review the completed work and let us know within 24 hours if you believe any agreed-upon service was not completed. If anything needs review, we will be happy to take a look.",
    "",
    "Your final invoice for the remaining balance has been sent through PressureFlow.",
    job.completionProofUrl ? `Completion photos and proof page: ${job.completionProofUrl}` : "",
    "",
    "Thank you,",
    businessName
  ].filter((line) => line !== "").join("\n");
  const mailto = `mailto:${encodeURIComponent(job.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { subject, body, mailto };
}

function buildScheduleConfirmationEmailMessage(job, settings, baseUrl, inviteAttachment, scheduleText, instructions) {
  const businessName = getBusinessName(settings);
  return {
    to: job.email,
    subject: `${businessName} schedule confirmation - ${job.address}`,
    textBody: [
      `Hi ${job.customerName},`,
      "",
      `Your ${businessName} service has been scheduled.`,
      "",
      `Service: ${job.serviceType}`,
      `Address: ${job.address}`,
      `Scheduled time: ${scheduleText}`,
      "",
      "Day-of-service instructions:",
      ...instructions.map((item) => `- ${item}`),
      "",
      "Thank you,",
      businessName
    ].join("\n"),
    htmlBody: renderScheduleConfirmationEmailHtml(job, settings, baseUrl, scheduleText, instructions),
    attachments: [inviteAttachment]
  };
}

function renderPressureFlowInvoiceEmailHtml(job, settings, invoiceType, invoiceUrl) {
  const isDeposit = invoiceType === "deposit";
  const amount = isDeposit ? getDepositCents(job) / 100 : getFinalBalanceCents(job) / 100;
  const businessName = getBusinessName(settings);
  const invoiceNumber = getPressureFlowInvoiceNumber(job, invoiceType);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, getBaseUrlFromLink(invoiceUrl))}
      <h2 style="margin:0 0 12px">${isDeposit ? "Deposit invoice" : "Final invoice"}</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your ${isDeposit ? "deposit" : "final"} invoice from ${escapeHtml(businessName)} for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)} is ready.</p>
      <p><strong>Invoice number:</strong> ${escapeHtml(invoiceNumber)}</p>
      <p style="font-size:18px"><strong>Amount due: $${amount.toFixed(2)}</strong></p>
      <p>
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          View invoice
        </a>
      </p>
      ${!isDeposit && job.completionProofUrl ? `<p><a href="${escapeHtml(job.completionProofUrl)}">View completion photos</a></p>` : ""}
      <p><strong>Payment options</strong></p>
      <ul>
        ${settings.zellePayment ? `<li>Zelle: ${escapeHtml(settings.zellePayment)}</li>` : ""}
        ${settings.cashAppPayment ? `<li>Cash App: ${escapeHtml(settings.cashAppPayment)}</li>` : ""}
        ${settings.venmoPayment ? `<li>Venmo: ${escapeHtml(settings.venmoPayment)}</li>` : ""}
      </ul>
      ${settings.paymentInstructions ? `<p>${escapeHtml(settings.paymentInstructions)}</p>` : ""}
      <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(invoiceUrl)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function renderCompletionCertificateEmailHtml(job, settings, baseUrl) {
  const businessName = getBusinessName(settings);
  const paidAmount = getFinalBalanceCents(job) / 100;
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, baseUrl, 210)}
      <h2 style="margin:0 0 12px">Certificate of Completion</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Thank you for your business! This confirms that ${escapeHtml(businessName)} has completed the scheduled service work at ${escapeHtml(job.address)}.</p>
      <p style="font-size:18px"><strong>Amount paid: $${paidAmount.toFixed(2)}</strong></p>
      ${job.completionProofUrl ? `<p><a href="${escapeHtml(job.completionProofUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">View before and after photos</a></p>` : ""}
      <h3 style="margin:18px 0 8px">Before Photos</h3>
      ${renderEmailPhotoGrid(job.jobPhotos?.before || [])}
      <h3 style="margin:18px 0 8px">Completed Work Photos</h3>
      ${renderEmailPhotoGrid(job.jobPhotos?.after || [])}
      <p>We appreciate the opportunity to work on your property.</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function renderEmailPhotoGrid(photos) {
  if (!photos.length) {
    return `<p style="color:#667085">No photos provided.</p>`;
  }

  return `
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-width:560px">
      ${photos.slice(0, 8).map((photo) => `
        <div style="border:1px solid #d8dee8;border-radius:8px;overflow:hidden;background:#f7f8fb">
          <img src="${escapeHtml(photo.dataUrl)}" alt="${escapeHtml(photo.name)}" style="display:block;width:100%;height:150px;object-fit:cover">
        </div>
      `).join("")}
    </div>
    ${photos.length > 8 ? `<p style="color:#667085">${photos.length - 8} additional photo${photos.length - 8 === 1 ? "" : "s"} available in the proof link.</p>` : ""}
  `;
}

function renderEmailShell({ settings = {}, baseUrl = "", preheader = "", title = "", body = "" }) {
  const businessName = getBusinessName(settings);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-email-shell="pressureflow" style="width:100%;border-collapse:collapse;background:${emailTheme.background};margin:0;padding:0">
      <tr>
        <td align="center" style="padding:28px 12px">
          <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse;background:${emailTheme.surface};border:1px solid ${emailTheme.border};border-radius:12px;overflow:hidden">
            <tr>
              <td style="padding:24px 24px 18px;border-bottom:1px solid ${emailTheme.border}">
                ${renderLogoHtml(settings, baseUrl, 180)}
                <div style="font-family:Arial,sans-serif;color:${emailTheme.text};font-size:16px;font-weight:700;line-height:22px">${escapeHtml(businessName)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;font-family:Arial,sans-serif;color:${emailTheme.text};font-size:15px;line-height:22px">
                ${title ? `<h2 style="margin:0 0 14px;color:${emailTheme.text};font-family:Arial,sans-serif;font-size:22px;line-height:28px;font-weight:700">${escapeHtml(title)}</h2>` : ""}
                ${body}
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:collapse">
            <tr>
              <td style="padding:14px 8px 0;text-align:center;font-family:Arial,sans-serif;color:${emailTheme.muted};font-size:12px;line-height:18px">
                Sent by ${escapeHtml(businessName)} using PressureFlow.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderEstimateEmailHtml(job, settings) {
  const businessName = getBusinessName(settings);
  const validUntil = getEstimateValidUntil(job);
  const approvalUrl = escapeHtml(job.estimateApprovalUrl);
  return renderEmailShell({
    settings,
    baseUrl: getBaseUrlFromLink(job.estimateApprovalUrl),
    preheader: `Your estimate from ${businessName} is ready for review.`,
    title: "Your service estimate is ready",
    body: `
      <p style="margin:0 0 14px;color:${emailTheme.text}">Hi ${escapeHtml(job.customerName)},</p>
      <p style="margin:0 0 14px;color:${emailTheme.text}">Your estimate from ${escapeHtml(businessName)} for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)} is ready for review.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:18px 0;background:${emailTheme.background};border:1px solid ${emailTheme.border};border-radius:10px">
        <tr>
          <td style="padding:16px;font-family:Arial,sans-serif;color:${emailTheme.muted};font-size:13px;line-height:18px;font-weight:700">Estimate total</td>
          <td align="right" style="padding:16px;font-family:Arial,sans-serif;color:${emailTheme.text};font-size:20px;line-height:24px;font-weight:700">$${Number(job.estimate || 0).toFixed(2)}</td>
        </tr>
      </table>
      <p style="margin:0 0 18px;color:${emailTheme.muted}">This estimate is valid through ${escapeHtml(formatPublicDate(validUntil))}.</p>
      <p style="margin:0 0 18px">
        <a href="${approvalUrl}" style="display:inline-block;padding:12px 18px;background:${emailTheme.green};color:${emailTheme.white};text-decoration:none;border-radius:8px;font-weight:bold">
          Review and approve estimate
        </a>
      </p>
      <p style="margin:0 0 18px;color:${emailTheme.muted};font-size:13px;line-height:19px">If the button does not work, copy and paste this link into your browser:<br>${approvalUrl}</p>
      <p style="margin:0;color:${emailTheme.text}">Thank you,<br>${escapeHtml(businessName)}</p>
    `
  });
}

function renderContractEmailHtml(job, settings) {
  const businessName = getBusinessName(settings);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, getBaseUrlFromLink(job.contractApprovalUrl))}
      <h2 style="margin:0 0 12px">Your service agreement is ready</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Please review and sign the ${escapeHtml(businessName)} service agreement for <strong>${escapeHtml(job.serviceType)}</strong> at ${escapeHtml(job.address)}.</p>
      <p>
        <a href="${escapeHtml(job.contractApprovalUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Review and sign agreement
        </a>
      </p>
      <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(job.contractApprovalUrl)}</p>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

function renderEstimateFollowUpEmailHtml(job, settings, bodyTemplate) {
  const body = renderEstimateFollowUpTemplate(bodyTemplate, job, settings);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
    ${renderLogoHtml(settings, getBaseUrlFromLink(job.estimateApprovalUrl))}
    ${body.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`).join("")}
    <p>
      <a href="${escapeHtml(job.estimateApprovalUrl)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
        Review and approve estimate
      </a>
    </p>
    <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(job.estimateApprovalUrl)}</p>
    </div>
  `;
}

function renderFollowUpEmailHtml(job, settings, config) {
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
    ${renderLogoHtml(settings, getBaseUrlFromLink(config.url))}
    <p>Hi ${escapeHtml(getFirstName(job))},</p>
    <p>${escapeHtml(config.body)}</p>
    <p>
      <a href="${escapeHtml(config.url)}" style="display:inline-block;padding:12px 18px;background:#1c7c54;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
        ${escapeHtml(config.cta)}
      </a>
    </p>
    <p>If the button does not work, copy and paste this link into your browser:<br>${escapeHtml(config.url)}</p>
    <p>Thank you,<br>${escapeHtml(getBusinessName(settings))}</p>
    </div>
  `;
}

function getFollowUpEmailConfig(job, type) {
  if (type === "contract_followup") {
    return {
      body: `Just a reminder that your service agreement for ${job.serviceType || "your service"} is still waiting for your signature.`,
      cta: "Review and sign agreement",
      url: job.contractApprovalUrl || job.squareContractUrl || ""
    };
  }

  if (type === "deposit_followup") {
    return {
      body: `Your deposit invoice for ${job.serviceType || "your service"} is still outstanding. Once received, we'll get your job on the schedule.`,
      cta: "View deposit invoice",
      url: job.squareDepositInvoiceUrl || ""
    };
  }

  return {
    body: `Your final invoice for ${job.serviceType || "your service"} is still outstanding. Please let us know if you have any questions.`,
    cta: "View invoice",
    url: job.squareFinalInvoiceUrl || ""
  };
}

function getFirstName(job) {
  return String(job.customerName || "").trim().split(/\s+/).filter(Boolean)[0] || "there";
}

function renderEstimateFollowUpTemplate(template, job, settings) {
  const nameParts = String(job.customerName || "").trim().split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || job.customerName || "there";
  const lastName = nameParts.length > 1 ? nameParts.at(-1) : "";
  const values = {
    firstName,
    lastName,
    jobTitle: job.serviceType || "your service",
    address: job.address || "",
    estimateTotal: `$${Number(job.estimate || 0).toFixed(2)}`,
    businessName: getBusinessName(settings),
    approvalLink: job.estimateApprovalUrl || ""
  };
  return String(template || "").replace(/\{(firstName|lastName|jobTitle|address|estimateTotal|businessName|approvalLink)\}/g, (_, key) => values[key] || "");
}

function renderScheduleConfirmationEmailHtml(job, settings, baseUrl, scheduleText, instructions) {
  const businessName = getBusinessName(settings);
  return `
    <div style="font-family:Arial,sans-serif;color:#202124;line-height:1.5">
      ${renderLogoHtml(settings, baseUrl, 190)}
      <h2 style="margin:0 0 12px">Schedule Confirmation</h2>
      <p>Hi ${escapeHtml(job.customerName)},</p>
      <p>Your ${escapeHtml(businessName)} service has been scheduled.</p>
      <table style="border-collapse:collapse;width:100%;max-width:560px;margin:12px 0">
        <tbody>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Service</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(job.serviceType)}</td></tr>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Address</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(job.address)}</td></tr>
          <tr><td style="border:1px solid #d8dee8;padding:8px"><strong>Scheduled time</strong></td><td style="border:1px solid #d8dee8;padding:8px">${escapeHtml(scheduleText)}</td></tr>
        </tbody>
      </table>
      <p><strong>Day-of-service instructions</strong></p>
      <ul>
        ${instructions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
      <p>Thank you,<br>${escapeHtml(businessName)}</p>
    </div>
  `;
}

module.exports = {
  buildCompletionCertificateEmailMessage,
  buildCompletionNotice,
  buildContractEmailMessage,
  buildContractMailto,
  buildEstimateEmailMessage,
  buildFollowUpEmailMessage,
  buildEstimateFollowUpEmailMessage,
  buildEstimateMailto,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage,
  renderEstimateFollowUpTemplate
};
