const { test, expect } = require("@playwright/test");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", ".tmp", "playwright-data");
const NOW = "2026-06-17T12:00:00.000Z";
const ONE_BY_ONE_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const TENANT_A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  accountId: "acct-security-a",
  name: "Tenant A Security",
  email: "tenant.a.security@example.com",
  password: "temporary-password",
  businessName: "Tenant A Washing"
};

const TENANT_B = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  accountId: "acct-security-b",
  name: "Tenant B Security",
  email: "tenant.b.security@example.com",
  password: "temporary-password",
  businessName: "Tenant B Secret Washing"
};

test.beforeEach(async () => {
  await resetTestData();
});

test("authenticated tenant APIs list, export, settings, templates, measurements, and follow-ups are scoped", async ({ page }) => {
  await login(page, TENANT_A);

  const session = await apiJson(page, "/api/session");
  expect(session.user.accountId).toBe(TENANT_A.accountId);
  expect(session.account.id).toBe(TENANT_A.accountId);

  await expectJsonIncludesOnlyTenant(page, "/api/jobs", "jobs", "Tenant A Job", "Tenant B Job");
  await expectJsonIncludesOnlyTenant(page, "/api/customers", "customers", "Tenant A Customer", "Tenant B Customer");
  await expectJsonIncludesOnlyTenant(page, "/api/expenses", "expenses", "Tenant A Vendor", "Tenant B Vendor");
  await expectJsonIncludesOnlyTenant(page, "/api/follow-up-tasks", "tasks", "a-follow-up-task", "b-follow-up-task");

  const settings = await apiJson(page, "/api/settings");
  expect(settings.settings.businessName).toBe(TENANT_A.businessName);
  expect(JSON.stringify(settings)).not.toContain(TENANT_B.businessName);
  expect(JSON.stringify(settings)).not.toContain("tenant-b-template");

  const foreignTemplate = await page.request.get("/api/templates/custom/tenant-b-template");
  expect(foreignTemplate.status()).toBe(404);

  const ownTemplate = await page.request.get("/api/templates/custom/tenant-a-template");
  expect(ownTemplate.ok()).toBeTruthy();
  expect(await ownTemplate.text()).toContain("Tenant A template");

  const exportResponse = await page.request.get("/api/export/jobs.csv");
  expect(exportResponse.ok()).toBeTruthy();
  const csv = await exportResponse.text();
  expect(csv).toContain("Tenant A Job");
  expect(csv).not.toContain("Tenant B Job");
  expect(csv).not.toContain("tenant-b-secret@example.com");

  const measurements = await apiJson(page, "/api/property-measurements?customerId=a-customer");
  const measurementsText = JSON.stringify(measurements);
  expect(measurementsText).toContain("Tenant A Saved Area");
  expect(measurementsText).not.toContain("Tenant B Saved Area");

  await page.goto("/");
  await expect(page.locator("body")).toContainText("Tenant A Job");
  await expect(page.locator("body")).not.toContainText("Tenant B Job");
  await expect(page.locator("body")).not.toContainText("tenant-b-secret-photo.png");
});

