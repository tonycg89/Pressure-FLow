const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const NOW = "2026-06-17T12:00:00.000Z";
const STRIPE_SECRET_A = "whsec_tenant_a";
const STRIPE_SECRET_B = "whsec_tenant_b";
const SQUARE_SECRET_A = "square_tenant_a";
const SQUARE_SECRET_B = "square_tenant_b";

const TENANT_A = {
  id: "aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa",
  accountId: "acct-webhook-a",
  email: "webhook.a@example.com",
  businessName: "Webhook A Washing"
};

const TENANT_B = {
  id: "bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb",
  accountId: "acct-webhook-b",
  email: "webhook.b@example.com",
  businessName: "Webhook B Washing"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("Stripe webhooks fail closed without a valid signature and secret", async ({ request }) => {
  const raw = JSON.stringify(stripeEvent({
    jobId: "a-deposit-job",
    accountId: TENANT_A.accountId,
    invoiceType: "deposit",
    invoiceId: "stripe-a-deposit",
    amountTotal: 5000
  }));

  expect((await request.post("/webhooks/stripe", { data: raw, headers: { "content-type": "application/json" } })).status()).toBe(401);
  expect((await request.post("/webhooks/stripe", {
    data: raw,
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(raw, "wrong-secret")
    }
  })).status()).toBe(401);

  await resetTestData({ tenantAStripeSecret: "" });
  expect((await request.post("/webhooks/stripe", {
    data: raw,
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(raw, STRIPE_SECRET_A)
    }
  })).status()).toBe(401);

  const jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-square-deposit-job").status).toBe("Deposit Sent");
  expect(jobs.find((job) => job.id === "a-square-deposit-job").paymentRecords).toHaveLength(0);
});

test("Stripe valid, duplicate, forged, amount-mismatch, and already-paid events are safe", async ({ request }) => {
  const validRaw = JSON.stringify(stripeEvent({
    jobId: "a-deposit-job",
    accountId: TENANT_A.accountId,
    invoiceType: "deposit",
    invoiceId: "stripe-a-deposit",
    amountTotal: 5000
  }));
  const validHeaders = signedStripeHeaders(validRaw, STRIPE_SECRET_A);

  const first = await request.post("/webhooks/stripe", { data: validRaw, headers: validHeaders });
  expect(first.ok()).toBeTruthy();

  let jobs = await readJson("jobs.json");
  let depositJob = jobs.find((job) => job.id === "a-deposit-job");
  expect(depositJob.status).toBe("Deposit Paid");
  expect(depositJob.paymentRecords).toHaveLength(1);
  const firstPaidAt = depositJob.squareDepositPaidAt;
  const firstRecord = depositJob.paymentRecords[0];

  const duplicate = await request.post("/webhooks/stripe", { data: validRaw, headers: validHeaders });
  expect(duplicate.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  depositJob = jobs.find((job) => job.id === "a-deposit-job");
  expect(depositJob.paymentRecords).toHaveLength(1);
  expect(depositJob.paymentRecords[0]).toEqual(firstRecord);
  expect(depositJob.squareDepositPaidAt).toBe(firstPaidAt);

  const forgedRaw = JSON.stringify(stripeEvent({
    jobId: "b-deposit-job",
    accountId: TENANT_A.accountId,
    invoiceType: "deposit",
    invoiceId: "stripe-b-deposit",
    amountTotal: 5000
  }));
  const forged = await request.post("/webhooks/stripe", {
    data: forgedRaw,
    headers: signedStripeHeaders(forgedRaw, STRIPE_SECRET_B)
  });
  expect(forged.ok()).toBeTruthy();

  const mismatchRaw = JSON.stringify(stripeEvent({
    jobId: "a-final-job",
    accountId: TENANT_A.accountId,
    invoiceType: "final",
    invoiceId: "stripe-a-final",
    amountTotal: 123
  }));
  const mismatch = await request.post("/webhooks/stripe", {
    data: mismatchRaw,
    headers: signedStripeHeaders(mismatchRaw, STRIPE_SECRET_A)
  });
  expect(mismatch.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "b-deposit-job").status).toBe("Deposit Sent");
  expect(jobs.find((job) => job.id === "b-deposit-job").paymentRecords).toHaveLength(0);
  expect(jobs.find((job) => job.id === "a-final-job").status).toBe("Final Invoice Sent");
  expect(jobs.find((job) => job.id === "a-final-job").paymentRecords).toHaveLength(0);
});

