// Package 006: Stripe Connect onboarding, connected-account checkout, and the
// platform Connect webhook. A local mock stands in for api.stripe.com via
// PRESSUREFLOW_STRIPE_API_BASE (set in playwright.config.js; ignored in production).
const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const NOW = "2026-06-17T12:00:00.000Z";
const MOCK_PORT = 3175;
const CONNECT_SECRET = "whsec_connect_playwright";

const TENANT_A = {
  id: "aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa",
  accountId: "acct-connect-a",
  name: "Connect A",
  email: "connect.a@example.com",
  password: "temporary-password",
  businessName: "Connect A Washing"
};

const TENANT_B = {
  id: "bbbbbbbb-6666-4bbb-8bbb-bbbbbbbbbbbb",
  accountId: "acct-connect-b",
  name: "Connect B",
  email: "connect.b@example.com",
  password: "temporary-password",
  businessName: "Connect B Washing"
};

const mock = {
  server: null,
  requests: [],
  chargesEnabled: false,
  accountCounter: 0
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  mock.server = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const params = Object.fromEntries(new URLSearchParams(body));
      mock.requests.push({
        method: request.method,
        path: request.url,
        params,
        stripeAccount: request.headers["stripe-account"] || "",
        authorization: request.headers.authorization || ""
      });
      const send = (status, data) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify(data));
      };
      if (request.method === "POST" && request.url === "/v1/accounts") {
        mock.accountCounter += 1;
        return send(200, { id: `acct_mock_${mock.accountCounter}`, charges_enabled: false, payouts_enabled: false, details_submitted: false });
      }
      if (request.method === "POST" && request.url === "/v1/account_links") {
        return send(200, { url: `https://connect.stripe.test/setup/${params.account}` });
      }
      if (request.method === "GET" && request.url.startsWith("/v1/accounts/")) {
        return send(200, {
          id: decodeURIComponent(request.url.split("/").pop()),
          charges_enabled: mock.chargesEnabled,
          payouts_enabled: mock.chargesEnabled,
          details_submitted: mock.chargesEnabled
        });
      }
      if (request.method === "POST" && request.url === "/v1/checkout/sessions") {
        return send(200, { id: "cs_mock_1", url: "https://checkout.stripe.test/pay/cs_mock_1" });
      }
      return send(404, { error: { message: "mock route not found" } });
    });
  });
  await new Promise((resolve) => mock.server.listen(MOCK_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise((resolve) => mock.server.close(resolve));
});

test.beforeEach(async () => {
  mock.requests = [];
  mock.chargesEnabled = false;
  mock.accountCounter = 0;
  await resetTestData();
});

