const { test, expect } = require("@playwright/test");

const { sendCustomerEmail } = require("../email-delivery");
const { createJobActionHandler } = require("../job-actions");
const { createGoogleCalendarEvent } = require("../integrations/google");
const { sendGmailEmail } = require("../integrations/gmail");

const message = {
  to: "customer@example.com",
  subject: "Estimate",
  textBody: "Estimate text",
  htmlBody: "<p>Estimate text</p>"
};

test("SMTP estimate email is independent of missing or expired Google Calendar state", async () => {
  const previousSkip = process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
  const previousMock = process.env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK;
  process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = "true";
  process.env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK = "false";

  try {
    await expect(sendCustomerEmail({
      emailSendProvider: "smtp",
      smtpHost: "smtp.example.com",
      smtpUsername: "owner@example.com",
      smtpPassword: "smtp-password",
      smtpFromEmail: "owner@example.com",
      googleRefreshToken: "expired-calendar-token"
    }, message, { emailType: "estimate" })).resolves.toMatchObject({
      skipped: true,
      to: "customer@example.com"
    });
  } finally {
    restoreEnv("PRESSUREFLOW_SKIP_EMAIL_DELIVERY", previousSkip);
    restoreEnv("PRESSUREFLOW_AUDIT_GOOGLE_MOCK", previousMock);
  }
});

test("missing Google email connection reports email setup, not Calendar reconnect", async () => {
  const previousSkip = process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
  const previousMock = process.env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK;
  process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = "true";
  process.env.PRESSUREFLOW_AUDIT_GOOGLE_MOCK = "false";

  try {
    await expect(sendCustomerEmail({
      emailSendProvider: "google",
      googleClientId: "client",
      googleClientSecret: "secret",
      googleRedirectUri: "https://example.com/auth/google/callback"
    }, message, { emailType: "estimate" })).rejects.toThrow(/Google\/Gmail is not connected/);
    await expect(sendCustomerEmail({
      emailSendProvider: "google",
      googleClientId: "client",
      googleClientSecret: "secret",
      googleRedirectUri: "https://example.com/auth/google/callback"
    }, message, { emailType: "estimate" })).rejects.not.toThrow(/Calendar/);
  } finally {
    restoreEnv("PRESSUREFLOW_SKIP_EMAIL_DELIVERY", previousSkip);
    restoreEnv("PRESSUREFLOW_AUDIT_GOOGLE_MOCK", previousMock);
  }
});

test("Google email and Calendar token failures use separate action-specific messages", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: false,
    json: async () => ({ error: "invalid_grant" })
  });

  const settings = {
    businessName: "PressureFlow Test",
    businessEmail: "owner@example.com",
    googleClientId: "client",
    googleClientSecret: "secret",
    googleRedirectUri: "https://example.com/auth/google/callback",
    googleRefreshToken: "expired-token"
  };

  try {
    await expect(sendGmailEmail(settings, message)).rejects.toThrow(/Google\/Gmail access has expired/);
    await expect(sendGmailEmail(settings, message)).rejects.not.toThrow(/Calendar/);
    await expect(createGoogleCalendarEvent(settings, baseJob(), "2026-07-07T09:00", 90)).rejects.toThrow(/Google Calendar access has expired/);
    await expect(createGoogleCalendarEvent(settings, baseJob(), "2026-07-07T09:00", 90)).rejects.toThrow(/before scheduling jobs/);
  } finally {
    global.fetch = originalFetch;
  }
});

test("estimate resend failure rejects instead of returning a success-shaped action", async () => {
  const { applyAction } = createJobActionHandler({
    createGoogleCalendarEvent: async () => ({}),
    createPressureFlowInvoice: async () => ({}),
    readSettings: async () => ({ emailSendProvider: "smtp" }),
    randomToken: () => "token",
    sendAdminTextAlertSafe: async () => {},
    sendContractEmail: async () => {},
    sendEstimateEmail: async () => {
      throw new Error("SMTP mailbox rejected the estimate email.");
    },
    sendScheduleConfirmationEmail: async () => {},
    writeSettings: async () => {}
  });
  const job = {
    ...baseJob(),
    status: "Estimate Sent",
    estimateApprovalToken: "existing-token",
    estimateApprovalUrl: "https://example.com/estimate/job-1?token=existing-token",
    estimateSentAt: "2026-07-01T12:00:00.000Z"
  };

  await expect(applyAction(job, "resend-estimate-email", { _baseUrl: "https://example.com" })).rejects.toThrow("SMTP mailbox rejected the estimate email.");
  expect(job.estimateEmailStatus).not.toBe("sent");
});

function baseJob() {
  return {
    id: "job-1",
    accountId: "acct-1",
    customerName: "Customer One",
    email: "customer@example.com",
    phone: "(555) 111-2222",
    address: "100 Main St, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 250,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", price: 250, total: 250 }],
    status: "Lead"
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
