const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "88888888-8888-4888-8888-888888888888",
  accountId: "acct-mobile-hardening",
  name: "Mobile Tester",
  email: "mobile.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async ({ page }) => {
  await resetTestData();
  await installMapboxMocks(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("mobile form controls and workflow actions meet touch sizing requirements", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await expectMinHeight(page.locator("#newJobButton"), 44);
  await page.getByRole("button", { name: /Mobile Lead/ }).click();
  await expectMinHeight(page.getByRole("button", { name: "Send Estimate" }), 44);

  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#jobDialog")).toBeVisible();
  await expect(page.locator("#jobForm datalist")).toHaveCount(0);
  await expect(page.locator("#jobCustomerSelect")).toHaveJSProperty("tagName", "SELECT");
  await expect(page.locator("#jobForm [name='serviceType']")).toHaveJSProperty("tagName", "SELECT");
  await page.locator("#jobCustomerSelect").selectOption("mobile-existing-customer");
  await expect(page.locator("#jobForm [name='customerName']")).toHaveValue("Mobile Existing Customer");
  await expect(page.locator("#jobForm [name='email']")).toHaveValue("existing.mobile@example.com");
  await expect(page.locator("#jobForm [name='streetAddress']")).toHaveValue("700 Saved Customer Lane");
  await expect(page.locator("#lineItems .line-item-index")).toHaveText(["Service 1"]);
  await page.getByRole("button", { name: "Add Service", exact: true }).click();
  await expect(page.locator("#lineItems .line-item-index")).toHaveText(["Service 1", "Service 2"]);
  await expect(page.getByRole("button", { name: "Add Custom Service" })).toBeVisible();
  const serviceActionsAreBelowRows = await page.locator(".estimate-builder").evaluate((builder) => {
    const lineItems = builder.querySelector("#lineItems");
    const actions = builder.querySelector(".estimate-service-actions");
    const discounts = builder.querySelector(".discount-panel");
    return Boolean(
      lineItems &&
      actions &&
      discounts &&
      (lineItems.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (actions.compareDocumentPosition(discounts) & Node.DOCUMENT_POSITION_FOLLOWING)
    );
  });
  expect(serviceActionsAreBelowRows).toBe(true);
  await expectFontSize(page.locator("#jobForm [name='customerName']"), 16);
  await expectFontSize(page.locator("#jobForm [name='leadSource']"), 16);
  await expectFontSize(page.locator("#jobCustomerSelect"), 16);
  await expectFontSize(page.locator("#jobForm [name='serviceType']"), 16);
  await expectFontSize(page.locator("#jobForm [name='notes']"), 16);
  await expectMinHeight(page.getByRole("button", { name: "Add Custom Service" }), 44);
  await expectMinHeight(page.locator("#jobForm").getByRole("button", { name: "Create Job" }), 44);
});

test("mobile send estimate action stays visible and completes", async ({ page }) => {
  await page.route("**/api/jobs/lead-mobile-job/send-square-estimate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: /Mobile Lead/ }).click();
  const sendButton = page.getByRole("button", { name: "Send Estimate" });
  await sendButton.click();

  await expect(page.locator(".workflow-action-status")).toContainText("Sending update");
  await expect(page.getByRole("button", { name: "Sending..." })).toBeDisabled();
  await expect(page.locator("#jobDetail")).toContainText("Estimate Sent");
  await expect(page.locator("#jobDialog")).toBeHidden();
});

test("mobile job draft survives refresh before estimate is saved", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#jobDialog")).toBeVisible();
  await page.locator("#jobForm [name='customerName']").fill("Refresh Draft Customer");
  await page.locator("#jobForm [name='email']").fill("draft.mobile@example.com");
  await page.locator("#jobForm [name='phone']").fill("(555) 888-0000");
  await page.locator("#jobForm [name='streetAddress']").fill("101 Draft Recovery Way");
  await page.locator("#jobForm [name='city']").fill("Riverside");
  await page.locator("#jobForm [name='state']").fill("CA");
  await page.locator("#jobForm [name='zip']").fill("92501");
  await page.locator("#lineItems .line-quantity").first().fill("2");
  await page.locator("#lineItems .line-rate").first().fill("175");
  await expect(page.locator("#estimateTotal")).toHaveText("$350.00");

  await page.reload();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Mobile Exterior Cleaning");
  await page.getByRole("button", { name: "New Job" }).click();

  await expect(page.locator("#jobForm [name='customerName']")).toHaveValue("Refresh Draft Customer");
  await expect(page.locator("#lineItems .line-quantity").first()).toHaveValue("2");
  await expect(page.locator("#lineItems .line-rate").first()).toHaveValue("175");
  await expect(page.locator("#estimateTotal")).toHaveText("$350.00");
});

test("settings and workflow modals fit a 375px mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await login(page);

  await expect(page.locator("#notificationToggle .notification-toggle__label")).toHaveText("Activity");
  await expectNoViewportOverflow(page, "dashboard chrome at 375px");

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#settingsDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#settingsDialog");
  await expect(page.getByRole("button", { name: "Close Settings" })).toBeInViewport();
  await expectFontSize(page.locator("#settingsForm [name='businessName']"), 16);
  await expectMinHeight(page.locator(".settings-jump-list a").first(), 44);
  await expectNoViewportOverflow(page, "settings modal at 375px");
  await page.getByRole("button", { name: "Close Settings" }).click();

  await page.getByRole("button", { name: "Customers" }).click();
  await page.getByRole("button", { name: "New Customer" }).click();
  await expect(page.locator("#customerDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#customerDialog");
  await expectFontSize(page.locator("#customerForm [name='customerName']"), 16);
  await expectMinHeight(page.locator("#customerForm").getByRole("button", { name: "Save Customer" }), 44);
  await expectNoViewportOverflow(page, "new customer modal at 375px");
  await page.getByRole("button", { name: "Close Customer" }).click();

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#jobDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#jobDialog");
  await expect(page.getByRole("button", { name: "Close New Job" })).toBeInViewport();
  await expect(page.locator("#jobForm [name='customerName']")).toBeEditable();
  await expectNoViewportOverflow(page, "new job modal at 375px");
  await page.getByRole("button", { name: "Close New Job" }).click();

  await page.getByRole("button", { name: /Deposit Ready Mobile/ }).click();
  await page.getByRole("button", { name: "Schedule Job" }).click();
  await expect(page.locator("#scheduleDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#scheduleDialog");
  await expectFontSize(page.locator("#scheduleForm [name='scheduleDate']"), 16);
  await expectMinHeight(page.locator("#scheduleForm").getByRole("button", { name: "Schedule Job", exact: true }), 44);
  await expectNoViewportOverflow(page, "schedule job modal at 375px");
  await page.getByRole("button", { name: "Close Schedule Job" }).click();

  await page.getByRole("button", { name: /Scheduled Mobile/ }).click();
  await page.getByRole("button", { name: "Complete Job + Send Final Invoice" }).click();
  await expect(page.locator("#completionDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#completionDialog");
  await expectMinHeight(page.locator("#completionForm .photo-action-button").first(), 44);
  await expectMinHeight(page.locator("#completionForm").getByRole("button", { name: "Send Final Invoice" }), 44);
  await expectNoViewportOverflow(page, "complete job modal at 375px");
  await page.getByRole("button", { name: "Close Complete Job" }).click();

  await page.getByRole("button", { name: /Final Mobile/ }).click();
  await page.getByRole("button", { name: "Mark Paid" }).click();
  await expect(page.locator("#paymentDialog")).toBeVisible();
  await expectDialogFitsViewport(page, "#paymentDialog");
  await expectFontSize(page.locator("#paymentForm [name='paymentMethod']"), 16);
  await expectMinHeight(page.locator("#paymentForm").getByRole("button", { name: "Confirm Payment" }), 44);
  await expectNoViewportOverflow(page, "record payment modal at 375px");
});

test("measure from map controls meet mobile touch target requirements", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#jobDialog")).toBeVisible();

  const lineItem = page.locator("#lineItems .line-item-row").first();
  await lineItem.locator(".line-service").selectOption("Pressure Washing");
  await lineItem.locator(".line-measure").click();
  await expect(page.locator("#measurementDialog")).toBeVisible();

  await page.locator("#measurementMap").evaluate((element) => {
    const group = document.createElement("div");
    group.className = "mapboxgl-ctrl-group";
    const polygon = document.createElement("button");
    polygon.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_polygon";
    polygon.type = "button";
    polygon.textContent = "P";
    const trash = document.createElement("button");
    trash.className = "mapbox-gl-draw_ctrl-draw-btn mapbox-gl-draw_trash";
    trash.type = "button";
    trash.textContent = "D";
    group.append(polygon, trash);
    element.append(group);
  });

  await expectMinSize(page.locator(".mapbox-gl-draw_polygon"), 44, 44);
  await expectMinSize(page.locator(".mapbox-gl-draw_trash"), 44, 44);
  await expectMinSize(page.locator(".mapbox-gl-draw_polygon"), 48, 48);
  await expectMinHeight(page.locator("#measurementAddress"), 44);
  await expectFontSize(page.locator("#measurementAddress"), 16);
  await expectMinHeight(page.locator("#saveMeasurementAreaButton"), 44);
  await expectMinHeight(page.locator("#useMeasurementButton"), 44);
});

test("public documents remain within the mobile viewport and proof links are tappable", async ({ page }) => {
  const publicPaths = [
    "/estimate/estimate-mobile-job?token=estimate-mobile",
    "/invoice/final-mobile-job?type=final&token=pf-final-mobile",
    "/proof/final-mobile-job?token=proof-mobile",
    "/contract/contract-mobile-job?token=contract-mobile"
  ];

  for (const publicPath of publicPaths) {
    await page.goto(publicPath);
    await expect(page.locator(".doc")).toBeVisible();
    await expect(page.locator(".doc__logo")).toBeVisible();
    await expect(page.locator("body")).toContainText("Mobile Exterior Cleaning");
    await expect(page.locator("body")).toContainText("This secure customer page is generated by PressureFlow for Mobile Exterior Cleaning.");
    await expectNoViewportOverflow(page, publicPath);
  }

  await page.goto("/invoice/final-mobile-job?type=final&token=pf-final-mobile");
  await expect(page.locator("body")).not.toContainText("Payment options available");
  await expectMinHeight(page.locator(".proof-link a"), 44);
  await expectMinHeight(page.getByRole("button", { name: "Pay by Credit Card" }), 44);

  await page.goto("/estimate/estimate-mobile-job?token=estimate-mobile");
  await expect(page.locator("body")).toContainText("No payment collected on this page");
  await expectFontSize(page.locator("#estimateRejectReason"), 16);
  await expectMinHeight(page.getByRole("button", { name: "Approve Estimate" }), 44);

  await page.goto("/proof/final-mobile-job?token=proof-mobile");
  await expect(page.locator("body")).toContainText("Photos included");
  await expect(page.locator("body")).toContainText("Customer copy");

  await page.goto("/proof/no-photo-mobile-job?token=proof-no-photo-mobile");
  await expect(page.locator("body")).toContainText("No photos included");
  await expect(page.locator("body")).toContainText("No photos were included with this service.");
  await expect(page.locator("body")).not.toContainText("Photos available");

  await page.goto("/contract/contract-mobile-job?token=contract-mobile");
  await expect(page.locator("body")).toContainText("Ready for signature");
  await expectMinHeight(page.getByRole("button", { name: "Sign Agreement" }), 44);
});

async function expectFontSize(locator, minimum) {
  const fontSize = await locator.evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(minimum);
}

async function expectMinHeight(locator, minimum) {
  const box = await locator.boundingBox();
  expect(box?.height || 0).toBeGreaterThanOrEqual(minimum);
}

async function expectMinSize(locator, minimumWidth, minimumHeight) {
  const box = await locator.boundingBox();
  expect(box?.width || 0).toBeGreaterThanOrEqual(minimumWidth);
  expect(box?.height || 0).toBeGreaterThanOrEqual(minimumHeight);
}

async function expectDialogFitsViewport(page, selector) {
  const result = await page.locator(selector).evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    };
  });

  expect(result.left).toBeGreaterThanOrEqual(0);
  expect(result.right).toBeLessThanOrEqual(result.viewportWidth);
  expect(result.top).toBeGreaterThanOrEqual(0);
  expect(result.bottom).toBeLessThanOrEqual(result.viewportHeight);
}

