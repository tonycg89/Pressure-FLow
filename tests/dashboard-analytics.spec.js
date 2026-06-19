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
  await expect(referralRow).toContainText("3 jobs");
  await expect(referralRow).toContainText("3/3 accepted");
  await expect(referralRow).toContainText("100% converted");
  await expect(referralRow).toContainText("$600.00");
  await expect(page.locator("#dashTopSource")).toHaveText("Referral");
  await expect(page.locator("#dashTopSourceMeta")).toHaveText("100% conversion · 3 jobs");

  await expect(page.locator("#leadSourceBreakdown")).not.toContainText("Unknown");
});

test("dashboard open jobs excludes paid work and notification bell icon is visible", async ({ page }) => {
  await login(page);

  await expect(page.locator("#openJobs")).toHaveText("2");
  await expect(page.locator("#notificationToggle .notification-toggle__label")).toHaveText("Activity");
  await expect(page.locator("#notificationToggle .button-icon")).toBeVisible();
  await expect(page.locator("#notificationCount")).toBeVisible();
  const iconBox = await page.locator("#notificationToggle .button-icon").boundingBox();
  expect(iconBox?.width).toBeGreaterThan(0);
  expect(iconBox?.height).toBeGreaterThan(0);
});

test("settings save shows lightweight success feedback", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settingsDialog")).toBeVisible();
  await page.locator("#businessLogoInput").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
  });
  await expect(page.locator("#businessLogoPreview")).toBeVisible();
  await page.getByRole("button", { name: "Save Settings" }).click();
  await expect(page.locator("#settingsDialog")).toBeHidden();
  await expect(page.locator(".toast").filter({ hasText: "Settings saved." })).toBeVisible();

  const settingsResponse = await page.request.get("/api/settings");
  expect(settingsResponse.ok()).toBeTruthy();
  const { settings } = await settingsResponse.json();
  expect(settings.businessLogoDataUrl).toMatch(/^data:image\/png;base64,/);
});

test("settings opens from each main view and view headings stay current", async ({ page }) => {
  await login(page);

  const views = [
    ["Dashboard", "#dashboardView", "Dashboard"],
    ["Pipeline", "#pipelineView", "Pipeline"],
    ["Customers", "#customersView", "Customers"],
    ["Templates", "#templatesView", "Templates"],
    ["Expenses", "#expensesView", "Expenses"]
  ];

  for (const [navName, viewSelector, heading] of views) {
    await page.getByRole("button", { name: navName }).click();
    await expect(page.locator(viewSelector)).toBeVisible();
    await expect(page.locator(`${viewSelector} > .topbar h2`)).toHaveText(heading);
    if (heading !== "Dashboard") {
      await expect(page.locator(`${viewSelector} > .topbar h2`)).not.toHaveText("Dashboard");
    }

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.locator("#settingsDialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Close Settings" }).click();
    await expect(page.locator("#settingsDialog")).toBeHidden();
    await expect(page.getByRole("button", { name: "Settings", exact: true })).toHaveAttribute("aria-pressed", "false");
  }
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
    job("explicit-referral-1", "Referral Won 1", "referral", "Paid", 200, { squareFinalPaidAt: new Date().toISOString() }),
    job("explicit-referral-2", "Referral Won 2", "referral", "Paid", 200, { squareFinalPaidAt: new Date().toISOString() }),
    job("explicit-referral-3", "Referral Won 3", "referral", "Paid", 200, { squareFinalPaidAt: new Date().toISOString() }),
    job("blank-sent", "Blank Sent", "", "Estimate Sent", 300),
    job("blank-accepted", "Blank Accepted", "", "Estimate Signed", 400),
    job("blank-paid", "Blank Paid", "", "Paid", 500, { squareFinalPaidAt: new Date().toISOString() }),
    job("paid-timestamp", "Paid Timestamp", "", "Final Invoice Sent", 250, { squareFinalPaidAt: new Date().toISOString() })
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
