const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const TEST_USER = {
  id: "77777777-7777-4777-8777-777777777777",
  accountId: "acct-measurement-map",
  name: "Measurement Tester",
  email: "measurement.tester@example.com",
  password: "temporary-password"
};

test.beforeEach(async ({ page }) => {
  await resetTestData();
  await installMapboxMocks(page);
});

test("measure from map re-arms polygon drawing after adding and updating areas", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: "Pipeline" }).click();
  await page.getByRole("button", { name: "New Job" }).click();
  await expect(page.locator("#jobDialog")).toBeVisible();
  await page.locator("#jobForm [name='customerName']").fill("Map Tester");
  await page.locator("#jobForm [name='email']").fill("map.tester@example.com");
  await page.locator("#jobForm [name='phone']").fill("(555) 777-1212");
  await page.locator("#jobForm [name='streetAddress']").fill("100 Main Street");
  await page.locator("#jobForm [name='city']").fill("Riverside");
  await page.locator("#jobForm [name='state']").fill("CA");
  await page.locator("#jobForm [name='zip']").fill("92501");
  await page.locator("#jobForm [name='serviceType']").fill("Pressure washing");

  const lineItem = page.locator("#lineItems .line-item-row").first();
  await lineItem.locator(".line-service").selectOption("Pressure Washing");
  await lineItem.locator(".line-measure").click();
  await expect(page.locator("#measurementDialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.__pressureFlowDraw))).toBe(true);
  expect(await getMockCloseBehavior(page)).toEqual({
    farClickAddedVertex: true,
    farClickClosed: false,
    nearClickAddedVertex: false,
    nearClickClosed: true
  });

  await drawMockPolygon(page, "first-area", 100);
  await expect(page.locator("#measurementStatus")).toContainText("1,076 SqFt drawn");
  await page.locator("#saveMeasurementAreaButton").click();
  await expect(page.locator("#measurementAreaList .measurement-area-card")).toHaveCount(1);
  await expect(page.locator("#measurementStatus")).toContainText("Service area 1 saved. Draw another area if needed.");
  await expectDrawMode(page, "draw_polygon");

  await drawMockPolygon(page, "second-area", 50);
  await page.locator("#saveMeasurementAreaButton").click();
  await expect(page.locator("#measurementAreaList .measurement-area-card")).toHaveCount(2);
  await expect(page.locator("#measuredArea")).toHaveText("1,614 SqFt");
  await expectDrawMode(page, "draw_polygon");

  const firstAreaId = await page.locator("[data-edit-area]").first().getAttribute("data-edit-area");
  await page.locator("[data-edit-area]").first().click();
  await drawMockPolygon(page, firstAreaId, 120);
  await page.locator("#saveMeasurementAreaButton").click();
  await expect(page.locator("#measurementAreaList .measurement-area-card")).toHaveCount(2);
  await expect(page.locator("#measurementStatus")).toContainText("Service area 1 updated. Draw another area if needed.");
  await expectDrawMode(page, "draw_polygon");

  await page.locator("#useMeasurementButton").click();
  await expect(page.locator("#measurementDialog")).toBeHidden();
  await expect(lineItem.locator(".line-quantity")).toHaveValue("1830");
  await page.locator("#jobForm").getByRole("button", { name: "Create Job" }).click();
  await expect(page.locator("#jobDialog")).toBeHidden();

  await page.getByRole("button", { name: /Map Tester/ }).click();
  await page.locator("#editJobButton").click();
  await expect(page.locator("#jobDialog")).toBeVisible();
  await page.locator("#lineItems .line-item-row").first().locator(".line-measure").click();
  await expect(page.locator("#measurementAreaList .measurement-area-card")).toHaveCount(2);
  await expect(page.locator("#measuredArea")).toHaveText("1,830 SqFt");
});

