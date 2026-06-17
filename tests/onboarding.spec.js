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
  await loginAndCompleteOnboarding(page);

  await page.locator("#dashboardFirstRunPanel").getByRole("button", { name: "Create your first customer" }).click();
  await expect(page.locator("#customersView")).toBeVisible();
  await expect(page.locator("#customerDialog")).toBeVisible();
  await page.getByRole("button", { name: "Close Customer" }).click();
  await expect(page.locator("#customerDialog")).toBeHidden();

  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.locator("#settingsDialog")).toBeVisible();
  await expect(page.locator("#settingsForm [name='businessName']")).toHaveValue("Johnson Exterior Cleaning");
  await expect(page.locator("#settingsForm [name='serviceIndustry']")).toHaveValue("Landscaping");
  await expect(page.locator("#settingsForm [name='defaultDepositPercent']")).toHaveValue("30");
  await expect(page.locator("#settingsForm [name='emailSendProvider']")).toHaveValue("smtp");

  await page.locator("#settingsDialog details.onboarding-settings").click();
  await expect(page.locator("#onboardingServiceList [data-onboarding-service='Lawn Mowing'] input[type='checkbox']")).toBeChecked();
  await expect(page.locator("#onboardingServiceList [data-onboarding-service='Hedge Trimming'] input[type='checkbox']")).toBeChecked();

  await page.getByRole("button", { name: "Open Setup Wizard" }).click();
  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await expect(page.locator("#onboardingForm [name='businessName']")).toHaveValue("Johnson Exterior Cleaning");
  await expect(page.locator("#onboardingForm [name='serviceIndustry']")).toHaveValue("Landscaping");
  await expect(page.locator("#onboardingForm [name='customerSegment']")).toHaveValue("both");
  await expect(page.locator("#onboardingForm [name='onboardingServiceScope']")).toHaveValue("recommended");
  await expect(page.locator("#onboardingForm [name='zellePayment']")).toHaveCount(0);
  await expect(page.locator("#onboardingForm [name='venmoPayment']")).toHaveCount(0);
  await expect(page.locator("#onboardingForm [data-onboarding-panel='0']")).toBeVisible();
  await expect(page.locator("#onboardingForm [data-onboarding-panel='1']")).toBeHidden();
  await page.locator("#onboardingNextButton").click();
  await expect(page.locator("#onboardingWizardServiceList details.service-category").first().locator("summary span")).toHaveText("Landscaping");
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Lawn Mowing'] input[type='checkbox']")).toBeChecked();
  await page.locator("#onboardingBackButton").click();
  await expect(page.locator("#onboardingForm [name='businessName']")).toHaveValue("Johnson Exterior Cleaning");
  await expect(page.locator("#onboardingLogoPreview")).toBeVisible();
});

