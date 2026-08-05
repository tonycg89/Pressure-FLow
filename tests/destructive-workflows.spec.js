const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "77777777-7777-4777-8777-777777777777",
  accountId: "acct-destructive-workflows",
  name: "Destructive Tester",
  email: "destructive.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("customer edge data and duplicates render without breaking workflow views", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.locator("#customerForm [name='customerName']").fill(`Very Long Customer ${"Name ".repeat(30)} !@#$%^&*()`);
  await page.locator("#customerForm [name='phone']").fill("(555) 010-2020 ext. 1234567890");
  await page.locator("#customerForm [name='streetAddress']").fill(`12345 ${"Long Address ".repeat(20)} Suite #7`);
  await page.locator("#customerForm [name='city']").fill("Riverside");
  await page.locator("#customerForm [name='state']").fill("CA");
  await page.locator("#customerForm [name='zip']").fill("92501-1234");
  await page.locator("#customerForm [name='notes']").fill("Special chars: <script>alert(1)</script> & punctuation !!!");
  await page.locator("#customerForm").getByRole("button", { name: "Save Customer" }).click();

  await expect(page.locator("#customerDialog")).toBeHidden();
  await expect(page.locator("#customerDetail")).toContainText("No email");
  await expect(page.locator("#customerDetail")).toContainText("(555) 010-2020");
  await expect(page.locator("#customerDetail")).not.toContainText("undefined");
  await expect(page.locator("#customerDetail")).not.toContainText("TypeError");

  await page.getByRole("button", { name: "New Customer" }).click();
  await page.locator("#customerForm [name='customerName']").fill("Duplicate Customer");
  await page.locator("#customerForm [name='email']").fill("duplicate.one@example.com");
  await page.locator("#customerForm [name='streetAddress']").fill("100 Duplicate Way");
  await page.locator("#customerForm [name='city']").fill("Riverside");
  await page.locator("#customerForm [name='state']").fill("CA");
  await page.locator("#customerForm [name='zip']").fill("92501");
  await page.locator("#customerForm").getByRole("button", { name: "Save Customer" }).click();
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.locator("#customerForm [name='customerName']").fill("Duplicate Customer");
  await page.locator("#customerForm [name='email']").fill("duplicate.two@example.com");
  await page.locator("#customerForm [name='streetAddress']").fill("101 Duplicate Way");
  await page.locator("#customerForm [name='city']").fill("Riverside");
  await page.locator("#customerForm [name='state']").fill("CA");
  await page.locator("#customerForm [name='zip']").fill("92501");
  await page.locator("#customerForm").getByRole("button", { name: "Save Customer" }).click();

  await expect(page.locator("#customerList")).toContainText("Duplicate Customer");
  await expect(page.locator("#customerList").getByText("Duplicate Customer")).toHaveCount(2);

  const customers = await readJson("customers.json");
  const longCustomer = customers.find((customer) => customer.phone.includes("010-2020"));
  expect(longCustomer.customerName.length).toBeLessThanOrEqual(120);
  expect(longCustomer.address.length).toBeLessThanOrEqual(300);
});