test("Connect onboarding creates one account, trusts Stripe for status, and turns on card checkout", async ({ page }) => {
  await login(page, TENANT_A);
  const csrfToken = (await apiJson(page, "/api/session")).csrfToken;

  const noCsrf = await page.request.post("/api/stripe/connect/start", { data: {} });
  expect(noCsrf.status()).toBe(403);
  expect(mock.requests.filter((item) => item.path === "/v1/accounts")).toHaveLength(0);

  const first = await postJson(page, "/api/stripe/connect/start", csrfToken, {});
  expect(first.ok()).toBeTruthy();
  expect((await first.json()).url).toBe("https://connect.stripe.test/setup/acct_mock_1");
  const second = await postJson(page, "/api/stripe/connect/start", csrfToken, {});
  expect((await second.json()).url).toBe("https://connect.stripe.test/setup/acct_mock_1");

  const created = mock.requests.filter((item) => item.method === "POST" && item.path === "/v1/accounts");
  expect(created).toHaveLength(1);
  expect(created[0].params["controller[stripe_dashboard][type]"]).toBe("full");
  expect(created[0].params["controller[fees][payer]"]).toBe("account");
  expect(created[0].params["controller[losses][payments]"]).toBe("stripe");
  expect(created[0].params["metadata[pressureflowAccountId]"]).toBe(TENANT_A.accountId);
  expect(created[0].authorization).toBe("Bearer sk_test_playwright_platform");
  const link = mock.requests.find((item) => item.path === "/v1/account_links");
  expect(link.params.type).toBe("account_onboarding");
  expect(link.params.return_url).toMatch(/\/auth\/stripe\/connect\/return$/);
  expect(link.params.refresh_url).toMatch(/\/auth\/stripe\/connect\/refresh$/);

  let settingsPayload = await apiJson(page, "/api/settings");
  expect(settingsPayload.settings.stripeConnect).toMatchObject({ available: true, connected: true, chargesEnabled: false });
  expect(JSON.stringify(settingsPayload)).not.toContain("acct_mock_1");

  // Not ready yet: invoice must not offer card payment (tenant has no legacy key).
  let invoicePage = await page.request.get(`/invoice/a-deposit-job?type=deposit&token=connect-a-deposit`);
  expect(await invoicePage.text()).not.toContain("Pay by Credit Card");

  mock.chargesEnabled = true;
  const returned = await page.request.get("/auth/stripe/connect/return", { maxRedirects: 0 });
  expect(returned.status()).toBe(302);
  expect(returned.headers().location).toBe("/?stripeConnect=return");
  settingsPayload = await apiJson(page, "/api/settings");
  expect(settingsPayload.settings.stripeConnect.chargesEnabled).toBe(true);
  expect(settingsPayload.settings.hasConfiguredInvoicePaymentMethod).toBe(true);

  const refreshed = await page.request.get("/auth/stripe/connect/refresh", { maxRedirects: 0 });
  expect(refreshed.status()).toBe(302);
  expect(refreshed.headers().location).toBe("https://connect.stripe.test/setup/acct_mock_1");

  invoicePage = await page.request.get(`/invoice/a-deposit-job?type=deposit&token=connect-a-deposit`);
  expect(await invoicePage.text()).toContain("Pay by Credit Card");

  const pay = await page.request.post("/api/public/invoices/a-deposit-job/pay-card", {
    form: { type: "deposit", token: "connect-a-deposit" },
    maxRedirects: 0
  });
  expect(pay.status()).toBe(303);
  expect(pay.headers().location).toBe("https://checkout.stripe.test/pay/cs_mock_1");
  const checkout = mock.requests.find((item) => item.path === "/v1/checkout/sessions");
  expect(checkout.stripeAccount).toBe("acct_mock_1");
  expect(checkout.params["line_items[0][price_data][unit_amount]"]).toBe("5000");
  expect(checkout.params["metadata[accountId]"]).toBe(TENANT_A.accountId);
  expect(checkout.params["metadata[invoiceId]"]).toBe("connect-a-deposit");
  expect(checkout.params["payment_intent_data[application_fee_amount]"]).toBeUndefined();
});

test("Settings shows the Connect button and it starts onboarding", async ({ page }) => {
  await login(page, TENANT_A);
  await page.evaluate(() => document.querySelector("#settingsButton")?.click());
  const button = page.locator("#stripeConnectButton");
  await expect(button).toHaveText("Connect with Stripe");
  await expect(page.locator("#stripeConnectStatus")).toContainText("Not connected");
  await page.route("https://connect.stripe.test/**", (route) => route.fulfill({ status: 200, body: "<h1>Stripe onboarding mock</h1>", contentType: "text/html" }));
  await button.click();
  await expect(page).toHaveURL("https://connect.stripe.test/setup/acct_mock_1");
});

test("Connect onboarding routes require a session", async ({ request }) => {
  const start = await request.post("/api/stripe/connect/start", { data: {} });
  expect([401, 403]).toContain(start.status());
  const returned = await request.get("/auth/stripe/connect/return", { maxRedirects: 0 });
  expect(returned.status()).toBe(302);
  expect(returned.headers().location).toBe("/login");
  expect(mock.requests).toHaveLength(0);
});