test("Square webhooks fail closed without a valid signature and secret", async ({ request }) => {
  const raw = JSON.stringify(squareInvoiceEvent("square-a-deposit", 5000));

  expect((await request.post("/webhooks/square", { data: raw, headers: { "content-type": "application/json" } })).status()).toBe(401);
  expect((await request.post("/webhooks/square", {
    data: raw,
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": squareSignature(raw, "wrong-secret")
    }
  })).status()).toBe(401);

  await resetTestData({ tenantASquareSecret: "" });
  expect((await request.post("/webhooks/square", {
    data: raw,
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": squareSignature(raw, SQUARE_SECRET_A)
    }
  })).status()).toBe(401);

  const jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-deposit-job").status).toBe("Deposit Sent");
  expect(jobs.find((job) => job.id === "a-deposit-job").paymentRecords).toHaveLength(0);
});

test("Square valid, duplicate, amount-mismatch, and unknown invoice events are safe", async ({ request }) => {
  const validRaw = JSON.stringify(squareInvoiceEvent("square-a-final", 15000));
  const validHeaders = signedSquareHeaders(validRaw, SQUARE_SECRET_A);

  const first = await request.post("/webhooks/square", { data: validRaw, headers: validHeaders });
  expect(first.ok()).toBeTruthy();

  let jobs = await readJson("jobs.json");
  let finalJob = jobs.find((job) => job.id === "a-square-final-job");
  expect(finalJob.status).toBe("Paid");
  expect(finalJob.paymentRecords).toHaveLength(1);
  const firstPaidAt = finalJob.squareFinalPaidAt;
  const firstRecord = finalJob.paymentRecords[0];

  const duplicate = await request.post("/webhooks/square", { data: validRaw, headers: validHeaders });
  expect(duplicate.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  finalJob = jobs.find((job) => job.id === "a-square-final-job");
  expect(finalJob.paymentRecords).toHaveLength(1);
  expect(finalJob.paymentRecords[0]).toEqual(firstRecord);
  expect(finalJob.squareFinalPaidAt).toBe(firstPaidAt);

  const mismatchRaw = JSON.stringify(squareInvoiceEvent("square-a-deposit", 123));
  const mismatch = await request.post("/webhooks/square", {
    data: mismatchRaw,
    headers: signedSquareHeaders(mismatchRaw, SQUARE_SECRET_A)
  });
  expect(mismatch.ok()).toBeTruthy();

  const unknownRaw = JSON.stringify(squareInvoiceEvent("missing-invoice", 5000));
  const unknown = await request.post("/webhooks/square", {
    data: unknownRaw,
    headers: signedSquareHeaders(unknownRaw, SQUARE_SECRET_A)
  });
  expect(unknown.status()).toBe(401);

  jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-square-deposit-job").status).toBe("Deposit Sent");
  expect(jobs.find((job) => job.id === "a-square-deposit-job").paymentRecords).toHaveLength(0);
  expect(jobs.find((job) => job.id === "b-deposit-job").status).toBe("Deposit Sent");
  expect(jobs.find((job) => job.id === "b-deposit-job").paymentRecords).toHaveLength(0);
});

function stripeEvent({ jobId, accountId, invoiceType, invoiceId, amountTotal }) {
  return {
    id: `evt_${jobId}_${invoiceType}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${jobId}_${invoiceType}`,
        payment_status: "paid",
        amount_total: amountTotal,
        metadata: {
          jobId,
          accountId,
          invoiceType,
          invoiceId
        }
      }
    }
  };
}

function squareInvoiceEvent(invoiceId, paidCents) {
  return {
    merchant_id: "merchant-test",
    type: "invoice.payment_made",
    data: {
      object: {
        invoice: {
          id: invoiceId,
          status: "PAID",
          payment_requests: [{
            computed_amount_money: { amount: paidCents, currency: "USD" },
            total_completed_amount_money: { amount: paidCents, currency: "USD" }
          }]
        }
      }
    }
  };
}

function signedStripeHeaders(raw, secret) {
  return {
    "content-type": "application/json",
    "stripe-signature": stripeSignature(raw, secret)
  };
}