test("tester creates customer and job, sends estimate, and opens public estimate link", async ({ page, context }) => {
  await loginAndCompleteOnboarding(page);

  await page.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New Customer" }).click();
  await expect(page.locator("#customerDialog")).toBeVisible();
  await page.locator("#customerForm [name='customerName']").fill("Alex Rivera");
  await page.locator("#customerForm [name='email']").fill("alex.rivera@example.com");
  await page.locator("#customerForm [name='phone']").fill("(555) 444-1212");
  await page.locator("#customerForm [name='streetAddress']").fill("100 Main Street");
  await page.locator("#customerForm [name='city']").fill("Riverside");
  await page.locator("#customerForm [name='state']").fill("CA");
  await page.locator("#customerForm [name='zip']").fill("92501");
  await page.locator("#customerForm").getByRole("button", { name: "Save Customer" }).click();
  await expect(page.locator("#customerDialog")).toBeHidden();
  await expect(page.locator("#customerList")).toContainText("Alex Rivera");
  const customerToast = page.locator(".toast").filter({ hasText: "Customer created successfully." });
  await expect(customerToast).toBeVisible();
  await customerToast.getByRole("button", { name: "Create a job for this customer" }).click();

  await expect(page.locator("#jobDialog")).toBeVisible();
  await expect(page.locator("#jobForm [name='customerName']")).toHaveValue("Alex Rivera");
  await expect(page.locator("#jobForm [name='email']")).toHaveValue("alex.rivera@example.com");
  await page.locator("#jobForm [name='serviceType']").fill("Landscape maintenance");
  const lineItem = page.locator("#lineItems .line-item-row").first();
  await lineItem.locator(".line-service").selectOption("Lawn Mowing");
  await lineItem.locator(".line-quantity").fill("1000");
  await expect(lineItem.locator(".line-item-total span")).toHaveText("Line total");
  const lineItemText = await lineItem.innerText();
  expect(lineItemText).toContain("Rate (per SqFt)");
  await expect(lineItem.locator(".line-rate")).toHaveValue("0.04");
  await expect(page.locator("#estimateTotal")).toHaveText("$40.00");
  await page.locator("#jobForm").getByRole("button", { name: "Create Job" }).click();
  await expect(page.locator("#jobDialog")).toBeHidden();
  const jobToast = page.locator(".toast").filter({ hasText: "Job created successfully." });
  await expect(jobToast).toBeVisible();
  await jobToast.getByRole("button", { name: "View in Pipeline" }).click();
  await expect(page.locator("#jobList")).toContainText("Alex Rivera");

  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/jobs/") && response.url().endsWith("/send-square-estimate"));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Send Estimate" }).click();
  const response = await responsePromise;
  expect(response.ok()).toBeTruthy();
  const { job } = await response.json();
  expect(job.estimateApprovalUrl).toContain(`/estimate/${job.id}?token=`);
  await expect(page.locator(".toast").filter({ hasText: "Estimate sent to alex.rivera@example.com. Automatic follow-up scheduled." })).toBeVisible();
  await expect(page.locator("#jobDetail")).toContainText("View customer estimate");
  await expect(page.locator("#jobDetail")).not.toContainText("approval link");

  const publicPage = await context.newPage();
  await publicPage.goto(job.estimateApprovalUrl);
  await expect(publicPage.getByRole("heading", { name: /Landscape maintenance for Alex Rivera/ })).toBeVisible();
  await expect(publicPage.getByRole("row", { name: /Lawn Mowing 1000 SqFt \$0\.04 \/ SqFt \$40\.00/ })).toBeVisible();
  await expect(publicPage.getByText("Estimate Only, not an actual Invoice.")).toBeVisible();
  await expect(publicPage.getByText("Estimate not found")).toHaveCount(0);
});

