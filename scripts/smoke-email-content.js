const assert = require("node:assert/strict");
const {
  getDepositCents,
  getFinalBalanceCents,
  getPressureFlowInvoiceNumber
} = require("../billing");
const {
  buildCompletionCertificateEmailMessage,
  buildCompletionNotice,
  buildContractEmailMessage,
  buildContractMailto,
  buildEstimateEmailMessage,
  buildEstimateMailto,
  buildFollowUpEmailMessage,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage
} = require("../email-content");

const settings = {
  businessName: "Johnson Exterior Cleaning",
  businessEmail: "owner@johnson.test",
  businessPhone: "(555) 222-3333",
  businessLogoDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  zellePayment: "owner@johnson.test",
  cashAppPayment: "$JohnsonExterior",
  venmoPayment: "@JohnsonExterior",
  paymentInstructions: "Please include the invoice number."
};

const job = {
  id: "job-email-content",
  customerName: "Alex Rivera",
  email: "alex.rivera@example.com",
  serviceType: "Driveway cleaning",
  address: "123 Maple St",
  estimate: 425,
  depositPercent: 25,
  estimateSentAt: "2026-06-01T12:00:00.000Z",
  estimateApprovalUrl: "https://pressureflow.test/estimate/job-email-content?token=estimate-token",
  contractApprovalUrl: "https://pressureflow.test/contract/job-email-content?token=contract-token",
  squareDepositInvoiceId: "deposit-token",
  squareDepositInvoiceUrl: "https://pressureflow.test/invoice/job-email-content?type=deposit&token=deposit-token",
  squareFinalInvoiceId: "final-token",
  squareFinalInvoiceUrl: "https://pressureflow.test/invoice/job-email-content?type=final&token=final-token",
  completionProofUrl: "https://pressureflow.test/proof/job-email-content?token=proof-token",
  jobPhotos: { before: [], after: [] }
};

