const { test, expect } = require("@playwright/test");
const { createWebhookHandlers } = require("../webhooks");

test("Square payment webhooks cancel matching invoice follow-ups", async () => {
  const jobs = [
    job("square-deposit-job", "Deposit Sent", { squareDepositInvoiceId: "sq-deposit" }),
    job("square-final-job", "Final Invoice Sent", { squareFinalInvoiceId: "sq-final" })
  ];
  const cancellations = [];
  const handlers = createHandlers(jobs, cancellations);

  await handlers.handleSquareWebhook(squareInvoiceEvent("sq-deposit"));
  await handlers.handleSquareWebhook(squareInvoiceEvent("sq-final"));

  expect(cancellations).toEqual([
    { jobId: "square-deposit-job", reason: "paid", accountId: "acct-hooks", type: "deposit_followup" },
    { jobId: "square-final-job", reason: "paid", accountId: "acct-hooks", type: "invoice_followup" }
  ]);
});

test("Stripe payment webhooks cancel matching invoice follow-ups", async () => {
  const jobs = [
    job("stripe-deposit-job", "Deposit Sent", { squareDepositInvoiceId: "stripe-deposit-invoice" }),
    job("stripe-final-job", "Final Invoice Sent", { squareFinalInvoiceId: "stripe-final-invoice" })
  ];
  const cancellations = [];
  const handlers = createHandlers(jobs, cancellations);

  await handlers.handleStripeWebhook(stripeCheckoutEvent("stripe-deposit-job", "deposit", "stripe-deposit-invoice", 5000));
  await handlers.handleStripeWebhook(stripeCheckoutEvent("stripe-final-job", "final", "stripe-final-invoice", 15000));

  expect(cancellations).toEqual([
    { jobId: "stripe-deposit-job", reason: "paid", accountId: "acct-hooks", type: "deposit_followup" },
    { jobId: "stripe-final-job", reason: "paid", accountId: "acct-hooks", type: "invoice_followup" }
  ]);
});

function createHandlers(jobs, cancellations) {
  return createWebhookHandlers({
    cancelPendingFollowUp: async (jobId, reason, accountId, type) => {
      cancellations.push({ jobId, reason, accountId, type });
    },
    readAllJobs: async () => jobs,
    readJobs: async () => jobs,
    readSettings: async () => ({}),
    readSettingsForJob: async () => ({}),
    readWebhookEvents: async () => [],
    sendAdminTextAlertSafe: async () => {},
    sendCompletionCertificateEmailSafe: async () => {},
    writeAllJobs: async () => {},
    writeJobs: async () => {},
    writeWebhookEvents: async () => {}
  });
}

function squareInvoiceEvent(invoiceId) {
  return {
    data: {
      object: {
        invoice: {
          id: invoiceId,
          status: "PAID"
        }
      }
    }
  };
}

function stripeCheckoutEvent(jobId, invoiceType, invoiceId, amountTotal) {
  return {
    type: "checkout.session.completed",
    data: {
      object: {
        payment_status: "paid",
        amount_total: amountTotal,
        metadata: {
          jobId,
          accountId: "acct-hooks",
          invoiceType,
          invoiceId
        }
      }
    }
  };
}

function job(id, status, overrides = {}) {
  return {
    id,
    accountId: "acct-hooks",
    customerName: "Webhook Customer",
    email: "webhook@example.com",
    address: "100 Main Street",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    status,
    paymentRecords: [],
    ...overrides
  };
}
