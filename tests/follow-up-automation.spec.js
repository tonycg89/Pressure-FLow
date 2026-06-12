const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "55555555-5555-4555-8555-555555555555",
  accountId: "acct-follow-ups",
  name: "Follow Up Tester",
  email: "followup.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("estimate approval cancels the pending estimate follow-up", async ({ page }) => {
  const response = await page.request.post("/api/public/estimates/approve-job/approve", {
    form: { token: "approve-token" }
  });
  expect(response.ok()).toBeTruthy();

  const tasks = await readTasks();
  const task = tasks.find((item) => item.jobId === "approve-job");
  expect(task.status).toBe("cancelled");
  expect(task.cancelledReason).toBe("approved");
});

test("sending an estimate schedules an automatic follow-up", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Lead Lane/ }).click();
  await page.getByRole("button", { name: "Send Estimate" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Auto follow-up scheduled");

  const tasks = await readTasks();
  const task = tasks.find((item) => item.jobId === "lead-job");
  expect(task).toMatchObject({
    jobId: "lead-job",
    type: "estimate_followup",
    source: "auto",
    status: "pending"
  });
});

test("estimate decline cancels the pending estimate follow-up", async ({ page }) => {
  const response = await page.request.post("/api/public/estimates/reject-job/reject", {
    form: { token: "reject-token", reason: "timing-not-right" }
  });
  expect(response.ok()).toBeTruthy();

  const tasks = await readTasks();
  const task = tasks.find((item) => item.jobId === "reject-job");
  expect(task.status).toBe("cancelled");
  expect(task.cancelledReason).toBe("declined");
});

test("manual estimate advancement cancels the pending estimate follow-up", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Manual Carter/ }).click();
  await page.getByRole("button", { name: "Mark Estimate Signed" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Estimate Signed");

  const tasks = await readTasks();
  const task = tasks.find((item) => item.jobId === "manual-job");
  expect(task.status).toBe("cancelled");
  expect(task.cancelledReason).toBe("approved");
});

test("manual follow-up send cancels pending auto follow-up before sending", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Followup Stone/ }).click();
  await expect(page.locator("#jobDetail")).toContainText("Auto follow-up scheduled");
  await page.getByRole("button", { name: "Send follow-up email" }).click();
  await expect(page.locator("#followUpDialog")).toBeVisible();
  await page.locator("#followUpForm").getByRole("button", { name: "Send now" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Follow-up sent");
  await expect(page.locator("#jobDetail")).toContainText("manual");

  const tasks = await readTasks();
  const autoTask = tasks.find((item) => item.jobId === "followup-job" && item.source === "auto");
  const manualTask = tasks.find((item) => item.jobId === "followup-job" && item.source === "manual");
  expect(autoTask.status).toBe("cancelled");
  expect(autoTask.cancelledReason).toBe("manual_sent");
  expect(manualTask.status).toBe("sent");
});

test("contract signing cancels contract follow-up and schedules deposit follow-up", async ({ page }) => {
  const approveResponse = await page.request.post("/api/public/estimates/approve-job/approve", {
    form: { token: "approve-token" }
  });
  expect(approveResponse.ok()).toBeTruthy();

  let tasks = await readTasks();
  const contractTask = tasks.find((item) => item.jobId === "approve-job" && item.type === "contract_followup");
  expect(contractTask).toMatchObject({ status: "pending", source: "auto" });

  const jobs = await readJobs();
  const approvedJob = jobs.find((item) => item.id === "approve-job");
  const signResponse = await page.request.post("/api/public/contracts/approve-job/sign", {
    form: {
      token: approvedJob.contractApprovalToken,
      signerName: "Approve Parker",
      signedDate: "2026-06-12"
    }
  });
  expect(signResponse.ok()).toBeTruthy();

  tasks = await readTasks();
  const cancelledContractTask = tasks.find((item) => item.jobId === "approve-job" && item.type === "contract_followup");
  const depositTask = tasks.find((item) => item.jobId === "approve-job" && item.type === "deposit_followup");
  expect(cancelledContractTask).toMatchObject({ status: "cancelled", cancelledReason: "signed" });
  expect(depositTask).toMatchObject({ status: "pending", source: "auto" });
});

