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

test("customer save auth failures show session toast without losing the draft", async ({ page }) => {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

  await login(page);
  await page.route("**/api/customers", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Authentication required." })
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.locator("#customerForm [name='customerName']").fill("Session Draft Customer");
  await page.locator("#customerForm [name='email']").fill("session.draft@example.com");
  await page.locator("#customerForm").getByRole("button", { name: "Save Customer" }).click();

  await expect(page.locator("#customerDialog")).toBeVisible();
  await expect(page.locator("#customerForm [name='customerName']")).toHaveValue("Session Draft Customer");
  await expect(page.locator(".toast")).toContainText("Your session expired. Sign in again to save changes.");
  await expect(page.locator(".toast").getByRole("button", { name: "Sign in" })).toBeVisible();
  expect(dialogs).toEqual([]);
});

test("settings opens from each main view and view headings stay current", async ({ page }) => {
  await login(page);

  const views = [
    ["Dashboard", "#dashboardView", "Dashboard"],
    ["Pipeline", "#pipelineView", "Pipeline"],
    ["Calendar", "#calendarView", "Calendar"],
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

test("calendar view shows scheduled jobs by month week and day", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Calendar" }).click();
  await expect(page.locator("#calendarView")).toBeVisible();
  await expect(page.locator("#calendarRangeTitle")).toBeVisible();
  await expect(page.locator("#calendarTodayButton")).toHaveText("Today");
  await expect(page.locator("#calendarJobCount")).toContainText("2 scheduled jobs");
  await expect(page.locator("#calendarJobCount")).toContainText("0 complete");
  await expect(page.locator("#calendarGrid")).toContainText("Blank Sent");
  await expect(page.locator("#calendarGrid")).toContainText("Blank Accepted");

  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.locator("#calendarGrid")).toContainText("Blank Sent");
  await expect(page.locator("#calendarGrid")).toContainText("Blank Accepted");

  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(page.locator("#calendarGrid")).toContainText("Blank Sent");
  await expect(page.locator("#calendarGrid")).toContainText("Status");
  await expect(page.locator("#calendarGrid")).toContainText("Estimate Sent");
  await expect(page.locator("#calendarGrid")).toContainText("$300.00");

  await page.locator(".calendar-day-detail", { hasText: "Blank Sent" }).getByRole("button", { name: "Open Job" }).click();
  await expect(page.locator("#pipelineView")).toBeVisible();
  await expect(page.locator("#jobDetail")).toContainText("Blank Sent");
});

test("job action failures with empty server responses show a clear retry message", async ({ page }) => {
  const jobsPath = path.join(DATA_DIR, "jobs.json");
  const jobs = JSON.parse(await fs.readFile(jobsPath, "utf8"));
  jobs.push(job("lead-empty-response", "Lead Empty Response", "", "Lead", 150));
  await fs.writeFile(jobsPath, JSON.stringify(jobs, null, 2));

  await login(page);

  await page.route("**/api/jobs/lead-empty-response/send-square-estimate", async (route) => {
    await route.fulfill({ status: 502, body: "" });
  });

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Lead Empty Response/ }).click();
  await page.getByRole("button", { name: "Send by Email" }).first().click();
  await expect(page.locator(".workflow-action-status.error")).toHaveText("The server returned an empty response HTTP 502. Please try again.");
});

test("estimate action route returns structured JSON for malformed requests", async ({ page }) => {
  const jobsPath = path.join(DATA_DIR, "jobs.json");
  const jobs = JSON.parse(await fs.readFile(jobsPath, "utf8"));
  jobs.push(job("lead-structured-error", "Lead Structured Error", "", "Lead", 150));
  await fs.writeFile(jobsPath, JSON.stringify(jobs, null, 2));

  await login(page);
  const sessionResponse = await page.request.get("/api/session");
  expect(sessionResponse.ok()).toBeTruthy();
  const session = await sessionResponse.json();
  const response = await page.evaluate(async (csrfToken) => {
    const result = await fetch("/api/jobs/lead-structured-error/send-square-estimate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": csrfToken
      },
      body: "{bad-json"
    });
    return {
      status: result.status,
      contentType: result.headers.get("content-type"),
      body: await result.text()
    };
  }, session.csrfToken);

  expect(response.status).toBe(400);
  expect(response.contentType).toContain("application/json");
  expect(JSON.parse(response.body)).toEqual({ error: "Invalid JSON request body." });
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
    job("blank-sent", "Blank Sent", "", "Estimate Sent", 300, { scheduledAt: localDateTime(9, 0), jobDurationMinutes: 120 }),
    job("blank-accepted", "Blank Accepted", "", "Estimate Signed", 400, { scheduledAt: localDateTime(13, 30), jobDurationMinutes: 90 }),
    job("blank-paid", "Blank Paid", "", "Paid", 500, { squareFinalPaidAt: new Date().toISOString() }),
    job("paid-timestamp", "Paid Timestamp", "", "Final Invoice Sent", 250, { squareFinalPaidAt: new Date().toISOString() })
  ], null, 2));
}

function localDateTime(hour, minute) {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
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