test("authenticated cross-tenant writes, deletes, actions, and linked records fail closed", async ({ page }) => {
  await login(page, TENANT_A);
  const csrfToken = (await apiJson(page, "/api/session")).csrfToken;

  const foreignCustomerPatch = await patchJson(page, "/api/customers/b-customer", csrfToken, {
    customerName: "Tenant B Mutated",
    email: "mutated@example.com",
    phone: "(555) 000-0000"
  });
  expect(foreignCustomerPatch.status()).toBe(404);

  const foreignCustomerDelete = await deleteJson(page, "/api/customers/b-customer", csrfToken);
  expect(foreignCustomerDelete.status()).toBe(404);

  const foreignMeasurementDelete = await deleteJson(page, "/api/customers/b-customer/measurements/b-measurement", csrfToken, {
    areaKey: ""
  });
  expect(foreignMeasurementDelete.status()).toBe(404);

  const foreignJobPatch = await patchJson(page, "/api/jobs/b-job", csrfToken, {
    customerName: "Tenant B Mutated",
    email: "mutated@example.com",
    phone: "(555) 000-0000",
    streetAddress: "999 Changed",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    estimate: 1
  });
  expect(foreignJobPatch.status()).toBe(404);

  const foreignJobAction = await postJson(page, "/api/jobs/b-job/send-square-estimate", csrfToken, {});
  expect(foreignJobAction.status()).toBe(404);

  const foreignInvoiceAction = await postJson(page, "/api/jobs/b-job/send-deposit-invoice", csrfToken, {});
  expect(foreignInvoiceAction.status()).toBe(404);

  const foreignScheduleAction = await postJson(page, "/api/jobs/b-job/schedule", csrfToken, {
    scheduledAt: "2026-06-18T09:00",
    jobDurationMinutes: 120
  });
  expect(foreignScheduleAction.status()).toBe(404);
  expect(await foreignScheduleAction.json()).toEqual({ error: "Job not found." });

  const crossTenantExpenseCreate = await postJson(page, "/api/expenses", csrfToken, {
    vendor: "Cross Tenant Vendor",
    category: "Supplies",
    amount: 42,
    expenseDate: "2026-06-17",
    jobId: "b-job"
  });
  expect(crossTenantExpenseCreate.status()).toBe(400);
  expect(await crossTenantExpenseCreate.text()).toContain("Linked job was not found in this account.");

  const foreignExpensePatch = await patchJson(page, "/api/expenses/b-expense", csrfToken, {
    vendor: "Tenant B Mutated Vendor",
    category: "Supplies",
    amount: 2,
    expenseDate: "2026-06-17"
  });
  expect(foreignExpensePatch.status()).toBe(404);

  const foreignExpenseDelete = await deleteJson(page, "/api/expenses/b-expense", csrfToken);
  expect(foreignExpenseDelete.status()).toBe(404);

  const foreignJobDelete = await deleteJson(page, "/api/jobs/b-job", csrfToken);
  expect(foreignJobDelete.status()).toBe(404);

  const settingsSave = await postJson(page, "/api/settings", csrfToken, {
    businessName: "Tenant A Updated",
    onboardingCompleted: true,
    customTemplates: []
  });
  expect(settingsSave.ok()).toBeTruthy();

  const jobs = await readJson("jobs.json");
  const bJob = jobs.find((job) => job.id === "b-job");
  expect(bJob.customerName).toBe("Tenant B Job");
  expect(bJob.status).toBe("Estimate Sent");
  expect(bJob.estimateSentAt).toBe(NOW);

  const customers = await readJson("customers.json");
  expect(customers.find((customer) => customer.id === "b-customer").customerName).toBe("Tenant B Customer");
  expect(customers.find((customer) => customer.id === "b-customer").propertyMeasurements).toHaveLength(1);

  const expenses = await readJson("expenses.json");
  expect(expenses.find((expense) => expense.id === "b-expense").vendor).toBe("Tenant B Vendor");
  expect(expenses.some((expense) => expense.vendor === "Cross Tenant Vendor")).toBe(false);

  const tasks = await readJson("follow-up-tasks.json");
  const bTask = tasks.find((task) => task.id === "b-follow-up-task");
  expect(bTask.status).toBe("pending");

  const users = await readJson("users.json");
  expect(users.find((user) => user.id === TENANT_A.id).settings.businessName).toBe("Tenant A Updated");
  expect(users.find((user) => user.id === TENANT_B.id).settings.businessName).toBe(TENANT_B.businessName);
  expect(JSON.stringify(users.find((user) => user.id === TENANT_B.id).settings.customTemplates)).toContain("tenant-b-template");
});