test("deposit and final invoice follow-ups cancel on payment", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Deposit Drew/ }).click();
  await expect(page.locator("#jobDetail")).toContainText("Auto follow-up scheduled");
  await page.getByRole("button", { name: "Mark Deposit Paid" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Deposit Paid");

  let tasks = await readTasks();
  const depositTask = tasks.find((item) => item.jobId === "deposit-job" && item.type === "deposit_followup");
  expect(depositTask).toMatchObject({ status: "cancelled", cancelledReason: "paid" });

  await page.getByRole("button", { name: /Completed Finn/ }).click();
  await page.getByRole("button", { name: "Send Final Invoice" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Auto follow-up scheduled");
  tasks = await readTasks();
  const invoiceTask = tasks.find((item) => item.jobId === "completed-job" && item.type === "invoice_followup");
  expect(invoiceTask).toMatchObject({ status: "pending", source: "auto" });

  await page.getByRole("button", { name: "Mark Paid" }).click();
  await expect(page.locator("#jobDetail")).toContainText("Paid");
  tasks = await readTasks();
  const cancelledInvoiceTask = tasks.find((item) => item.jobId === "completed-job" && item.type === "invoice_followup");
  expect(cancelledInvoiceTask).toMatchObject({ status: "cancelled", cancelledReason: "paid" });
});

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Johnson Exterior Cleaning");
}

async function readTasks() {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, "follow-up-tasks.json"), "utf8"));
}

async function readJobs() {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, "jobs.json"), "utf8"));
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "expenses.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "webhook-events.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Follow Up Test Account",
    plan: "tester",
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }], null, 2));
  await fs.writeFile(path.join(DATA_DIR, "users.json"), JSON.stringify([{
    id: TEST_USER.id,
    accountId: TEST_USER.accountId,
    name: TEST_USER.name,
    email: TEST_USER.email,
    passwordHash: hashPassword(TEST_USER.password),
    role: "tester",
    disabled: false,
    settings: testSettings(),
    lastLoginAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }], null, 2));
  await fs.writeFile(path.join(DATA_DIR, "settings.local.json"), JSON.stringify({
    businessName: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  }, null, 2));
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), JSON.stringify([
    leadJob("lead-job", "Lead Lane"),
    estimateJob("approve-job", "Approve Parker", "approve-token"),
    estimateJob("reject-job", "Reject Rivers", "reject-token"),
    estimateJob("manual-job", "Manual Carter", "manual-token"),
    estimateJob("followup-job", "Followup Stone", "followup-token"),
    depositJob("deposit-job", "Deposit Drew"),
    completedJob("completed-job", "Completed Finn")
  ], null, 2));
  await fs.writeFile(path.join(DATA_DIR, "follow-up-tasks.json"), JSON.stringify([
    followUpTask("approve-task", "approve-job"),
    followUpTask("reject-task", "reject-job"),
    followUpTask("manual-task", "manual-job"),
    followUpTask("followup-task", "followup-job"),
    followUpTask("deposit-task", "deposit-job", "deposit_followup")
  ], null, 2));
}

function leadJob(id, customerName) {
  return {
    id,
    accountId: TEST_USER.accountId,
    customerName,
    email: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "(555) 444-1212",
    address: "100 Main Street, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", total: 200 }],
    status: "Lead",
    suppressEstimateFollowUp: false,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function estimateJob(id, customerName, token) {
  return {
    id,
    accountId: TEST_USER.accountId,
    customerName,
    email: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "(555) 444-1212",
    address: "100 Main Street, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", total: 200 }],
    status: "Estimate Sent",
    estimateApprovalToken: token,
    estimateApprovalUrl: `http://127.0.0.1:3173/estimate/${id}?token=${token}`,
    estimateSentAt: "2026-06-01T12:00:00.000Z",
    suppressEstimateFollowUp: false,
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function depositJob(id, customerName) {
  return {
    ...leadJob(id, customerName),
    status: "Deposit Sent",
    squareDepositInvoiceId: `deposit-${id}`,
    squareDepositInvoiceUrl: `http://127.0.0.1:3173/invoice/${id}?type=deposit&token=deposit-${id}`,
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function completedJob(id, customerName) {
  return {
    ...leadJob(id, customerName),
    status: "Completed",
    completionNoticeSentAt: "",
    updatedAt: "2026-06-01T12:00:00.000Z"
  };
}

function followUpTask(id, jobId, type = "estimate_followup") {
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
    businessName: "Johnson Exterior Cleaning",
    businessEmail: "owner@johnson.test",
    businessPhone: "(555) 222-3333",
    serviceIndustry: "Pressure Washing",
    onboardingCompleted: true,
    estimateFollowUpEnabled: true,
    estimateFollowUpDelayHours: 24
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
