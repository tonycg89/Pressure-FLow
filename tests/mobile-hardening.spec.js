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
  await expectFontSize(page.locator("#jobForm [name='customerName']"), 16);
  await expectFontSize(page.locator("#jobForm [name='leadSource']"), 16);
  await expectFontSize(page.locator("#jobForm [name='notes']"), 16);
  await expectMinHeight(page.locator("#jobForm").getByRole("button", { name: "Create Job" }), 44);
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
  await expectMinHeight(page.locator("#measurementAddress"), 44);
  await expectMinHeight(page.locator("#saveMeasurementAreaButton"), 44);
  await expectMinHeight(page.locator("#useMeasurementButton"), 44);
});

test("public documents remain within the mobile viewport and proof links are tappable", async ({ page }) => {
  const publicPaths = [
    "/invoice/final-mobile-job?type=final&token=pf-final-mobile",
    "/proof/final-mobile-job?token=proof-mobile",
    "/contract/contract-mobile-job?token=contract-mobile"
  ];

  for (const publicPath of publicPaths) {
    await page.goto(publicPath);
    await expect(page.locator(".doc")).toBeVisible();
    await expectNoViewportOverflow(page, publicPath);
  }

  await page.goto("/invoice/final-mobile-job?type=final&token=pf-final-mobile");
  await expectMinHeight(page.locator(".proof-link a"), 44);
  await expectMinHeight(page.getByRole("button", { name: "Pay by Credit Card" }), 44);

  await page.goto("/contract/contract-mobile-job?token=contract-mobile");
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
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), "[]");
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
