const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "33333333-3333-4333-8333-333333333333",
  accountId: "acct-pending-payments",
  name: "Payment Tester",
  email: "payment.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("pending payments can be manually confirmed with method and reference", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await expect(page.locator("#pendingPaymentsList")).toContainText("Alex Rivera");
  await expect(page.locator("#pendingPaymentsList")).toContainText("Overdue");
  await page.locator("#pendingPaymentsList").getByRole("button", { name: "Mark as paid" }).click();
  await page.locator("#pendingPaymentsList select[name='paymentMethod']").selectOption("Venmo");
  await page.locator("#pendingPaymentsList input[name='paymentReference']").fill("4829301A");
  await page.locator("#pendingPaymentsList").getByRole("button", { name: "Confirm" }).click();

  await expect(page.locator("#jobDetail")).toContainText("Deposit Paid");
  await expect(page.locator("#jobDetail")).toContainText("marked paid");
  await expect(page.locator("#jobDetail")).toContainText("Venmo");
  await expect(page.locator("#jobDetail")).toContainText("4829301A");

  const jobs = JSON.parse(await fs.readFile(path.join(DATA_DIR, "jobs.json"), "utf8"));
  expect(jobs[0].status).toBe("Deposit Paid");
  expect(jobs[0].paymentRecords[0]).toMatchObject({
    invoiceType: "deposit",
    source: "manual",
    method: "Venmo",
    reference: "4829301A",
    quickBooksSyncStatus: "pending"
  });
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
    name: "Pending Payments Test Account",
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
    settings: {
      businessName: "Johnson Exterior Cleaning",
      businessEmail: "owner@johnson.test",
      businessPhone: "(555) 222-3333",
      serviceIndustry: "Pressure Washing",
      onboardingCompleted: true,
      paymentFollowUpHours: 24
    },
    lastLoginAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }], null, 2));
  await fs.writeFile(path.join(DATA_DIR, "settings.local.json"), JSON.stringify({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  }, null, 2));
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), JSON.stringify([{
    id: "44444444-4444-4444-8444-444444444444",
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
    estimate: 200,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", total: 200 }],
    status: "Deposit Sent",
    squareDepositInvoiceId: "pf-deposit-test",
    squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/44444444-4444-4444-8444-444444444444?type=deposit&token=pf-deposit-test",
    paymentRecords: [],
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  }], null, 2));
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