test("public estimate links fail safely and duplicate approvals do not duplicate downstream work", async ({ page }) => {
  await page.goto("/estimate/estimate-large?token=estimate-token");
  await expect(page.getByRole("heading", { name: /Large destructive estimate/ })).toBeVisible();
  await expect(page.locator("body")).toContainText("$123456.78");
  await expect(page.locator("body")).toContainText("Concrete cleaning");

  const firstApproval = await page.request.post("/api/public/estimates/estimate-large/approve", {
    form: { token: "estimate-token" }
  });
  expect(firstApproval.ok()).toBeTruthy();

  let jobs = await readJson("jobs.json");
  const firstApproved = jobs.find((job) => job.id === "estimate-large");
  const firstContractSentAt = firstApproved.contractSentAt;
  const firstContractToken = firstApproved.contractApprovalToken;
  expect(firstApproved.status).toBe("Contract Sent");
  expect(firstContractToken).toBeTruthy();

  const secondApproval = await page.request.post("/api/public/estimates/estimate-large/approve", {
    form: { token: "estimate-token" }
  });
  expect(secondApproval.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  const secondApproved = jobs.find((job) => job.id === "estimate-large");
  expect(secondApproved.contractSentAt).toBe(firstContractSentAt);
  expect(secondApproved.contractApprovalToken).toBe(firstContractToken);
  const contractTasks = (await readJson("follow-up-tasks.json"))
    .filter((task) => task.jobId === "estimate-large" && task.type === "contract_followup");
  expect(contractTasks).toHaveLength(1);

  await page.goto("/estimate/estimate-large/approved?token=estimate-token");
  await expect(page.getByRole("heading", { name: "Estimate approved" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review agreement" })).toBeVisible();

  await expectSafePublicFailure(page, "/estimate/estimate-large?token=tampered", "Estimate not found", "This estimate link is invalid or has expired.");
  await expectSafePublicFailure(page, "/estimate/missing-estimate?token=estimate-token", "Estimate not found", "This estimate link is invalid or has expired.");

  await writeJson("jobs.json", jobs.filter((job) => job.id !== "estimate-large"));
  await expectSafePublicFailure(page, "/estimate/estimate-large?token=estimate-token", "Estimate not found", "This estimate link is invalid or has expired.");
});

test("public contract signing rejects malformed posts and duplicate signatures stay idempotent", async ({ page }) => {
  const missingSignature = await page.request.post("/api/public/contracts/contract-destructive/sign", {
    form: { token: "contract-token", signerName: "", signedDate: "2026-06-16" }
  });
  expect(missingSignature.url()).toContain("/contract/contract-destructive/sign-error?token=contract-token");

  const missingDate = await page.request.post("/api/public/contracts/contract-destructive/sign", {
    form: { token: "contract-token", signerName: "Contract Crusher", signedDate: "" }
  });
  expect(missingDate.url()).toContain("/contract/contract-destructive/sign-error?token=contract-token");

  let jobs = await readJson("jobs.json");
  let contractJob = jobs.find((job) => job.id === "contract-destructive");
  expect(contractJob.status).toBe("Contract Sent");
  expect(contractJob.contractSignedAt || "").toBe("");
  expect(contractJob.squareDepositInvoiceId || "").toBe("");

  const validSignature = await page.request.post("/api/public/contracts/contract-destructive/sign", {
    form: { token: "contract-token", signerName: "Contract Crusher", signedDate: "2026-06-16" }
  });
  expect(validSignature.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  contractJob = jobs.find((job) => job.id === "contract-destructive");
  const firstSignedAt = contractJob.contractSignedAt;
  const firstInvoiceId = contractJob.squareDepositInvoiceId;
  expect(contractJob.status).toBe("Deposit Sent");
  expect(contractJob.contractSignerName).toBe("Contract Crusher");
  expect(firstInvoiceId).toBeTruthy();

  const duplicateSignature = await page.request.post("/api/public/contracts/contract-destructive/sign", {
    form: { token: "contract-token", signerName: "Different Name", signedDate: "2026-06-17" }
  });
  expect(duplicateSignature.ok()).toBeTruthy();

  jobs = await readJson("jobs.json");
  contractJob = jobs.find((job) => job.id === "contract-destructive");
  expect(contractJob.contractSignedAt).toBe(firstSignedAt);
  expect(contractJob.squareDepositInvoiceId).toBe(firstInvoiceId);
  expect(contractJob.contractSignerName).toBe("Contract Crusher");
  const depositTasks = (await readJson("follow-up-tasks.json"))
    .filter((task) => task.jobId === "contract-destructive" && task.type === "deposit_followup");
  expect(depositTasks).toHaveLength(1);

  await page.goto("/contract/contract-destructive?token=contract-token");
  await expect(page.getByRole("heading", { name: "Pressure Washing Service Agreement" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Agreement" })).toHaveCount(0);
  await page.goto("/contract/contract-destructive/executed?token=contract-token");
  await expect(page.getByRole("heading", { name: "Pressure Washing Service Agreement" })).toBeVisible();

  await expectSafePublicFailure(page, "/contract/contract-destructive?token=tampered", "Service agreement not found", "This service agreement link is invalid or has expired.");
});

test("invoice, payment, and completion public links fail closed and paid state remains stable", async ({ page }) => {
  await expectSafePublicFailure(page, "/invoice/payment-destructive?type=deposit&token=tampered", "Invoice not found", "This invoice link is invalid or has expired.");
  await expectSafePublicFailure(page, "/invoice/missing-payment?type=final&token=final-token", "Invoice not found", "This invoice link is invalid or has expired.");
  await expectSafePublicFailure(page, "/proof/payment-destructive?token=tampered", "Proof page not found", "This completion proof link is invalid or has expired.");

  await login(page);
  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Payment Destructive/ }).click();
  await page.getByRole("button", { name: "Mark Deposit Paid" }).click();
  await expect(page.locator("#paymentDialog")).toBeVisible();
  await page.locator("#paymentDialog select[name='paymentMethod']").selectOption("Check");
  await page.locator("#paymentDialog input[name='paymentReference']").fill("check-1001");
  await page.locator("#paymentDialog").getByRole("button", { name: "Confirm Payment" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Deposit Paid");
  await expect(page.getByRole("button", { name: "Mark Deposit Paid" })).toHaveCount(0);

  const jobs = await readJson("jobs.json");
  const paymentJob = jobs.find((job) => job.id === "payment-destructive");
  expect(paymentJob.paymentRecords).toHaveLength(1);
  expect(paymentJob.paymentRecords[0]).toMatchObject({
    invoiceType: "deposit",
    method: "Check",
    reference: "check-1001"
  });

  await page.goto("/invoice/payment-destructive?type=deposit&token=deposit-token");
  await expect(page.getByRole("heading", { name: "Deposit Invoice" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Payment received");
  await expect(page.getByRole("button", { name: "Pay by Credit Card" })).toHaveCount(0);
});

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Destructive Exterior Cleaning");
}

async function expectSafePublicFailure(page, pathName, heading, message) {
  await page.goto(pathName);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(page.locator("body")).toContainText(message);
  await expect(page.locator("body")).toContainText("This secure customer page is generated by PressureFlow for Your Company.");
  await expect(page.locator("body")).not.toContainText("TypeError");
  await expect(page.locator("body")).not.toContainText("ReferenceError");
  await expect(page.locator("body")).not.toContainText("Destructive Exterior Cleaning");
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, fileName), "utf8"));
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(DATA_DIR, fileName), JSON.stringify(value, null, 2));
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJson("expenses.json", []);
  await writeJson("customers.json", [{
    id: "existing-customer",
    accountId: TEST_USER.accountId,
    customerName: "Existing Customer",
    email: "existing@example.com",
    phone: "(555) 111-1111",
    streetAddress: "10 Existing Way",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "10 Existing Way, Riverside, CA 92501",
    leadSource: "referral",
    notes: "",
    serviceAreaPhotos: [],
    propertyMeasurements: [],
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  }]);
  await writeJson("webhook-events.json", []);
  await writeJson("accounts.json", [{
    id: TEST_USER.accountId,
    name: "Destructive Test Account",
    plan: "tester",
    status: "active",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  }]);
  await writeJson("users.json", [{
    id: TEST_USER.id,
    accountId: TEST_USER.accountId,
    name: TEST_USER.name,
    email: TEST_USER.email,
    passwordHash: hashPassword(TEST_USER.password),
    role: "tester",
    disabled: false,
    settings: testSettings(),
    lastLoginAt: "",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  }]);
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
  await writeJson("jobs.json", [
    estimateJob(),
    contractJob(),
    paymentJob()
  ]);
  await writeJson("follow-up-tasks.json", [
    followUpTask("estimate-existing-task", "estimate-large", "estimate_followup"),
    followUpTask("contract-existing-task", "contract-destructive", "contract_followup"),
    followUpTask("payment-existing-task", "payment-destructive", "deposit_followup")
  ]);
}

function estimateJob() {
  return {
    ...baseJob("estimate-large", "Estimate Edge", "Estimate Sent"),
    serviceType: "Large destructive estimate",
    estimate: 123456.78,
    notes: "Long public estimate notes ".repeat(80),
    lineItems: [
      { name: "Concrete cleaning", quantity: 25000, unit: "SqFt", price: 2.5, total: 62500 },
      { name: "Rust removal and punctuation !@#$%", quantity: 3, unit: "Qty", price: 1500, total: 4500 },
      { name: "Commercial exterior detail", quantity: 1, unit: "Qty", price: 56456.78, total: 56456.78 }
    ],
    estimateApprovalToken: "estimate-token",
    estimateApprovalUrl: "http://127.0.0.1:3173/estimate/estimate-large?token=estimate-token",
    estimateSentAt: "2026-06-01T12:00:00.000Z"
  };
}

function contractJob() {
  return {
    ...baseJob("contract-destructive", "Contract Crusher", "Contract Sent"),
    contractApprovalToken: "contract-token",
    contractApprovalUrl: "http://127.0.0.1:3173/contract/contract-destructive?token=contract-token",
    contractSentAt: "2026-06-01T12:00:00.000Z"
  };
}

function paymentJob() {
  return {
    ...baseJob("payment-destructive", "Payment Destructive", "Deposit Sent"),
    squareDepositInvoiceId: "deposit-token",
    squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/payment-destructive?type=deposit&token=deposit-token",
    completionProofToken: "proof-token",
    completionProofUrl: "http://127.0.0.1:3173/proof/payment-destructive?token=proof-token",
    jobPhotos: {
      before: [{ name: "before.gif", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }],
      after: [{ name: "after.gif", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }]
    }
  };
}

function baseJob(id, customerName, status) {
  return {
    id,
    accountId: TEST_USER.accountId,
    customerName,
    email: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "(555) 222-3333",
    streetAddress: "200 Destructive Test Road",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "200 Destructive Test Road, Riverside, CA 92501",
    serviceType: "Pressure washing",
    leadSource: "referral",
    estimate: 800,
    depositPercent: 25,
    lineItems: [{ name: "Pressure washing", quantity: 1, unit: "Qty", price: 800, total: 800 }],
    status,
    scheduledAt: "",
    notes: "",
    accessNotes: "",
    sensitiveAreas: "",
    paymentRecords: [],
    suppressEstimateFollowUp: false,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function followUpTask(id, jobId, type) {
  return {
    id,
    accountId: TEST_USER.accountId,
    jobId,
    type,
    source: "auto",
    scheduledFor: "2026-06-02T12:00:00.000Z",
    status: "pending",
    cancelledReason: "",
    sentAt: "",
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function testSettings() {
  return {
    businessName: "Destructive Exterior Cleaning",
    businessEmail: "owner@destructive.test",
    businessPhone: "(555) 777-1212",
    businessLogoDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    serviceIndustry: "Pressure Washing",
    onboardingCompleted: true,
    estimateFollowUpEnabled: true,
    estimateFollowUpDelayHours: 24,
    paymentFollowUpHours: 24,
    stripeSecretKey: "sk_test_destructive_display_only",
    zellePayment: "owner@destructive.test"
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