async function expectNoViewportOverflow(page, label) {
  const result = await page.evaluate(() => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll("body, body *")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter((item) => item.right > viewport + 1 || item.left < -1)
      .slice(0, 8);
    return {
      fits: document.documentElement.scrollWidth <= viewport + 1,
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      offenders
    };
  });
  expect(result, `${label} overflow: ${JSON.stringify(result, null, 2)}`).toMatchObject({ fits: true });
}

async function installMapboxMocks(page) {
  await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.addInitScript(() => {
    class MockMap {
      addControl() {}
      on() {}
      once(_name, handler) {
        handler();
      }
      resize() {}
      loaded() {
        return true;
      }
      getCenter() {
        return { lng: -117.3755, lat: 33.9806 };
      }
      getZoom() {
        return 19;
      }
      flyTo() {}
      getSource() {
        return null;
      }
      addSource() {}
      getLayer() {
        return null;
      }
      addLayer() {}
    }
    class MockNavigationControl {}
    class MockDraw {
      constructor(options = {}) {
        this.options = options;
        this.features = [];
      }
      getAll() {
        return { type: "FeatureCollection", features: this.features };
      }
      deleteAll() {
        this.features = [];
      }
      changeMode() {}
    }
    MockDraw.modes = { draw_polygon: {}, simple_select: {} };
    window.mapboxgl = { Map: MockMap, NavigationControl: MockNavigationControl };
    window.MapboxDraw = MockDraw;
    window.turf = {
      area() {
        return 0;
      },
      lineString(coordinates) {
        return { coordinates };
      },
      length() {
        return 0;
      }
    };
  });
}