async function drawMockPolygon(page, id, areaMeters) {
  await page.evaluate(({ id, areaMeters }) => {
    window.__pressureFlowDraw.features = [{
      id,
      type: "Feature",
      properties: { areaMeters },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [-117.3755, 33.9806],
          [-117.3754, 33.9806],
          [-117.3754, 33.9807],
          [-117.3755, 33.9807],
          [-117.3755, 33.9806]
        ]]
      }
    }];
    window.__pressureFlowMapHandlers["draw.create"]();
  }, { id, areaMeters });
}

async function expectDrawMode(page, mode) {
  await expect.poll(() => page.evaluate(() => window.__pressureFlowDraw.mode)).toBe(mode);
}

async function getMockCloseBehavior(page) {
  return page.evaluate(() => {
    const drawMode = window.__pressureFlowDraw.options.modes.draw_polygon;
    const state = {
      polygon: {
        getCoordinates: () => [[[-117.3755, 33.9806], [-117.3754, 33.9806], [-117.3754, 33.9807], [-117.3755, 33.9806]]]
      }
    };
    const context = {
      map: {
        project: () => ({ x: 100, y: 100 })
      }
    };

    window.__drawClickAnywhere = false;
    window.__drawClosed = false;
    drawMode.clickOnVertex.call(context, state, {
      point: { x: 112, y: 100 },
      featureTarget: { properties: { coord_path: "0.0" } }
    });
    const farClickAddedVertex = window.__drawClickAnywhere;
    const farClickClosed = window.__drawClosed;

    window.__drawClickAnywhere = false;
    window.__drawClosed = false;
    drawMode.clickOnVertex.call(context, state, {
      point: { x: 104, y: 100 },
      featureTarget: { properties: { coord_path: "0.0" } }
    });
    const nearClickAddedVertex = window.__drawClickAnywhere;
    const nearClickClosed = window.__drawClosed;

    return { farClickAddedVertex, farClickClosed, nearClickAddedVertex, nearClickClosed };
  });
}

async function installMapboxMocks(page) {
  await page.route("https://api.mapbox.com/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({ status: 204, body: "" }));
  await page.addInitScript(() => {
    window.__pressureFlowMapHandlers = {};
    class MockMap {
      constructor(options) {
        this.options = options;
      }
      addControl() {}
      on(name, handler) {
        window.__pressureFlowMapHandlers[name] = handler;
      }
      once(name, handler) {
        window.__pressureFlowMapHandlers[name] = handler;
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
      project() {
        return { x: 100, y: 100 };
      }
    }
    class MockNavigationControl {}
    class MockDraw {
      constructor(options = {}) {
        this.options = options;
        this.features = [];
        this.mode = options.defaultMode || "simple_select";
        window.__pressureFlowDraw = this;
      }
      getAll() {
        return { type: "FeatureCollection", features: this.features };
      }
      deleteAll() {
        this.features = [];
      }
      add(feature) {
        this.features.push(feature);
      }
      changeMode(mode) {
        this.mode = mode;
      }
    }
    MockDraw.modes = {
      draw_polygon: {
        clickAnywhere() {
          window.__drawClickAnywhere = true;
        },
        clickOnVertex() {
          window.__drawClosed = true;
        }
      },
      simple_select: {}
    };
    window.mapboxgl = { Map: MockMap, NavigationControl: MockNavigationControl };
    window.MapboxDraw = MockDraw;
    window.turf = {
      area(feature) {
        return Number(feature?.properties?.areaMeters || 0);
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
  await expect(page.locator("#sidebarBusinessName")).toHaveText("Johnson Exterior Cleaning");
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(path.join(DATA_DIR, "expenses.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "customers.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "jobs.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "follow-up-tasks.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "webhook-events.json"), "[]");
  await fs.writeFile(path.join(DATA_DIR, "accounts.json"), JSON.stringify([{
    id: TEST_USER.accountId,
    name: "Measurement Test Account",
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
      mapboxPublicToken: "pk.playwright-mapbox"
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
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