test("Connect webhook pays once, enforces tenant account match, and rejects bad or stale signatures", async ({ request }) => {
  await resetTestData({ connected: true });
  const deposit = connectCheckoutEvent({
    eventId: "evt_connect_a_deposit",
    account: "acct_saved_a",
    jobId: "a-deposit-job",
    accountId: TENANT_A.accountId,
    invoiceId: "connect-a-deposit",
    amountTotal: 5000,
    type: "checkout.session.async_payment_succeeded"
  });

  // Signed by the platform secret, but the connected account belongs to tenant B.
  const crossTenant = JSON.stringify({ ...deposit, account: "acct_saved_b" });
  expect((await postSigned(request, crossTenant)).ok()).toBeTruthy();
  let jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-deposit-job").status).toBe("Deposit Sent");

  // Fail closed when currency is missing.
  const noCurrency = JSON.parse(JSON.stringify(deposit));
  delete noCurrency.data.object.currency;
  expect((await postSigned(request, JSON.stringify(noCurrency))).ok()).toBeTruthy();
  jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-deposit-job").paymentRecords).toHaveLength(0);

  const raw = JSON.stringify(deposit);
  expect((await request.post("/webhooks/stripe-connect", { data: raw, headers: { "content-type": "application/json" } })).status()).toBe(401);
  expect((await postSigned(request, raw, { secret: "whsec_wrong" })).status()).toBe(401);
  expect((await postSigned(request, raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status()).toBe(401);
  jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "a-deposit-job").paymentRecords).toHaveLength(0);

  expect((await postSigned(request, raw)).ok()).toBeTruthy();
  expect((await postSigned(request, raw)).ok()).toBeTruthy();
  jobs = await readJson("jobs.json");
  const paid = jobs.find((job) => job.id === "a-deposit-job");
  expect(paid.status).toBe("Deposit Paid");
  expect(paid.paymentRecords).toHaveLength(1);
  expect(paid.paymentRecords[0].method).toBe("Stripe");

  const followUps = await readJson("follow-up-tasks.json");
  expect(followUps.find((task) => task.id === "a-deposit-follow-up").status).toBe("cancelled");

  // Paid invoice: no second card checkout can be started.
  const payAgain = await request.post("/api/public/invoices/a-deposit-job/pay-card", {
    form: { type: "deposit", token: "connect-a-deposit" },
    maxRedirects: 0
  });
  expect(payAgain.status()).toBe(409);
  expect(mock.requests.filter((item) => item.path === "/v1/checkout/sessions")).toHaveLength(0);
});

test("Legacy Stripe endpoint ignores connected-account events", async ({ request }) => {
  await resetTestData({ connected: true, legacySecret: "whsec_legacy_b" });
  const raw = JSON.stringify(connectCheckoutEvent({
    eventId: "evt_legacy_connected",
    account: "acct_saved_b",
    jobId: "b-deposit-job",
    accountId: TENANT_B.accountId,
    invoiceId: "connect-b-deposit",
    amountTotal: 5000
  }));
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac("sha256", "whsec_legacy_b").update(`${timestamp}.${raw}`).digest("hex");
  const response = await request.post("/webhooks/stripe", {
    data: raw,
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${digest}` }
  });
  expect(response.ok()).toBeTruthy();
  expect((await response.json()).result.reason).toBe("connected account event on legacy endpoint");
  const jobs = await readJson("jobs.json");
  expect(jobs.find((job) => job.id === "b-deposit-job").status).toBe("Deposit Sent");
});

test("Connect account.updated events only change the matching tenant", async ({ request }) => {
  await resetTestData({ connected: true });
  // Unknown connected account (metadata names tenant A): ignored, nothing changes.
  const unknown = JSON.stringify(accountUpdatedEvent({ account: "acct_unknown", pressureflowAccountId: TENANT_A.accountId, chargesEnabled: false }));
  expect((await postSigned(request, unknown)).ok()).toBeTruthy();
  let users = await readJson("users.json");
  expect(users.find((user) => user.id === TENANT_A.id).settings.stripeConnectStatus.chargesEnabled).toBe(true);

  const disabled = JSON.stringify(accountUpdatedEvent({ account: "acct_saved_a", pressureflowAccountId: TENANT_A.accountId, chargesEnabled: false }));
  expect((await postSigned(request, disabled)).ok()).toBeTruthy();
  users = await readJson("users.json");
  expect(users.find((user) => user.id === TENANT_A.id).settings.stripeConnectStatus.chargesEnabled).toBe(false);
  expect(users.find((user) => user.id === TENANT_B.id).settings.stripeConnectStatus.chargesEnabled).toBe(true);

  const deauthorized = JSON.stringify({
    id: "evt_deauth_b",
    type: "account.application.deauthorized",
    account: "acct_saved_b",
    // Real payload is an Application object: no PressureFlow metadata on it.
    data: { object: { id: "ca_platform", object: "application", name: "PressureFlow" } }
  });
  expect((await postSigned(request, deauthorized)).ok()).toBeTruthy();
  users = await readJson("users.json");
  expect(users.find((user) => user.id === TENANT_B.id).settings.stripeConnectStatus).toMatchObject({ chargesEnabled: false, deauthorized: true });
});

function connectCheckoutEvent({ eventId, account, jobId, accountId, invoiceId, amountTotal, type = "checkout.session.completed" }) {
  return {
    id: eventId,
    type,
    account,
    data: {
      object: {
        id: `cs_${jobId}`,
        payment_status: "paid",
        amount_total: amountTotal,
        currency: "usd",
        metadata: { jobId, accountId, invoiceType: "deposit", invoiceId }
      }
    }
  };
}

function accountUpdatedEvent({ account, pressureflowAccountId, chargesEnabled }) {
  return {
    id: `evt_account_${account}_${chargesEnabled}`,
    type: "account.updated",
    account,
    data: {
      object: {
        id: account,
        charges_enabled: chargesEnabled,
        payouts_enabled: chargesEnabled,
        details_submitted: true,
        metadata: { pressureflowAccountId }
      }
    }
  };
}

function postSigned(request, raw, { secret = CONNECT_SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return request.post("/webhooks/stripe-connect", {
    data: raw,
    headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${digest}` }
  });
}