test("pool service onboarding seeds pool catalog and per-hour custom unit is available", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await page.locator("#onboardingForm [name='businessName']").fill("Bluewater Pool Care");
  await page.locator("#onboardingForm [name='serviceIndustry']").selectOption("Pool Service");
  await page.locator("#onboardingForm [name='businessEmail']").fill("owner@bluewater.test");
  await page.locator("#onboardingNextButton").click();

  await expect(page.locator("#onboardingWizardServiceList details.service-category").first().locator("summary span")).toHaveText("Pool Service");
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Weekly Pool Service'] input[type='checkbox']")).toBeChecked();
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Chemical Balancing'] input[type='checkbox']")).toBeChecked();
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Acid Wash'] input[type='checkbox']")).not.toBeChecked();
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Weekly Pool Service']")).toContainText("Rate (per Visit)");

  await page.locator("#onboardingNextButton").click();
  await page.getByRole("button", { name: "Save Setup" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Bluewater Pool Care");

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#lineItems .line-item-row").first()).toContainText("Weekly Pool Service");
  await expect(page.locator("#estimateTotal")).toHaveText("$0.00");
  await page.getByRole("button", { name: "Custom Service" }).click();
  await expect(page.locator("#customServiceDialog")).toBeVisible();
  await expect(page.locator("#customServiceForm [name='unit']")).toContainText("Per hour");
});

async function loginAndCompleteOnboarding(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page.locator("#sidebarBusinessName")).not.toHaveText("Your Company");
  const settingsResponse = await page.request.get("/api/settings");
  expect(settingsResponse.ok()).toBeTruthy();
  const { settings } = await settingsResponse.json();
  expect(settings.mapboxPublicToken).toBe("pk.playwright-mapbox");
  expect(settings.hasMapboxPublicToken).toBe(true);

  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeVisible();
  await expect(page.locator("#onboardingForm [name='businessName']")).toHaveAttribute("placeholder", "e.g. Johnson Exterior Cleaning");
  await expect(page.locator("#onboardingWizardStatus")).toHaveText("Add the business basics that appear on estimates, invoices, and customer messages.");

  await page.locator("#onboardingForm [name='businessName']").fill("Johnson Exterior Cleaning");
  await page.locator("#onboardingForm [name='serviceIndustry']").selectOption("Landscaping");
  await page.locator("#onboardingForm [name='customerSegment']").selectOption("both");
  await page.locator("#onboardingForm [name='onboardingServiceScope']").selectOption("recommended");
  await page.locator("#onboardingForm [name='businessEmail']").fill("owner@johnson.test");
  await page.locator("#onboardingForm [name='businessPhone']").fill("(555) 222-3333");
  await page.locator("#onboardingLogoInput").setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")
  });
  await expect(page.locator("#onboardingLogoPreview")).toBeVisible();
  await expect(page.locator("#onboardingNextButton")).toBeVisible();
  await page.locator("#onboardingNextButton").click();
  await expect(page.locator("#onboardingForm [data-onboarding-panel='1']")).toBeVisible();
  await expect(page.locator("#onboardingWizardStatus")).toHaveText("Choose the services and starter rates this account should use for new estimates.");
  await expect(page.locator("#onboardingWizardServiceList details.service-category").first().locator("summary span")).toHaveText("Landscaping");
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Lawn Mowing'] input[type='checkbox']")).toBeChecked();
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Sprinkler Repair'] input[type='checkbox']")).not.toBeChecked();
  const firstCategory = page.locator("#onboardingWizardServiceList details.service-category").first();
  await firstCategory.getByRole("button", { name: "Select All", exact: true }).click();
  await firstCategory.getByRole("button", { name: "Unselect All", exact: true }).click();
  await expect(page.locator("#onboardingWizardServiceList [data-onboarding-service='Lawn Mowing'] input[type='checkbox']")).not.toBeChecked();
  await firstCategory.getByRole("button", { name: "Select All", exact: true }).click();
  await checkOnboardingService(page, "Lawn Mowing");
  await checkOnboardingService(page, "Hedge Trimming");
  await page.locator("#onboardingNextButton").click();
  await expect(page.locator("#onboardingForm [data-onboarding-panel='2']")).toBeVisible();
  await expect(page.locator("#onboardingWizardStatus")).toHaveText("Customers need at least one payment option before invoices are sent. Add options from Settings when setup is complete.");
  await expect(page.locator("#onboardingForm")).toContainText("Customers need at least one payment option before invoices are sent.");
  await expect(page.locator("#onboardingSaveButton")).toBeVisible();
  await expect(page.locator("#onboardingDepositPercentField")).toBeVisible();
  await page.locator("#onboardingForm [name='defaultDepositEnabled']").selectOption("false");
  await expect(page.locator("#onboardingDepositPercentField")).toBeHidden();
  await page.locator("#onboardingForm [name='defaultDepositEnabled']").selectOption("true");
  await expect(page.locator("#onboardingDepositPercentField")).toBeVisible();
  await page.locator("#onboardingForm [name='defaultDepositPercent']").fill("30");
  await page.locator("#onboardingForm [name='emailSendProvider']").selectOption("smtp");
  await page.getByRole("button", { name: "Save Setup" }).click();

  await expect(page.getByRole("heading", { name: "Set up your workspace" })).toBeHidden();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Johnson Exterior Cleaning");
  await expect(page.locator("#dashboardFirstRunPanel")).toBeVisible();
  await expect(page.locator("#dashboardFirstRunPanel")).toContainText("Workspace setup complete");
  await expect(page.locator("#dashboardFirstRunPanel")).toContainText("Start by adding a customer, then create a job and send your first estimate.");
  await expect(page.locator("#dashboardFirstRunPanel").getByRole("button", { name: "Create your first customer" })).toBeVisible();
  await expect(page.locator("#dashboardPaymentSetupPanel")).toBeVisible();
  await expect(page.locator("#dashboardPaymentSetupPanel")).toContainText("Set up payment options before sending invoices.");
}

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
    customerSegment: "",
    onboardingServiceScope: "",
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