async function login(page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Password").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Mobile Exterior Cleaning");
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "expenses.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), JSON.stringify([{
    id: "mobile-existing-customer",
    accountId: TEST_USER.accountId,
    customerName: "Mobile Existing Customer",
    email: "existing.mobile@example.com",
    phone: "(555) 888-7777",
    streetAddress: "700 Saved Customer Lane",
    addressUnit: "",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "700 Saved Customer Lane, Riverside, CA 92501",
    leadSource: "referral",
    notes: "",
    serviceAreaPhotos: [],
    propertyMeasurements: [],
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z"
  }], null, 2));
  await fs.writeFile(path.join(DATA_DIR, "follow-up-tasks.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "webhook-events.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Mobile Test Account",
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
      businessName: "Mobile Exterior Cleaning",
      businessEmail: "owner@mobile.test",
      businessPhone: "(555) 888-1212",
      businessLogoDataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      serviceIndustry: "Pressure Washing",
      onboardingCompleted: true,
      mapboxPublicToken: "pk.playwright-mapbox",
      stripeSecretKey: "sk_test_mobile_display_only"
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
    baseJob({
      id: "lead-mobile-job",
      customerName: "Mobile Lead",
      email: "lead.mobile@example.com",
      status: "Lead"
    }),
    baseJob({
      id: "estimate-mobile-job",
      customerName: "Estimate Mobile",
      email: "estimate.mobile@example.com",
      status: "Estimate Sent",
      estimateApprovalToken: "estimate-mobile",
      estimateApprovalUrl: "http://127.0.0.1:3173/estimate/estimate-mobile-job?token=estimate-mobile"
    }),
    baseJob({
      id: "deposit-ready-mobile-job",
      customerName: "Deposit Ready Mobile",
      email: "deposit.ready.mobile@example.com",
      status: "Deposit Paid"
    }),
    baseJob({
      id: "scheduled-mobile-job",
      customerName: "Scheduled Mobile",
      email: "scheduled.mobile@example.com",
      status: "Scheduled",
      scheduledAt: "2026-06-20T09:00"
    }),
    baseJob({
      id: "final-mobile-job",
      customerName: "Final Mobile",
      email: "final.mobile@example.com",
      status: "Final Invoice Sent",
      squareFinalInvoiceId: "pf-final-mobile",
      squareFinalInvoiceUrl: "http://127.0.0.1:3173/invoice/final-mobile-job?type=final&token=pf-final-mobile",
      completionProofToken: "proof-mobile",
      completionProofUrl: "http://127.0.0.1:3173/proof/final-mobile-job?token=proof-mobile",
      completionNoticeSentAt: "2026-06-15T16:00:00.000Z",
      jobPhotos: {
        before: [{ name: "before.jpg", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }],
        after: [{ name: "after.jpg", dataUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }]
      },
      measurement: {
        squareFeet: 1250,
        areas: [{ name: "Front driveway edge and long side path", squareFeet: 1250 }]
      }
    }),
    baseJob({
      id: "contract-mobile-job",
      customerName: "Contract Mobile",
      email: "contract.mobile@example.com",
      status: "Contract Sent",
      contractApprovalToken: "contract-mobile",
      contractApprovalUrl: "http://127.0.0.1:3173/contract/contract-mobile-job?token=contract-mobile"
    }),
    baseJob({
      id: "no-photo-mobile-job",
      customerName: "No Photo Mobile",
      email: "no.photo.mobile@example.com",
      status: "Completed",
      completionProofToken: "proof-no-photo-mobile",
      completionProofUrl: "http://127.0.0.1:3173/proof/no-photo-mobile-job?token=proof-no-photo-mobile",
      completionNoticeSentAt: "2026-06-15T17:00:00.000Z"
    })
  ], null, 2));
}

function baseJob(overrides = {}) {
  return {
    id: "mobile-job",
    accountId: TEST_USER.accountId,
    customerName: "Mobile Customer",
    email: "mobile.customer@example.com",
    phone: "(555) 888-3434",
    streetAddress: "100 Long Mobile Testing Boulevard",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "100 Long Mobile Testing Boulevard, Riverside, CA 92501",
    serviceType: "Exterior cleaning and pressure washing",
    estimate: 420,
    depositPercent: 25,
    lineItems: [{
      name: "Very long driveway, walkway, and exterior surface cleaning line item for mobile overflow testing",
      quantity: 1,
      unit: "QTY",
      price: 420,
      total: 420
    }],
    paymentRecords: [],
    createdAt: "2026-06-01T12:00:00.000Z",
    updatedAt: "2026-06-01T12:00:00.000Z",
    ...overrides
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
