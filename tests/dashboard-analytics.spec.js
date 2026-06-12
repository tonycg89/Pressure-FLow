const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "66666666-6666-4666-8666-666666666666",
  accountId: "acct-dashboard-analytics",
  name: "Analytics Tester",
  email: "analytics.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("lead-source conversion excludes jobs with blank lead source", async ({ page }) => {
  await login(page);

  const referralRow = page.locator("#leadSourceBreakdown .breakdown-row").filter({ hasText: "Referral" });
  await expect(referralRow).toContainText("1 job");
  await expect(referralRow).toContainText("1 sent");
  await expect(referralRow).toContainText("1 accepted");
  await expect(referralRow).toContainText("100% converted");
  await expect(referralRow).toContainText("$200.00");

  await expect(page.locator("#leadSourceBreakdown")).not.toContainText("Unknown");
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
  await fs.writeFile(path.join(DATA_DIR, "follow-up-tasks.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Dashboard Analytics Test Account",
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
      onboardingCompleted: true
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
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), JSON.stringify([
    job("explicit-referral", "Referral Won", "referral", "Paid", 200, { squareFinalPaidAt: new Date().toISOString() }),
    job("blank-sent", "Blank Sent", "", "Estimate Sent", 300),
    job("blank-accepted", "Blank Accepted", "", "Estimate Signed", 400),
    job("blank-paid", "Blank Paid", "", "Paid", 500, { squareFinalPaidAt: new Date().toISOString() })
  ], null, 2));
}

function job(id, customerName, leadSource, status, estimate, extras = {}) {
  const now = new Date().toISOString();
  return {
    id,
    accountId: TEST_USER.accountId,
    customerName,
    email: `${customerName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    phone: "(555) 444-1212",
    address: "100 Main Street, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    leadSource,
    estimate,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "QTY", total: estimate }],
    status,
    createdAt: now,
    updatedAt: now,
    ...extras
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
