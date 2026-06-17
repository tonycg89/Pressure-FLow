const { test, expect } = require("@playwright/test");
const {
  createOperationalLogger,
  maskEmail,
  recipientDomain,
  redactLogContext
} = require("../operational-logger");
const { sendCustomerEmail } = require("../email-delivery");
const { createWebhookHandlers } = require("../webhooks");

test("operational logger redacts sensitive keys and token-shaped strings", () => {
  const context = redactLogContext({
    accountId: "acct-123",
    stripeWebhookSecret: "whsec_live_secret",
    nested: {
      authorization: "Bearer sk_live_secret",
      url: "https://example.test/invoice/job?token=public-token&signature=abc"
    },
    error: new Error("Request failed with access_token=abc123")
  });

  const serialized = JSON.stringify(context);
  expect(serialized).toContain("acct-123");
  expect(serialized).not.toContain("whsec_live_secret");
  expect(serialized).not.toContain("sk_live_secret");
  expect(serialized).not.toContain("public-token");
  expect(serialized).not.toContain("abc123");
  expect(context.stripeWebhookSecret).toBe("[redacted]");
  expect(context.nested.authorization).toBe("[redacted]");
  expect(context.nested.url).toContain("token=[redacted]");
  expect(context.nested.url).toContain("signature=[redacted]");
});

test("email helpers avoid logging full recipients", () => {
  expect(maskEmail("alex.rivera@example.com")).toBe("al***@example.com");
  expect(recipientDomain("alex.rivera@example.com")).toBe("example.com");
  expect(maskEmail("not-an-email")).toBe("");
  expect(recipientDomain("not-an-email")).toBe("");
});

test("logger writes a consistent JSON line", () => {
  const messages = [];
  const logger = createOperationalLogger({
    error(message) {
      messages.push(message);
    }
  });

  logger.error("email_send_failed", {
    accountId: "acct-123",
    password: "super-secret",
    error: new Error("SMTP rejected password=secret")
  });

  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("PressureFlow error:");
  expect(messages[0]).toContain("\"action\":\"email_send_failed\"");
  expect(messages[0]).toContain("\"accountId\":\"acct-123\"");
  expect(messages[0]).not.toContain("super-secret");
  expect(messages[0]).not.toContain("secret");
});

test("email failure logging avoids body, full recipient, and secrets", async () => {
  const messages = [];
  const logger = createOperationalLogger({
    error(message) {
      messages.push(message);
    }
  });

  await expect(sendCustomerEmail(
    {
      emailSendProvider: "smtp",
      smtpUsername: "smtp-user",
      smtpPassword: "smtp-secret",
      businessEmail: "owner@example.com"
    },
    {
      to: "customer.private@example.com",
      subject: "Private subject",
      textBody: "Do not log this email body",
      htmlBody: "<p>Do not log this email body</p>"
    },
    {
      logger,
      emailType: "estimate",
      accountId: "acct-log",
      jobId: "job-log"
    }
  )).rejects.toThrow("SMTP host is missing");

  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("\"action\":\"email_send_failed\"");
  expect(messages[0]).toContain("\"emailType\":\"estimate\"");
  expect(messages[0]).toContain("\"recipient\":\"cu***@example.com\"");
  expect(messages[0]).toContain("\"recipientDomain\":\"example.com\"");
  expect(messages[0]).not.toContain("customer.private@example.com");
  expect(messages[0]).not.toContain("Private subject");
  expect(messages[0]).not.toContain("Do not log this email body");
  expect(messages[0]).not.toContain("smtp-secret");
});

test("webhook ignored-event logging includes safe debugging context", async () => {
  const messages = [];
  const logger = createOperationalLogger({
    warn(message) {
      messages.push(message);
    },
    info(message) {
      messages.push(message);
    }
  });
  const handlers = createWebhookHandlers({
    readAllJobs: async () => [],
    readJobs: async () => [],
    readSettings: async () => ({}),
    readSettingsForJob: async () => ({}),
    readWebhookEvents: async () => [],
    writeWebhookEvents: async () => {},
    writeAllJobs: async () => {},
    writeJobs: async () => {},
    sendAdminTextAlertSafe: async () => {},
    sendCompletionCertificateEmailSafe: async () => {},
    logger
  });

  const result = await handlers.handleStripeWebhook({
    id: "evt_safe",
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        metadata: {
          accountId: "acct-webhook",
          jobId: "missing-job",
          invoiceType: "deposit",
          invoiceId: "invoice-token-value"
        }
      }
    }
  });

  expect(result).toEqual(expect.objectContaining({ action: "ignored", reason: "job not found" }));
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("\"action\":\"webhook_event_ignored\"");
  expect(messages[0]).toContain("\"reason\":\"job not found\"");
  expect(messages[0]).toContain("\"eventId\":\"evt_safe\"");
  expect(messages[0]).toContain("\"accountId\":\"acct-webhook\"");
  expect(messages[0]).toContain("\"jobId\":\"missing-job\"");
  expect(messages[0]).not.toContain("invoice-token-value");
});