const expectedEstimateText = [
  "Hi Alex Rivera,",
  "",
  "Your estimate from Johnson Exterior Cleaning is ready for review.",
  "",
  "Estimate total: $425.00",
  "This estimate is valid through July 1, 2026.",
  "Approve estimate: https://pressureflow.test/estimate/job-email-content?token=estimate-token",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");

const expectedContractText = [
  "Hi Alex Rivera,",
  "",
  "Your Johnson Exterior Cleaning service agreement is ready for review and signature.",
  "",
  "Review and sign: https://pressureflow.test/contract/job-email-content?token=contract-token",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");

const depositInvoiceNumber = getPressureFlowInvoiceNumber(job, "deposit");
const finalInvoiceNumber = getPressureFlowInvoiceNumber(job, "final");
const expectedDepositInvoiceText = [
  "Hi Alex Rivera,",
  "Your deposit invoice from Johnson Exterior Cleaning is ready.",
  `Invoice number: ${depositInvoiceNumber}`,
  `Amount due: $${(getDepositCents(job) / 100).toFixed(2)}`,
  "Invoice: https://pressureflow.test/invoice/job-email-content?type=deposit&token=deposit-token",
  "Payment options:",
  "Zelle: owner@johnson.test",
  "Cash App: $JohnsonExterior",
  "Venmo: @JohnsonExterior",
  "Please include the invoice number.",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
const expectedFinalInvoiceText = [
  "Hi Alex Rivera,",
  "Your final invoice from Johnson Exterior Cleaning is ready.",
  `Invoice number: ${finalInvoiceNumber}`,
  `Amount due: $${(getFinalBalanceCents(job) / 100).toFixed(2)}`,
  "Invoice: https://pressureflow.test/invoice/job-email-content?type=final&token=final-token",
  "Completion photo record: https://pressureflow.test/proof/job-email-content?token=proof-token",
  "Payment options:",
  "Zelle: owner@johnson.test",
  "Cash App: $JohnsonExterior",
  "Venmo: @JohnsonExterior",
  "Please include the invoice number.",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
const expectedEstimateFollowUpText = [
  "Hi Alex,",
  "",
  "Just wanted to follow up on the estimate we sent for Driveway cleaning at 123 Maple St.",
  "",
  "Your estimate of $425.00 is still available for review. Let us know if you have any questions - we're happy to walk you through it.",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning",
  "",
  "Review and approve estimate: https://pressureflow.test/estimate/job-email-content?token=estimate-token"
].join("\n");
const expectedContractFollowUpText = [
  "Hi Alex,",
  "",
  "Just a reminder that your service agreement for Driveway cleaning is still waiting for your signature.",
  "",
  "Review and sign agreement: https://pressureflow.test/contract/job-email-content?token=contract-token",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
const expectedCompletionText = [
  "Hi Alex Rivera,",
  "Thank you for your business! This email confirms that Johnson Exterior Cleaning has completed the scheduled service work at 123 Maple St.",
  `Amount paid: $${(getFinalBalanceCents(job) / 100).toFixed(2)}`,
  "Before and after photos: https://pressureflow.test/proof/job-email-content?token=proof-token",
  "We appreciate the opportunity to work on your property.",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
const expectedScheduleText = [
  "Hi Alex Rivera,",
  "",
  "Your Johnson Exterior Cleaning service has been scheduled.",
  "",
  "Service: Driveway cleaning",
  "Address: 123 Maple St",
  "Scheduled time: June 10, 2026, 9:00 AM - 12:00 PM",
  "",
  "Day-of-service instructions:",
  "- Move vehicles from the driveway.",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");

const estimate = buildEstimateEmailMessage(job, settings);
assert.equal(estimate.to, "alex.rivera@example.com");
assert.equal(estimate.subject, "Johnson Exterior Cleaning estimate for Driveway cleaning at 123 Maple St");
assert.equal(estimate.textBody, expectedEstimateText);
assert.match(estimate.htmlBody, /data-email-shell="pressureflow"/);
assert.match(estimate.htmlBody, /doc__logo/);
assert.match(estimate.htmlBody, /Your service estimate is ready/);
assert.match(estimate.htmlBody, /Alex Rivera/);
assert.match(estimate.htmlBody, /Johnson Exterior Cleaning/);
assert.match(estimate.htmlBody, /owner@johnson\.test/);
assert.match(estimate.htmlBody, /\(555\) 222-3333/);
assert.match(estimate.htmlBody, /Driveway cleaning/);
assert.match(estimate.htmlBody, /123 Maple St/);
assert.match(estimate.htmlBody, /\$425\.00/);
assert.match(estimate.htmlBody, /July 1, 2026/);
assert.match(estimate.htmlBody, /Review and approve estimate/);
assert.match(estimate.htmlBody, /href="https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token"/);
assert.match(estimate.htmlBody, /https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token/);
assert.match(estimate.textBody, /https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token/);

const contract = buildContractEmailMessage(job, settings);
assert.equal(contract.to, "alex.rivera@example.com");
assert.equal(contract.subject, "Johnson Exterior Cleaning service agreement for Driveway cleaning at 123 Maple St");
assert.equal(contract.textBody, expectedContractText);
assert.match(contract.htmlBody, /data-email-shell="pressureflow"/);
assert.match(contract.htmlBody, /doc__logo/);
assert.match(contract.htmlBody, /Your service agreement is ready/);
assert.match(contract.htmlBody, /Alex Rivera/);
assert.match(contract.htmlBody, /Johnson Exterior Cleaning/);
assert.match(contract.htmlBody, /Driveway cleaning/);
assert.match(contract.htmlBody, /123 Maple St/);
assert.match(contract.htmlBody, /Review and sign agreement/);
assert.match(contract.htmlBody, /href="https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token"/);
assert.match(contract.htmlBody, /https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token/);
assert.match(contract.textBody, /https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token/);

const depositInvoice = buildPressureFlowInvoiceEmailMessage(job, settings, "deposit", job.squareDepositInvoiceUrl);
const finalInvoice = buildPressureFlowInvoiceEmailMessage(job, settings, "final", job.squareFinalInvoiceUrl);
assert.equal(depositInvoice.to, "alex.rivera@example.com");
assert.equal(depositInvoice.subject, `Johnson Exterior Cleaning deposit invoice ${depositInvoiceNumber} for Driveway cleaning at 123 Maple St`);
assert.equal(depositInvoice.textBody, expectedDepositInvoiceText);
assert.match(depositInvoice.htmlBody, /data-email-shell="pressureflow"/);
assert.match(depositInvoice.htmlBody, /Deposit invoice/);
assert.match(depositInvoice.htmlBody, /Alex Rivera/);
assert.match(depositInvoice.htmlBody, /Johnson Exterior Cleaning/);
assert.match(depositInvoice.htmlBody, /Driveway cleaning/);
assert.match(depositInvoice.htmlBody, /123 Maple St/);
assert.match(depositInvoice.htmlBody, new RegExp(depositInvoiceNumber));
assert.match(depositInvoice.htmlBody, /\$106\.25/);
assert.match(depositInvoice.htmlBody, /View invoice/);
assert.match(depositInvoice.htmlBody, /href="https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=deposit&amp;token=deposit-token"/);
assert.match(depositInvoice.htmlBody, /https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=deposit&amp;token=deposit-token/);
assert.match(depositInvoice.textBody, /https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=deposit&token=deposit-token/);

assert.equal(finalInvoice.to, "alex.rivera@example.com");
assert.equal(finalInvoice.subject, `Johnson Exterior Cleaning final invoice ${finalInvoiceNumber} for Driveway cleaning at 123 Maple St`);
assert.equal(finalInvoice.textBody, expectedFinalInvoiceText);
assert.match(finalInvoice.htmlBody, /data-email-shell="pressureflow"/);
assert.match(finalInvoice.htmlBody, /Final invoice/);
assert.match(finalInvoice.htmlBody, /Alex Rivera/);
assert.match(finalInvoice.htmlBody, /Johnson Exterior Cleaning/);
assert.match(finalInvoice.htmlBody, /Driveway cleaning/);
assert.match(finalInvoice.htmlBody, /123 Maple St/);
assert.match(finalInvoice.htmlBody, new RegExp(finalInvoiceNumber));
assert.match(finalInvoice.htmlBody, /\$318\.75/);
assert.match(finalInvoice.htmlBody, /View invoice/);
assert.match(finalInvoice.htmlBody, /View completion photo record/);
assert.match(finalInvoice.htmlBody, /href="https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=final&amp;token=final-token"/);
assert.match(finalInvoice.htmlBody, /https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=final&amp;token=final-token/);
assert.match(finalInvoice.htmlBody, /https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token/);
assert.match(finalInvoice.textBody, /https:\/\/pressureflow\.test\/invoice\/job-email-content\?type=final&token=final-token/);
assert.match(finalInvoice.textBody, /https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token/);

const cardOnlyInvoice = buildPressureFlowInvoiceEmailMessage(job, {
  businessName: "Johnson Exterior Cleaning",
  businessEmail: "owner@johnson.test",
  businessPhone: "(555) 222-3333",
  stripeSecretKey: "sk_test_display_only"
}, "deposit", job.squareDepositInvoiceUrl);
assert.match(cardOnlyInvoice.htmlBody, /Payment options are shown on the invoice page\./);
assert.doesNotMatch(cardOnlyInvoice.htmlBody, /<ul style="margin:0 0 14px 20px;padding:0;color:#1A1D1B">\s*<\/ul>/);

const estimateFollowUp = buildFollowUpEmailMessage(job, settings, "estimate_followup");
const contractFollowUp = buildFollowUpEmailMessage(job, settings, "contract_followup");
const completion = buildCompletionCertificateEmailMessage(job, settings, "https://pressureflow.test");
assert.equal(estimateFollowUp.to, "alex.rivera@example.com");
assert.equal(estimateFollowUp.subject, "Following up on your estimate - Driveway cleaning at 123 Maple St");
assert.equal(estimateFollowUp.textBody, expectedEstimateFollowUpText);
assert.match(estimateFollowUp.htmlBody, /data-email-shell="pressureflow"/);
assert.match(estimateFollowUp.htmlBody, /Following up on your estimate/);
assert.match(estimateFollowUp.htmlBody, /Review and approve estimate/);
assert.match(estimateFollowUp.htmlBody, /href="https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token"/);
assert.match(estimateFollowUp.htmlBody, /https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token/);
assert.match(estimateFollowUp.textBody, /https:\/\/pressureflow\.test\/estimate\/job-email-content\?token=estimate-token/);

assert.equal(contractFollowUp.to, "alex.rivera@example.com");
assert.equal(contractFollowUp.subject, "Johnson Exterior Cleaning follow-up - Driveway cleaning at 123 Maple St");
assert.equal(contractFollowUp.textBody, expectedContractFollowUpText);
assert.match(contractFollowUp.htmlBody, /data-email-shell="pressureflow"/);
assert.match(contractFollowUp.htmlBody, /A quick follow-up/);
assert.match(contractFollowUp.htmlBody, /Review and sign agreement/);
assert.match(contractFollowUp.htmlBody, /href="https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token"/);
assert.match(contractFollowUp.htmlBody, /https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token/);
assert.match(contractFollowUp.textBody, /https:\/\/pressureflow\.test\/contract\/job-email-content\?token=contract-token/);

assert.equal(completion.to, "alex.rivera@example.com");
assert.equal(completion.subject, "Johnson Exterior Cleaning Certificate of Completion - 123 Maple St");
assert.equal(completion.textBody, expectedCompletionText);
assert.match(completion.htmlBody, /data-email-shell="pressureflow"/);
assert.match(completion.htmlBody, /Certificate of Completion/);
assert.match(completion.htmlBody, /\$318\.75/);
assert.match(completion.htmlBody, /View before and after photos/);
assert.match(completion.htmlBody, /href="https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token"/);
assert.match(completion.htmlBody, /https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token/);
assert.match(completion.textBody, /https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token/);

const schedule = buildScheduleConfirmationEmailMessage(
  { ...job, scheduledAt: "2026-06-10T09:00", jobDurationMinutes: 180 },
  settings,
  "https://pressureflow.test",
  { filename: "invite.ics", content: "BEGIN:VCALENDAR" },
  "June 10, 2026, 9:00 AM - 12:00 PM",
  ["Move vehicles from the driveway."]
);

assert.equal(schedule.to, "alex.rivera@example.com");
assert.equal(schedule.subject, "Johnson Exterior Cleaning schedule confirmation - 123 Maple St");
assert.equal(schedule.textBody, expectedScheduleText);
assert.equal(schedule.attachments.length, 1);
assert.equal(schedule.attachments[0].filename, "invite.ics");
assert.match(schedule.htmlBody, /data-email-shell="pressureflow"/);
assert.match(schedule.htmlBody, /Schedule Confirmation/);
assert.match(schedule.htmlBody, /Alex Rivera/);
assert.match(schedule.htmlBody, /Driveway cleaning/);
assert.match(schedule.htmlBody, /123 Maple St/);
assert.match(schedule.htmlBody, /June 10, 2026, 9:00 AM - 12:00 PM/);
assert.match(schedule.htmlBody, /Move vehicles from the driveway\./);

const estimateMailto = buildEstimateMailto(job, settings);
const expectedEstimateMailtoBody = [
  "Hi Alex Rivera,",
  "",
  "Your estimate from Johnson Exterior Cleaning is ready for review.",
  "",
  "Estimate total: $425.00",
  "This estimate is valid through July 1, 2026.",
  "Approve estimate: https://pressureflow.test/estimate/job-email-content?token=estimate-token",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
assert.equal(
  estimateMailto,
  `mailto:${encodeURIComponent("alex.rivera@example.com")}?subject=${encodeURIComponent("Johnson Exterior Cleaning estimate for Driveway cleaning at 123 Maple St")}&body=${encodeURIComponent(expectedEstimateMailtoBody)}`
);

const contractMailto = buildContractMailto(job, settings);
const expectedContractMailtoBody = [
  "Hi Alex Rivera,",
  "",
  "Your Johnson Exterior Cleaning service agreement is ready for review and signature.",
  "",
  "Review and sign: https://pressureflow.test/contract/job-email-content?token=contract-token",
  "",
  "Thank you,",
  "Johnson Exterior Cleaning"
].join("\n");
assert.equal(
  contractMailto,
  `mailto:${encodeURIComponent("alex.rivera@example.com")}?subject=${encodeURIComponent("Johnson Exterior Cleaning service agreement for Driveway cleaning at 123 Maple St")}&body=${encodeURIComponent(expectedContractMailtoBody)}`
);

const completionNotice = buildCompletionNotice(job, settings);
assert.equal(completionNotice.subject, "Johnson Exterior Cleaning service completed - 123 Maple St");
assert.match(completionNotice.body, /Hi Alex Rivera,/);
assert.match(completionNotice.body, /Your final invoice for the remaining balance has been sent through PressureFlow\./);
assert.match(completionNotice.body, /Completion photos and proof page: https:\/\/pressureflow\.test\/proof\/job-email-content\?token=proof-token/);
assert.equal(
  completionNotice.mailto,
  `mailto:${encodeURIComponent("alex.rivera@example.com")}?subject=${encodeURIComponent(completionNotice.subject)}&body=${encodeURIComponent(completionNotice.body)}`
);

console.log("email content smoke ok");