async function login(page, user) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.locator("#sidebarBusinessName")).toHaveText(user.businessName);
}

async function apiJson(page, url) {
  const response = await page.request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

function postJson(page, url, csrfToken, data) {
  return page.request.post(url, { headers: { "x-csrf-token": csrfToken }, data });
}

async function resetTestData({ connected = false, legacySecret = "" } = {}) {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJson("accounts.json", [account(TENANT_A), account(TENANT_B)]);
  await writeJson("users.json", [
    user(TENANT_A, connected ? "acct_saved_a" : ""),
    user(TENANT_B, connected ? "acct_saved_b" : "", legacySecret)
  ]);
  await writeJson("settings.local.json", {
    businessName: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  });
  await writeJson("customers.json", []);
  await writeJson("expenses.json", []);
  await writeJson("webhook-events.json", []);
  await writeJson("follow-up-tasks.json", [{
    id: "a-deposit-follow-up",
    accountId: TENANT_A.accountId,
    jobId: "a-deposit-job",
    type: "deposit_followup",
    status: "pending",
    dueAt: "2026-06-18T12:00:00.000Z",
    createdAt: NOW,
    updatedAt: NOW
  }]);
  await writeJson("jobs.json", [
    job("a-deposit-job", TENANT_A.accountId, "Connect A Deposit", "Deposit Sent", {
      squareDepositInvoiceId: "connect-a-deposit",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/a-deposit-job?type=deposit&token=connect-a-deposit"
    }),
    job("b-deposit-job", TENANT_B.accountId, "Connect B Deposit", "Deposit Sent", {
      squareDepositInvoiceId: "connect-b-deposit",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/b-deposit-job?type=deposit&token=connect-b-deposit"
    })
  ]);
}

function account(tenant) {
  return { id: tenant.accountId, name: tenant.businessName, plan: "tester", status: "active", createdAt: NOW, updatedAt: NOW };
}

function user(tenant, stripeAccountId, stripeWebhookSecret = "") {
  return {
    id: tenant.id,
    accountId: tenant.accountId,
    name: tenant.name,
    email: tenant.email,
    passwordHash: hashPassword(tenant.password),
    role: "tester",
    disabled: false,
    settings: {
      businessName: tenant.businessName,
      businessEmail: tenant.email,
      businessPhone: "(555) 600-7000",
      paymentInstructions: "",
      ...(stripeWebhookSecret ? { stripeWebhookSecret } : {}),
      onboardingCompleted: true,
      ...(stripeAccountId ? {
        stripeAccountId,
        stripeConnectStatus: { chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: "", updatedAt: NOW }
      } : {}),
      customServices: [],
      customServiceTypes: [],
      customPhotoSections: [],
      customTemplates: []
    },
    lastLoginAt: "",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function job(id, accountId, customerName, status, overrides = {}) {
  return {
    id,
    accountId,
    customerName,
    email: `${id}@example.com`,
    phone: "(555) 333-4444",
    address: "100 Connect Road, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "Qty", price: 200, total: 200 }],
    status,
    paymentRecords: [],
    squareDepositInvoiceStatus: "",
    squareDepositPaidAt: "",
    squareFinalInvoiceStatus: "",
    squareFinalPaidAt: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, fileName), "utf8"));
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(DATA_DIR, fileName), `${JSON.stringify(value, null, 2)}\n`);
}
