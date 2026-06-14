const assert = require("node:assert/strict");
const {
  buildCompletionCertificateEmailMessage,
  buildContractEmailMessage,
  buildEstimateEmailMessage,
  buildFollowUpEmailMessage,
  buildPressureFlowInvoiceEmailMessage,
  buildScheduleConfirmationEmailMessage
} = require("../email-content");

const settings = {
  businessName: "Johnson Exterior Cleaning",
  businessEmail: "owner@johnson.test",
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

const estimate = buildEstimateEmailMessage(job, settings);
assert.equal(estimate.to, "alex.rivera@example.com");
assert.equal(estimate.subject, "Johnson Exterior Cleaning estimate for Driveway cleaning at 123 Maple St");
assert.equal(estimate.textBody, expectedEstimateText);
assert.match(estimate.htmlBody, /data-email-shell="pressureflow"/);
assert.match(estimate.htmlBody, /Your service estimate is ready/);
assert.match(estimate.htmlBody, /Alex Rivera/);
assert.match(estimate.htmlBody, /Johnson Exterior Cleaning/);
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
const estimateFollowUp = buildFollowUpEmailMessage(job, settings, "estimate_followup");
const contractFollowUp = buildFollowUpEmailMessage(job, settings, "contract_followup");
const completion = buildCompletionCertificateEmailMessage(job, settings, "https://pressureflow.test");
const schedule = buildScheduleConfirmationEmailMessage(
  { ...job, scheduledAt: "2026-06-10T09:00", jobDurationMinutes: 180 },
  settings,
  "https://pressureflow.test",
  { filename: "invite.ics", content: "BEGIN:VCALENDAR" },
  "June 10, 2026, 9:00 AM - 12:00 PM",
  ["Move vehicles from the driveway."]
);

[
  depositInvoice,
  finalInvoice,
  estimateFollowUp,
  contractFollowUp,
  completion,
  schedule
].forEach((message) => {
  assert.doesNotMatch(message.htmlBody, /data-email-shell="pressureflow"/);
});

console.log("email content smoke ok");