function stripeSignature(raw, secret) {
  const timestamp = "1781712000";
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function signedSquareHeaders(raw, secret) {
  return {
    "content-type": "application/json",
    "x-square-hmacsha256-signature": squareSignature(raw, secret)
  };
}

function squareSignature(raw, secret) {
  const notificationUrl = "http://127.0.0.1:3173/webhooks/square";
  return crypto.createHmac("sha256", secret).update(`${notificationUrl}${raw}`).digest("base64");
}

async function resetTestData(options = {}) {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJson("accounts.json", [account(TENANT_A), account(TENANT_B)]);
  await writeJson("users.json", [
    user(TENANT_A, options.tenantAStripeSecret ?? STRIPE_SECRET_A, options.tenantASquareSecret ?? SQUARE_SECRET_A),
    user(TENANT_B, STRIPE_SECRET_B, SQUARE_SECRET_B)
  ]);
  await writeJson("settings.local.json", {
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  });
  await writeJson("customers.json", []);
  await writeJson("expenses.json", []);
  await writeJson("follow-up-tasks.json", [
    followUp("a-deposit-follow-up", TENANT_A.accountId, "a-deposit-job", "deposit_followup"),
    followUp("a-final-follow-up", TENANT_A.accountId, "a-final-job", "invoice_followup"),
    followUp("b-deposit-follow-up", TENANT_B.accountId, "b-deposit-job", "deposit_followup")
  ]);
  await writeJson("webhook-events.json", []);
  await writeJson("jobs.json", [
    job("a-deposit-job", TENANT_A.accountId, "Tenant A Deposit", "Deposit Sent", {
      squareDepositInvoiceId: "stripe-a-deposit",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/a-deposit-job?type=deposit&token=stripe-a-deposit"
    }),
    job("a-final-job", TENANT_A.accountId, "Tenant A Final", "Final Invoice Sent", {
      squareDepositInvoiceStatus: "PAID",
      squareDepositPaidAt: NOW,
      squareFinalInvoiceId: "stripe-a-final",
      squareFinalInvoiceUrl: "http://127.0.0.1:3173/invoice/a-final-job?type=final&token=stripe-a-final"
    }),
    job("a-square-deposit-job", TENANT_A.accountId, "Tenant A Square Deposit", "Deposit Sent", {
      squareDepositInvoiceId: "square-a-deposit",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/a-square-deposit-job?type=deposit&token=square-a-deposit"
    }),
    job("a-square-final-job", TENANT_A.accountId, "Tenant A Square Final", "Final Invoice Sent", {
      squareDepositInvoiceStatus: "PAID",
      squareDepositPaidAt: NOW,
      squareFinalInvoiceId: "square-a-final",
      squareFinalInvoiceUrl: "http://127.0.0.1:3173/invoice/a-square-final-job?type=final&token=square-a-final"
    }),
    job("b-deposit-job", TENANT_B.accountId, "Tenant B Deposit", "Deposit Sent", {
      email: "tenant-b-webhook-secret@example.com",
      squareDepositInvoiceId: "stripe-b-deposit",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/b-deposit-job?type=deposit&token=stripe-b-deposit"
    })
  ]);
}

function account(tenant) {
  return {
    id: tenant.accountId,
    name: tenant.businessName,
    plan: "tester",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function user(tenant, stripeWebhookSecret, squareWebhookSignatureKey) {
  return {
    id: tenant.id,
    accountId: tenant.accountId,
    name: tenant.businessName,
    email: tenant.email,
    passwordHash: "not-used",
    role: "tester",
    disabled: false,
    settings: {
      businessName: tenant.businessName,
      businessEmail: tenant.email,
      businessPhone: "(555) 222-3333",
      stripeSecretKey: "sk_test_not_used",
      stripeWebhookSecret,
      squareWebhookSignatureKey,
      paymentInstructions: "Webhook test payments only.",
      onboardingCompleted: true,
      customServices: [],
      customServiceTypes: [],
      customPhotoSections: [],
      customTemplates: []
    },
    lastLoginAt: "",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function job(id, accountId, customerName, status, overrides = {}) {
  return {
    id,
    accountId,
    customerName,
    email: `${id}@example.com`,
    phone: "(555) 333-4444",
    address: "100 Webhook Road, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "Qty", price: 200, total: 200 }],
    status,
    paymentRecords: [],
    squareDepositInvoiceStatus: "",
    squareDepositPaidAt: "",
    squareFinalInvoiceStatus: "",
    squareFinalPaidAt: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function followUp(id, accountId, jobId, type) {
  return {
    id,
    accountId,
    jobId,
    type,
    source: "auto",
    scheduledFor: "2099-06-17T12:00:00.000Z",
    status: "pending",
    cancelledReason: "",
    sentAt: "",
    createdAt: NOW,
    updatedAt: NOW
  };
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, fileName), "utf8"));
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(DATA_DIR, fileName), JSON.stringify(value, null, 2));
}