test("public token workflows are generic on tampering and do not leak other tenant details", async ({ page }) => {
  await expectSafePublicFailure(page, "/estimate/b-job?token=wrong-token", "Estimate not found", "This estimate link is invalid or has expired.");
  await expectSafePublicFailure(page, "/estimate/a-job?token=b-estimate-token", "Estimate not found", "This estimate link is invalid or has expired.");
  await expectSafePublicFailure(page, "/contract/b-contract?token=wrong-token", "Service agreement not found", "This service agreement link is invalid or has expired.");
  await expectSafePublicFailure(page, "/invoice/b-invoice?type=deposit&token=wrong-token", "Invoice not found", "This invoice link is invalid or has expired.");
  await expectSafePublicFailure(page, "/proof/b-proof?token=wrong-token", "Proof page not found", "This completion proof link is invalid or has expired.");

  await page.goto("/invoice/b-invoice?type=deposit&token=b-deposit-token");
  await expect(page.getByRole("heading", { name: "Deposit Invoice" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Tenant B Invoice");
  await expect(page.locator("body")).toContainText(TENANT_B.businessName);
  await expect(page.locator("body")).not.toContainText(TENANT_A.businessName);

  await page.goto("/proof/a-proof?token=a-proof-token");
  await expect(page.locator("body")).toContainText("Completion Proof");
  await expect(page.getByRole("heading", { name: "Driveway cleaning Completed" })).toBeVisible();
  await expect(page.getByRole("img", { name: "tenant-a-proof-after.png" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("tenant-b-proof-after.png");
  await expect(page.locator("body")).not.toContainText(TENANT_B.businessName);
});

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

async function expectJsonIncludesOnlyTenant(page, url, key, allowedText, blockedText) {
  const payload = await apiJson(page, url);
  const body = JSON.stringify(payload[key]);
  expect(body).toContain(allowedText);
  expect(body).not.toContain(blockedText);
}

async function postJson(page, url, csrfToken, data) {
  return page.request.post(url, {
    headers: { "x-csrf-token": csrfToken },
    data
  });
}

async function patchJson(page, url, csrfToken, data) {
  return page.request.patch(url, {
    headers: { "x-csrf-token": csrfToken },
    data
  });
}

async function deleteJson(page, url, csrfToken, data = undefined) {
  return page.request.delete(url, {
    headers: { "x-csrf-token": csrfToken },
    data
  });
}

async function expectSafePublicFailure(page, pathName, heading, message) {
  await page.goto(pathName);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  const body = page.locator("body");
  await expect(body).toContainText(message);
  await expect(body).toContainText("This secure customer page is generated by PressureFlow for Your Company.");
  await expect(body).not.toContainText(TENANT_A.businessName);
  await expect(body).not.toContainText(TENANT_B.businessName);
  await expect(body).not.toContainText("tenant-b-secret@example.com");
  await expect(body).not.toContainText("Tenant B Job");
  await expect(body).not.toContainText("tenant-b-proof-after.png");
}

async function resetTestData() {
  await fs.rm(DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(DATA_DIR, { recursive: true });
  await writeJson("accounts.json", [
    account(TENANT_A),
    account(TENANT_B)
  ]);
  await writeJson("users.json", [
    userRecord(TENANT_A, {
      customTemplates: [customTemplate("tenant-a-template", "Tenant A template")]
    }),
    userRecord(TENANT_B, {
      customTemplates: [customTemplate("tenant-b-template", "Tenant B template")]
    })
  ]);
  await writeJson("settings.local.json", {
    businessName: "",
    businessEmail: "",
    businessPhone: "",
    onboardingCompleted: false,
    customServices: [],
    customServiceTypes: [],
    customPhotoSections: [],
    customTemplates: []
  });
  await writeJson("customers.json", [
    customer("a-customer", TENANT_A, "Tenant A Customer", "tenant-a-secret-photo.png", "Tenant A Saved Area"),
    customer("b-customer", TENANT_B, "Tenant B Customer", "tenant-b-secret-photo.png", "Tenant B Saved Area")
  ]);
  await writeJson("jobs.json", [
    job("a-job", TENANT_A, "Tenant A Job", "Estimate Sent", {
      customerId: "a-customer",
      estimateApprovalToken: "a-estimate-token",
      estimateApprovalUrl: "http://127.0.0.1:3173/estimate/a-job?token=a-estimate-token",
      estimateSentAt: NOW
    }),
    job("b-job", TENANT_B, "Tenant B Job", "Estimate Sent", {
      customerId: "b-customer",
      email: "tenant-b-secret@example.com",
      estimateApprovalToken: "b-estimate-token",
      estimateApprovalUrl: "http://127.0.0.1:3173/estimate/b-job?token=b-estimate-token",
      estimateSentAt: NOW
    }),
    job("b-contract", TENANT_B, "Tenant B Contract", "Contract Sent", {
      customerId: "b-customer",
      contractApprovalToken: "b-contract-token",
      contractApprovalUrl: "http://127.0.0.1:3173/contract/b-contract?token=b-contract-token",
      contractSentAt: NOW
    }),
    job("b-invoice", TENANT_B, "Tenant B Invoice", "Deposit Sent", {
      customerId: "b-customer",
      squareDepositInvoiceId: "b-deposit-token",
      squareDepositInvoiceUrl: "http://127.0.0.1:3173/invoice/b-invoice?type=deposit&token=b-deposit-token"
    }),
    job("a-proof", TENANT_A, "Tenant A Proof", "Final Invoice Sent", {
      customerId: "a-customer",
      completionProofToken: "a-proof-token",
      completionProofUrl: "http://127.0.0.1:3173/proof/a-proof?token=a-proof-token",
      jobPhotos: proofPhotos("tenant-a-proof-before.png", "tenant-a-proof-after.png")
    }),
    job("b-proof", TENANT_B, "Tenant B Proof", "Final Invoice Sent", {
      customerId: "b-customer",
      completionProofToken: "b-proof-token",
      completionProofUrl: "http://127.0.0.1:3173/proof/b-proof?token=b-proof-token",
      jobPhotos: proofPhotos("tenant-b-proof-before.png", "tenant-b-proof-after.png")
    })
  ]);
  await writeJson("expenses.json", [
    expense("a-expense", TENANT_A, "Tenant A Vendor", "a-job"),
    expense("b-expense", TENANT_B, "Tenant B Vendor", "b-job")
  ]);
  await writeJson("follow-up-tasks.json", [
    followUp("a-follow-up-task", TENANT_A, "a-job"),
    followUp("b-follow-up-task", TENANT_B, "b-job")
  ]);
  await writeJson("webhook-events.json", []);
}

function account(tenant) {
  return {
    id: tenant.accountId,
    name: tenant.businessName,
    plan: "tester",
    status: "active",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function userRecord(tenant, settingsExtras = {}) {
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
      businessPhone: "(555) 100-2000",
      zellePayment: `${tenant.email}`,
      paymentInstructions: `Pay ${tenant.businessName}`,
      onboardingCompleted: true,
      customServices: [],
      customServiceTypes: [],
      customPhotoSections: [],
      customTemplates: [],
      ...settingsExtras
    },
    lastLoginAt: "",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function customTemplate(id, text) {
  return {
    id,
    name: text,
    description: "",
    fileName: `${id}.doc`,
    mimeType: "application/msword",
    dataUrl: `data:application/msword;base64,${Buffer.from(text).toString("base64")}`,
    uploadedAt: NOW
  };
}

function customer(id, tenant, customerName, photoName, areaName) {
  return {
    id,
    accountId: tenant.accountId,
    customerName,
    email: `${id}@example.com`,
    phone: "(555) 101-2020",
    streetAddress: "200 Shared Lane",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "200 Shared Lane, Riverside, CA 92501",
    leadSource: "referral",
    notes: "",
    serviceAreaPhotos: [{
      id: `${id}-photo`,
      name: photoName,
      section: "Front",
      dataUrl: ONE_BY_ONE_GIF,
      capturedAt: NOW,
      file: {
        id: `${id}-photo`,
        provider: "inline",
        accountId: tenant.accountId,
        ownerType: "customer",
        ownerId: id,
        purpose: "service-area-photo",
        name: photoName,
        mimeType: "image/gif",
        byteLength: ONE_BY_ONE_GIF.length,
        contentHash: "test",
        createdAt: NOW
      }
    }],
    propertyMeasurements: [{
      id: id === "a-customer" ? "a-measurement" : "b-measurement",
      label: areaName,
      address: "200 Shared Lane, Riverside, CA 92501",
      updatedAt: NOW,
      measurement: measurement(areaName)
    }],
    createdAt: NOW,
    updatedAt: NOW
  };
}

function job(id, tenant, customerName, status, extras = {}) {
  return {
    id,
    accountId: tenant.accountId,
    customerId: extras.customerId || "",
    customerName,
    email: extras.email || `${id}@example.com`,
    phone: "(555) 303-4040",
    streetAddress: "300 Tenant Test Road",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    address: "300 Tenant Test Road, Riverside, CA 92501",
    serviceType: "Driveway cleaning",
    leadSource: "referral",
    estimate: 500,
    depositPercent: 25,
    lineItems: [{ name: "Driveway cleaning", quantity: 1, unit: "Qty", price: 500, total: 500 }],
    status,
    scheduledAt: "",
    notes: "",
    accessNotes: "",
    sensitiveAreas: "",
    paymentRecords: [],
    squareDepositInvoiceStatus: "",
    squareFinalInvoiceStatus: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...extras
  };
}

function expense(id, tenant, vendor, jobId) {
  return {
    id,
    accountId: tenant.accountId,
    jobId,
    vendor,
    category: "Supplies",
    amount: 25,
    expenseDate: "2026-06-17",
    notes: "",
    receiptPhotos: [],
    createdAt: NOW,
    updatedAt: NOW
  };
}

function followUp(id, tenant, jobId) {
  return {
    id,
    accountId: tenant.accountId,
    jobId,
    type: "estimate_followup",
    source: "auto",
    scheduledFor: "2099-06-17T12:00:00.000Z",
    status: "pending",
    cancelledReason: "",
    sentAt: "",
    createdAt: NOW,
    updatedAt: NOW
  };
}

function proofPhotos(beforeName, afterName) {
  return {
    before: [photo(beforeName)],
    after: [photo(afterName)]
  };
}

function photo(name) {
  return {
    id: name,
    name,
    section: "",
    dataUrl: ONE_BY_ONE_GIF,
    capturedAt: NOW,
    file: {
      id: name,
      provider: "inline",
      accountId: name.startsWith("tenant-a") ? TENANT_A.accountId : TENANT_B.accountId,
      ownerType: "job",
      ownerId: name,
      purpose: "completion-proof",
      name,
      mimeType: "image/gif",
      byteLength: ONE_BY_ONE_GIF.length,
      contentHash: "test",
      createdAt: NOW
    }
  };
}

function measurement(areaName) {
  const geojson = {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[
        [-117.397, 33.953],
        [-117.397, 33.954],
        [-117.396, 33.954],
        [-117.396, 33.953],
        [-117.397, 33.953]
      ]]
    },
    properties: {}
  };
  return {
    address: "200 Shared Lane, Riverside, CA 92501",
    squareFeet: 100,
    perimeterFeet: 40,
    geojson: { type: "FeatureCollection", features: [geojson] },
    areas: [{
      id: `${areaName.toLowerCase().replace(/\s+/g, "-")}-area`,
      name: areaName,
      squareFeet: 100,
      perimeterFeet: 40,
      geojson,
      capturedAt: NOW
    }],
    center: [-117.397, 33.953],
    zoom: 18,
    staticImageUrl: "",
    capturedAt: NOW
  };
}

async function readJson(fileName) {
  return JSON.parse(await fs.readFile(path.join(DATA_DIR, fileName), "utf8"));
}

async function writeJson(fileName, value) {
  await fs.writeFile(path.join(DATA_DIR, fileName), JSON.stringify(value, null, 2));
}

function hashPassword(password) {
  const iterations = 120000;
  const salt = "playwright-local-salt";
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, iterations, 32, "sha256").toString("base64url");
  return `pbkdf2-sha256$${iterations}$${salt}$${hash}`;
}
