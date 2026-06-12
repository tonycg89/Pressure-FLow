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
  await page.getByRole("button", { name: "Edit Expense" }).click();
  await expect(page.locator("#expenseForm [name='amount']")).toHaveValue("13.35");
  await page.locator("#expenseForm [name='amount']").fill("2000");
  await expect(page.locator("#expenseForm [name='amount']")).toHaveValue("20.00");
  await page.locator("#expenseForm").getByRole("button", { name: "Save Expense" }).click();

  await expect(page.locator("#expenseDetail")).toContainText("$20.00");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete Expense" }).click();
  await expect(page.locator("#expenseList")).toContainText("No expenses yet");
});

test("contract project details show the saved business name", async ({ page }) => {
  await page.goto("/contract/job-contract-business-name?token=contract-token");

  const businessRow = page.getByRole("row", { name: /Business Johnson Exterior Cleaning/ });
  await expect(businessRow).toBeVisible();
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
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), JSON.stringify([{
    id: "job-contract-business-name",
    accountId: TEST_USER.accountId,
    customerName: "Alex Rivera",
    email: "alex@example.com",
    phone: "(555) 444-1212",
    streetAddress: "100 Main Street",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "100 Main Street, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 135,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", total: 135 }],
    status: "Contract Sent",
    contractApprovalToken: "contract-token",
    contractApprovalUrl: "http://127.0.0.1:3173/contract/job-contract-business-name?token=contract-token",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }], null, 2));
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
