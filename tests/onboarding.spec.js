const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  accountId: "acct-onboarding-browser",
  name: "Browser Tester",
  email: "browser.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("new tester completes onboarding and saves service defaults", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();

  await page.locator("#onboardingForm [name='businessName']").fill("Johnson Exterior Cleaning");
  await page.locator("#onboardingForm [name='serviceIndustry']").selectOption("Landscaping");
  await page.locator("#onboardingForm [name='businessEmail']").fill("owner@johnson.test");
  await page.locator("#onboardingForm [name='businessPhone']").fill("(555) 222-3333");
  await page.locator("#onboardingForm [name='defaultDepositPercent']").fill("30");
  await page.locator("#onboardingForm [name='emailSendProvider']").selectOption("smtp");
  await checkOnboardingService(page, "Lawn Mowing");
  await checkOnboardingService(page, "Hedge Trimming");
  await page.getByRole("button", { name: "Save Setup" }).click();

  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeHidden();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Johnson Exterior Cleaning");

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("#settingsDialog")).toBeVisible();
  await expect(page.locator("#settingsForm [name='businessName']")).toHaveValue("Johnson Exterior Cleaning");
  await expect(page.locator("#settingsForm [name='serviceIndustry']")).toHaveValue("Landscaping");
  await expect(page.locator("#settingsForm [name='defaultDepositPercent']")).toHaveValue("30");
  await expect(page.locator("#settingsForm [name='emailSendProvider']")).toHaveValue("smtp");

  await page.locator("#settingsDialog details.onboarding-settings").click();
  await expect(page.locator("#onboardingServiceList [data-onboarding-service='Lawn Mowing'] input[type='checkbox']")).toBeChecked();
  await expect(page.locator("#onboardingServiceList [data-onboarding-service='Hedge Trimming'] input[type='checkbox']")).toBeChecked();
});

async function checkOnboardingService(page, serviceName) {
  const row = page.locator(`#onboardingWizardServiceList [data-onboarding-service='${serviceName}']`);
  await row.locator("input[type='checkbox']").check();
  await expect(row).toHaveClass(/selected/);
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "expenses.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "webhook-events.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "settings.local.json"), JSON.stringify({
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    serviceIndustry: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  }, null, 2));
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Browser Tester Account",
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
    settings: {},
    lastLoginAt: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }], null, 2));
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
