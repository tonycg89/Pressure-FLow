const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "22222222-2222-4222-8222-222222222222",
  accountId: "acct-expense-contract",
  name: "Expense Tester",
  email: "expense.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("expenses support cents-first entry, editing, and deleting", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Expenses" }).click();
  await page.getByRole("button", { name: "Add Expense" }).click();
  await page.locator("#expenseForm [name='vendor']").fill("Home Depot");
  await page.locator("#expenseForm [name='amount']").fill("1335");
  await expect(page.locator("#expenseForm [name='amount']")).toHaveValue("13.35");
  await page.locator("#expenseForm [name='category']").fill("Supplies");
  await page.locator("#expenseForm").getByRole("button", { name: "Save Expense" }).click();

  await expect(page.locator("#expenseDetail")).toContainText("$13.35");
  await expectStoredExpense(13.35, "");
  await page.getByRole("button", { name: "Edit Expense" }).click();
  await expect(page.locator("#expenseForm [name='amount']")).toHaveValue("13.35");
  await page.locator("#expenseForm [name='amount']").fill("2000");
  await expect(page.locator("#expenseForm [name='amount']")).toHaveValue("20.00");
  await page.locator("#expenseForm").getByRole("button", { name: "Save Expense" }).click();

  await expect(page.locator("#expenseDetail")).toContainText("$20.00");
  await expectStoredExpense(20, "");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Expense" }).click();
  await expect(page.locator("#expenseList")).toContainText("No expenses yet");
});

test("linked expenses can be filtered and shown in completed job profitability", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Expenses" }).click();
  await page.getByRole("button", { name: "Add Expense" }).click();
  await page.locator("#expenseForm [name='vendor']").fill("Chem Shop");
  await page.locator("#expenseForm [name='amount']").fill("12750");
  await page.locator("#expenseForm [name='category']").fill("Chemicals");
  await expect(page.locator("#expenseForm [name='jobId'] option[value='job-profitability']")).toHaveText(/Morgan Lee .+ Roof Wash .+ Completed .+ Jun/);
  await page.locator("#expenseForm [name='jobId']").selectOption("job-profitability");
  await page.locator("#expenseForm").getByRole("button", { name: "Save Expense" }).click();

  await expect(page.locator("#expenseDetail")).toContainText("Morgan Lee - Roof Wash (Completed)");
  await expectStoredExpense(127.5, "job-profitability");

  await page.locator("#expenseJobFilter").selectOption("job-profitability");
  await expect(page.locator("#expenseList")).toContainText("Chem Shop");
  await expect(page.locator("#expenseList")).toContainText("Morgan Lee - Roof Wash");

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Morgan Lee/ }).click();
  await expect(page.locator("#jobDetail")).toContainText("Job costs");
  await expect(page.locator("#jobDetail")).toContainText("Linked expenses");
  await expect(page.locator("#jobDetail")).toContainText("$127.50");
  await expect(page.locator("#jobDetail")).toContainText("View 1 expense");
  await expect(page.locator("#jobDetail")).toContainText("Invoice total");
  await expect(page.locator("#jobDetail")).toContainText("$390.00");
  await expect(page.locator("#jobDetail")).toContainText("Estimated profit");
  await expect(page.locator("#jobDetail")).toContainText("$262.50 (67% margin)");

  await page.getByRole("button", { name: "View 1 expense" }).click();
  await expect(page.locator("#expensesView")).toBeVisible();
  await expect(page.locator("#expenseJobFilter")).toHaveValue("job-profitability");
  await expect(page.locator("#expenseList")).toContainText("Chem Shop");
});

test("contract project details show the saved business name", async ({ page }) => {
  await page.goto("/contract/job-contract-business-name?token=contract-token");

  const businessRow = page.getByRole("row", { name: /Business Johnson Exterior Cleaning/ });
  await expect(businessRow).toBeVisible();
});

test("contractor public link labels use plain language", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Alex Rivera/ }).click();
  await expect(page.locator("#jobDetail")).toContainText("View contract page");
  await expect(page.locator("#jobDetail")).not.toContainText("Signing link");
});

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Johnson Exterior Cleaning");
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "expenses.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "webhook-events.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Expense Contract Test Account",
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
    ...testSettings(),
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    onboardingCompleted: false
  }, null, 2));
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), JSON.stringify([
    jobFixture({
      id: "job-contract-business-name",
      customerName: "Alex Rivera",
      serviceType: "Driveway cleaning",
      estimate: 135,
      status: "Contract Sent",
      contractApprovalToken: "contract-token",
      contractApprovalUrl: "http://127.0.0.1:3173/contract/job-contract-business-name?token=contract-token"
    }),
    jobFixture({
      id: "job-profitability",
      customerName: "Morgan Lee",
      serviceType: "Roof Wash",
      estimate: 390,
      status: "Completed",
      createdAt: "2026-06-12T12:00:00.000Z",
      updatedAt: "2026-06-12T12:00:00.000Z"
    })
  ], null, 2));
}

async function expectStoredExpense(expectedAmount, expectedJobId) {
  const expenses = JSON.parse(await fs.readFile(path.join(DATA_DIR, "expenses.json"), "utf8"));
  expect(expenses).toHaveLength(1);
  expect(expenses[0].amount).toBe(expectedAmount);
  expect(expenses[0].jobId || "").toBe(expectedJobId);
}

function jobFixture(overrides) {
  return {
    id: overrides.id,
    accountId: TEST_USER.accountId,
    customerName: overrides.customerName,
    email: `${overrides.customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "(555) 444-1212",
    streetAddress: "100 Main Street",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "100 Main Street, Riverside, CA 92501",
    serviceType: overrides.serviceType,
    estimate: overrides.estimate,
    depositPercent: 25,
    lineItems: [{ name: overrides.serviceType, quantity: 1, unit: "QTY", total: overrides.estimate }],
    status: overrides.status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function testSettings() {
  return {
    businessName: "Johnson Exterior Cleaning",
    businessEmail: "owner@johnson.test",
    businessPhone: "(555) 222-3333",
    serviceIndustry: "Pressure Washing",
    customerSegment: "residential",
    onboardingServiceScope: "recommended",
    onboardingCompleted: true,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
