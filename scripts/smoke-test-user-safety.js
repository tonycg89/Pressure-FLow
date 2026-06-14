const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createAuthHelpers, SESSION_COOKIE } = require("../auth");
const { sendCustomerEmail } = require("../email-delivery");
const { buildCompletionCertificateEmailMessage } = require("../email-content");
const { formatEmailAddressHeader } = require("../integrations/email");
const { createJobActionHandler, shouldCreateGoogleCalendarEvent } = require("../job-actions");
const { createPublicWorkflowHandlers } = require("../public-workflows");
const { createRecordRoutes } = require("../record-routes");
const {
  normalizeSettings,
  publicSettings,
  validateSettingsInput
} = require("../settings");
const {
  FIELD_LIMITS,
  MAX_EXPENSE_AMOUNT,
  normalizeCustomer,
  normalizeExpense,
  normalizeJob,
  validateCustomer,
  validateExpense,
  validateJob
} = require("../records");
const { getDayOfServiceInstructions } = require("../scheduling");
const { createWorkspaceAccess } = require("../workspace");
const { verifySquareSignature } = require("../integrations/square");
const { verifyStripeSignature } = require("../integrations/stripe");
const { mergeUserSettingsWithPlatform } = require("../db");

function responseStub() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") {
      this.body = String(body);
    }
  };
}

function sendJson(response, status, data) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(data));
}

function sendError(response, status, message) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: message }));
}

function safeCompare(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function testWebhookSignatureVerificationRequiresSecrets() {
  const stripeBody = JSON.stringify({ id: "evt_test" });
  const stripeTimestamp = "1800000000";
  const stripeSecret = "whsec_test_secret";
  const stripeDigest = crypto
    .createHmac("sha256", stripeSecret)
    .update(`${stripeTimestamp}.${stripeBody}`)
    .digest("hex");
  const stripeHeader = `t=${stripeTimestamp},v1=${stripeDigest}`;

  assert.equal(verifyStripeSignature(stripeHeader, stripeBody, "", safeCompare), false);
  assert.equal(verifyStripeSignature("t=1800000000,v1=bad", stripeBody, stripeSecret, safeCompare), false);
  assert.equal(verifyStripeSignature(stripeHeader, stripeBody, stripeSecret, safeCompare), true);

  const squareBody = JSON.stringify({ data: { object: { invoice: { id: "sq-test" } } } });
  const squareSecret = "square_signature_key";
  const squareRequest = {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "example.test"
    }
  };
  const squareSignature = crypto
    .createHmac("sha256", squareSecret)
    .update(`https://example.test/webhooks/square${squareBody}`)
    .digest("base64");

  assert.equal(verifySquareSignature(squareRequest, squareBody, "", safeCompare), false);
  assert.equal(verifySquareSignature({ headers: { ...squareRequest.headers, "x-square-hmacsha256-signature": "bad" } }, squareBody, squareSecret, safeCompare), false);
  assert.equal(verifySquareSignature({ headers: { ...squareRequest.headers, "x-square-hmacsha256-signature": squareSignature } }, squareBody, squareSecret, safeCompare), true);
}

async function testLoginAndSession() {
  process.env.SESSION_SECRET = "smoke-session-secret";
  let users = [];
  let accounts = [];
  const context = { session: null };
  const auth = createAuthHelpers({
    readUsers: async () => users,
    writeUsers: async (value) => { users = value; },
    readAccounts: async () => accounts,
    writeAccounts: async (value) => { accounts = value; },
    safeCompare,
    getContextStore: () => context
  });

  const { user } = await auth.createAppUser({
    name: "Tester",
    email: "tester@example.com",
    password: "temporary-password",
    role: "tester"
  });
  const login = await auth.authenticateLogin("tester@example.com", "temporary-password");
  assert.equal(login.userId, user.id);
  assert.equal(login.accountId, user.accountId);

  const cookie = auth.buildSessionCookie(login).split(";")[0];
  const session = auth.getValidSession({ headers: { cookie }, socket: {} });
  assert.equal(session.userId, user.id);
  assert.equal(auth.publicSessionUser(session).isOwner, false);
  assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`));
}

async function testReaddDisabledTester() {
  let users = [];
  let accounts = [];
  const context = { session: null };
  const auth = createAuthHelpers({
    readUsers: async () => users,
    writeUsers: async (value) => { users = value; },
    readAccounts: async () => accounts,
    writeAccounts: async (value) => { accounts = value; },
    safeCompare,
    getContextStore: () => context
  });

  const first = await auth.createAppUser({
    name: "Tester One",
    email: "readd@example.com",
    password: "temporary-password",
    role: "tester"
  });
  users = users.map((user) => user.id === first.user.id ? { ...user, disabled: true } : user);
  accounts = accounts.map((account) => account.id === first.user.accountId ? { ...account, status: "disabled" } : account);

  const second = await auth.createAppUser({
    name: "Tester Again",
    email: "readd@example.com",
    password: "new-temporary-password",
    role: "tester"
  });
  assert.equal(second.user.id, first.user.id);
  assert.equal(second.user.disabled, false);
  assert.equal(second.user.name, "Tester Again");
  assert.equal(users.filter((user) => user.email === "readd@example.com").length, 1);
  assert.equal(accounts.find((account) => account.id === first.user.accountId).status, "active");

  const login = await auth.authenticateLogin("readd@example.com", "new-temporary-password");
  assert.equal(login.userId, first.user.id);
}

async function testAccountIsolation() {
  let jobs = [
    { id: "job-a", accountId: "acct-a", customerName: "A" },
    { id: "job-b", accountId: "acct-b", customerName: "B" }
  ];
  let customers = [
    { id: "cust-a", accountId: "acct-a", customerName: "A" },
    { id: "cust-b", accountId: "acct-b", customerName: "B" }
  ];
  let expenses = [
    { id: "exp-a", accountId: "acct-a", vendor: "A" },
    { id: "exp-b", accountId: "acct-b", vendor: "B" }
  ];
  let settingsWrites = [];
  const context = { session: { userId: "user-a", accountId: "acct-a", role: "tester" } };
  const workspace = createWorkspaceAccess({
    getContextStore: () => context,
    readAccounts: async () => [{ id: "acct-a" }, { id: "acct-b" }],
    readAllCustomers: async () => customers,
    readAllExpenses: async () => expenses,
    readAllJobs: async () => jobs,
    readUserSettings: async (accountId) => ({ businessName: accountId }),
    writeAllCustomers: async (value) => { customers = value; },
    writeAllExpenses: async (value) => { expenses = value; },
    writeAllJobs: async (value) => { jobs = value; },
    writeUserSettings: async (accountId, value) => { settingsWrites.push({ accountId, value }); }
  });

  assert.deepEqual((await workspace.readJobs()).map((job) => job.id), ["job-a"]);
  assert.deepEqual((await workspace.readCustomers()).map((customer) => customer.id), ["cust-a"]);
  assert.deepEqual((await workspace.readExpenses()).map((expense) => expense.id), ["exp-a"]);

  await workspace.writeJobs([{ id: "job-a2", customerName: "A2" }]);
  assert.deepEqual(jobs.map((job) => [job.id, job.accountId]), [["job-a2", "acct-a"], ["job-b", "acct-b"]]);

  assert.equal((await workspace.readSettings()).businessName, "acct-a");
  await workspace.writeSettings({ businessName: "A Settings" });
  assert.deepEqual(settingsWrites[0], { accountId: "acct-a", value: { businessName: "A Settings" } });
}

async function testPublicWorkflowLookupIgnoresLoggedInAccountScope() {
  const jobs = [
    { id: "public-job-a", accountId: "acct-a", estimateApprovalToken: "token-a" },
    { id: "public-job-b", accountId: "acct-b", estimateApprovalToken: "token-b" }
  ];
  const context = { session: { userId: "user-b", accountId: "acct-b", role: "tester" } };
  const workspace = createWorkspaceAccess({
    getContextStore: () => context,
    readAccounts: async () => [{ id: "acct-a" }, { id: "acct-b" }],
    readAllCustomers: async () => [],
    readAllExpenses: async () => [],
    readAllJobs: async () => jobs,
    readUserSettings: async () => ({}),
    writeAllCustomers: async () => {},
    writeAllExpenses: async () => {},
    writeAllJobs: async () => {},
    writeUserSettings: async () => {}
  });
  const handlers = createPublicWorkflowHandlers({
    createPressureFlowInvoice: async () => ({}),
    readJobs: workspace.readJobs,
    readSettingsForJob: async () => ({}),
    sendAdminTextAlertSafe: async () => {},
    sendContractEmail: async () => {},
    writeJobs: async () => {}
  });

  assert.equal(await handlers.findPublicEstimate("public-job-a", "token-a"), null);
  context.session = null;
  assert.equal((await handlers.findPublicEstimate("public-job-a", "token-a")).accountId, "acct-a");
}

async function testRecordCreateRoutes() {
  let jobs = [];
  let customers = [];
  let expenses = [];
  const routes = createRecordRoutes({
    cancelStoredInvoiceIfPossible: async () => {},
    deleteCustomerMeasurementArea: () => true,
    didPricingChange: () => false,
    findSavedMeasurements: async () => [],
    normalizeCustomer,
    normalizeExpense: (input) => ({ id: "expense-1", ...input }),
    normalizeJob,
    readCustomers: async () => customers,
    readExpenses: async () => expenses,
    readJobs: async () => jobs,
    readRequestBody: async (request) => request.body || {},
    resetJobForPricingChange: async () => {},
    sendError,
    sendJson,
    statuses: ["Lead"],
    syncJobMeasurementToCustomerFile: async () => {},
    updateJob: Object.assign,
    validateCustomer: (customer) => !customer.customerName ? "Customer name is required." : "",
    validateExpense: () => "",
    validateJob: (job) => !job.customerName ? "Customer name is required." : "",
    writeCustomers: async (value) => { customers = value; },
    writeExpenses: async (value) => { expenses = value; },
    writeJobs: async (value) => { jobs = value; }
  });

  let response = responseStub();
  await routes.handleRecordRoutes({
    method: "POST",
    body: {
      customerName: "Customer",
      email: "customer@example.com",
      phone: "555-111-2222",
      streetAddress: "1 Main",
      city: "Riverside",
      state: "ca",
      zip: "92501",
      estimate: 100,
      lineItems: [{ name: "Pressure Washing", unit: "<bad>", quantity: 10, price: -5, total: -50 }]
    }
  }, response, new URL("http://local/api/jobs"));
  assert.equal(response.status, 201);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].lineItems[0].unit, "Qty");
  assert.equal(jobs[0].lineItems[0].price, 0);

  response = responseStub();
  await routes.handleRecordRoutes({
    method: "POST",
    body: { customerName: "Customer", email: "customer@example.com" }
  }, response, new URL("http://local/api/customers"));
  assert.equal(response.status, 201);
  assert.equal(customers.length, 1);
}

async function testExpenseJobLinkTenantGuard() {
  const jobs = [
    { id: "job-a", accountId: "acct-a", customerName: "A" }
  ];
  let expenses = [
    { id: "exp-existing", accountId: "acct-a", vendor: "Existing", amount: 15, jobId: "job-a" }
  ];
  const routes = createRecordRoutes({
    cancelStoredInvoiceIfPossible: async () => {},
    deleteCustomerMeasurementArea: () => true,
    didPricingChange: () => false,
    findSavedMeasurements: async () => [],
    normalizeCustomer,
    normalizeExpense: (input, existing = {}) => ({
      id: existing.id || input.id || `expense-${expenses.length + 1}`,
      vendor: input.vendor ?? existing.vendor ?? "",
      amount: Number(input.amount ?? existing.amount ?? 0),
      jobId: String(input.jobId ?? existing.jobId ?? "").trim()
    }),
    normalizeJob,
    readCustomers: async () => [],
    readExpenses: async () => expenses,
    readJobs: async () => jobs,
    readRequestBody: async (request) => request.body || {},
    resetJobForPricingChange: async () => {},
    sendError,
    sendJson,
    statuses: ["Lead"],
    syncJobMeasurementToCustomerFile: async () => {},
    updateJob: Object.assign,
    validateCustomer: () => "",
    validateExpense: (expense) => !expense.vendor ? "Vendor is required." : "",
    validateJob: () => "",
    writeCustomers: async () => {},
    writeExpenses: async (value) => { expenses = value; },
    writeJobs: async () => {}
  });

  let response = responseStub();
  await routes.handleRecordRoutes({
    method: "POST",
    body: { vendor: "Same Account", amount: 10, jobId: "job-a" }
  }, response, new URL("http://local/api/expenses"));
  assert.equal(response.status, 201);
  assert.equal(JSON.parse(response.body).expense.jobId, "job-a");

  response = responseStub();
  await routes.handleRecordRoutes({
    method: "POST",
    body: { vendor: "Unlinked", amount: 12, jobId: "" }
  }, response, new URL("http://local/api/expenses"));
  assert.equal(response.status, 201);
  assert.equal(JSON.parse(response.body).expense.jobId, "");

  response = responseStub();
  await routes.handleRecordRoutes({
    method: "POST",
    body: { vendor: "Cross Account", amount: 14, jobId: "job-b" }
  }, response, new URL("http://local/api/expenses"));
  assert.equal(response.status, 400);
  assert.match(JSON.parse(response.body).error, /Linked job/);

  response = responseStub();
  await routes.handleRecordRoutes({
    method: "PATCH",
    body: { vendor: "Existing", amount: 15, jobId: "job-b" }
  }, response, new URL("http://local/api/expenses/exp-existing"));
  assert.equal(response.status, 400);
  assert.equal(expenses.find((expense) => expense.id === "exp-existing").jobId, "job-a");
}

function testValidationReadiness() {
  const validJob = normalizeJob({
    customerName: "Valid Customer",
    email: "valid@example.com",
    phone: "555-111-2222",
    streetAddress: "10 Main St",
    city: "Riverside",
    state: "CA",
    zip: "92501",
    serviceType: "Window cleaning",
    estimate: 250,
    depositPercent: 25,
    measurement: { staticImageUrl: "https://example.test/map.png" }
  });
  assert.equal(validateJob(validJob), "");

  const badJobEmail = normalizeJob({
    ...validJob,
    email: "bad email"
  });
  assert.match(validateJob(badJobEmail), /valid email/);

  const unsafeMeasurementJob = normalizeJob({
    ...validJob,
    measurement: { staticImageUrl: "javascript:alert(1)" }
  });
  assert.match(validateJob(unsafeMeasurementJob), /preview image URL/);

  const overlongJob = normalizeJob({
    ...validJob,
    serviceType: "S".repeat(FIELD_LIMITS.serviceType + 20),
    notes: "N".repeat(FIELD_LIMITS.jobNotes + 20)
  });
  assert.equal(overlongJob.serviceType.length, FIELD_LIMITS.serviceType);
  assert.equal(overlongJob.notes.length, FIELD_LIMITS.jobNotes);

  const validCustomer = normalizeCustomer({
    customerName: "Valid Customer",
    email: "valid@example.com",
    phone: "555-111-2222"
  });
  assert.equal(validateCustomer(validCustomer), "");

  const badCustomerEmail = normalizeCustomer({
    customerName: "Bad Email",
    email: "bad email",
    phone: ""
  });
  assert.match(validateCustomer(badCustomerEmail), /valid email/);

  const overlongCustomer = normalizeCustomer({
    customerName: "C".repeat(FIELD_LIMITS.customerName + 20),
    email: "customer@example.com",
    phone: "1".repeat(FIELD_LIMITS.phone + 20)
  });
  assert.equal(overlongCustomer.customerName.length, FIELD_LIMITS.customerName);
  assert.equal(overlongCustomer.phone.length, FIELD_LIMITS.phone);

  const validExpense = normalizeExpense({
    vendor: "Home Depot",
    category: "Materials",
    amount: 123.45,
    expenseDate: "2026-06-12",
    notes: "Receipt for supplies"
  });
  assert.equal(validateExpense(validExpense), "");

  const badExpenseDate = normalizeExpense({
    vendor: "Bad Date",
    amount: 12,
    expenseDate: "2026-02-31"
  });
  assert.match(validateExpense(badExpenseDate), /real date/);

  const hugeExpense = normalizeExpense({
    vendor: "Huge Amount",
    amount: MAX_EXPENSE_AMOUNT + 0.01,
    expenseDate: "2026-06-12"
  });
  assert.match(validateExpense(hugeExpense), /1,000,000/);

  const overlongExpense = normalizeExpense({
    vendor: "V".repeat(FIELD_LIMITS.expenseVendor + 20),
    category: "C".repeat(FIELD_LIMITS.expenseCategory + 20),
    amount: 12,
    expenseDate: "2026-06-12",
    notes: "N".repeat(FIELD_LIMITS.expenseNotes + 20)
  });
  assert.equal(overlongExpense.vendor.length, FIELD_LIMITS.expenseVendor);
  assert.equal(overlongExpense.category.length, FIELD_LIMITS.expenseCategory);
  assert.equal(overlongExpense.notes.length, FIELD_LIMITS.expenseNotes);

  assert.match(validateSettingsInput({ businessEmail: "bad email" }), /Business email/);
  assert.equal(validateSettingsInput({ businessEmail: "valid@example.com" }), "");
  const validSettings = normalizeSettings({
    businessName: "Valid Business",
    businessEmail: "valid@example.com",
    businessPhone: "555-111-2222",
    paymentInstructions: "Pay online."
  }, {});
  assert.equal(validSettings.businessEmail, "valid@example.com");
  assert.equal(validSettings.businessName, "Valid Business");
}

function testSettingsVisibilityAndValidation() {
  const ownerSettings = normalizeSettings({
    businessEmail: "bad email",
    serviceIndustry: "Landscaping",
    defaultDepositEnabled: false,
    smtpFromEmail: "sender@example.com",
    googleRedirectUri: "javascript:alert(1)",
    quickBooksRedirectUri: "https://quickbooks.example/callback",
    mapboxPublicToken: "pk.owner",
    squareAccessToken: "square-secret",
    stripeSecretKey: "stripe-secret",
    smtpPassword: "smtp-secret",
    quickBooksClientSecret: "qb-secret",
    customServices: [{ name: "Service", unit: "LNF", price: -5 }],
    customServiceTypes: ["A".repeat(150)]
  }, {});

  assert.equal(ownerSettings.businessEmail, "");
  assert.equal(ownerSettings.serviceIndustry, "Landscaping");
  assert.equal(ownerSettings.defaultDepositEnabled, false);
  assert.equal(ownerSettings.smtpFromEmail, "sender@example.com");
  assert.equal(ownerSettings.googleRedirectUri, undefined);
  assert.equal(ownerSettings.quickBooksRedirectUri, "https://quickbooks.example/callback");
  assert.equal(ownerSettings.customServices[0].unit, "LFN");
  assert.equal(ownerSettings.customServices[0].price, 0);
  assert.equal(ownerSettings.customServiceTypes[0].length, 100);

  const invalidIndustrySettings = normalizeSettings({ serviceIndustry: "Window<script>" }, {});
  assert.equal(invalidIndustrySettings.serviceIndustry, "");

  const customDayInstructions = normalizeSettings({
    dayOfServiceInstructions: "- Clear the driveway\n* Meet the crew at the gate"
  }, {});
  assert.deepEqual(getDayOfServiceInstructions(customDayInstructions), ["Clear the driveway", "Meet the crew at the gate"]);
  assert.ok(getDayOfServiceInstructions({ serviceIndustry: "Landscaping" }).some((item) => item.includes("sprinkler")));

  const publicValues = publicSettings(ownerSettings, { hidePlatformCredentials: true });
  assert.equal(publicValues.squareAccessToken, undefined);
  assert.equal(publicValues.stripeSecretKey, undefined);
  assert.equal(publicValues.smtpPassword, undefined);
  assert.equal(publicValues.quickBooksClientSecret, undefined);
  assert.equal(publicValues.googleClientSecret, undefined);
  assert.equal(publicValues.mapboxPublicToken, "pk.owner");
  assert.equal(publicValues.hasMapboxPublicToken, true);
}

function testNewAccountMapboxTokenPropagation() {
  const previousMapboxToken = process.env.MAPBOX_PUBLIC_TOKEN;
  process.env.MAPBOX_PUBLIC_TOKEN = "pk.platform-test";
  try {
    const testerSettings = mergeUserSettingsWithPlatform({}, {});
    assert.equal(testerSettings.mapboxPublicToken, "pk.platform-test");
    assert.equal(publicSettings(testerSettings, { hidePlatformCredentials: true }).mapboxPublicToken, "pk.platform-test");

    const savedTesterSettings = mergeUserSettingsWithPlatform({ mapboxPublicToken: "pk.saved-test" }, {});
    assert.equal(savedTesterSettings.mapboxPublicToken, "pk.saved-test");
  } finally {
    if (previousMapboxToken === undefined) {
      delete process.env.MAPBOX_PUBLIC_TOKEN;
    } else {
      process.env.MAPBOX_PUBLIC_TOKEN = previousMapboxToken;
    }
  }
}

async function testCalendarlessSchedulingInTestMode() {
  assert.equal(shouldCreateGoogleCalendarEvent({}), true);
  assert.equal(shouldCreateGoogleCalendarEvent({ googleRefreshToken: "refresh-token" }), true);

  const previousSkipEmail = process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
  process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = "true";
  try {
    assert.equal(shouldCreateGoogleCalendarEvent({}), false);
    let calendarCalls = 0;
    let scheduleEmails = 0;
    const actions = createJobActionHandler({
      createGoogleCalendarEvent: async () => {
        calendarCalls += 1;
        throw new Error("Calendar should not be called in test-safe disconnected mode.");
      },
      readSettings: async () => ({ businessName: "Test Business", defaultJobDurationMinutes: 180 }),
      sendAdminTextAlertSafe: async () => {},
      sendScheduleConfirmationEmail: async () => { scheduleEmails += 1; }
    });
    const job = {
      id: "calendarless-schedule",
      accountId: "acct-calendarless",
      customerName: "Schedule Customer",
      email: "schedule@example.com",
      phone: "555-0100",
      address: "20 Calendar Way",
      serviceType: "Window cleaning",
      estimate: 300,
      status: "Deposit Paid"
    };

    await actions.applyAction(job, "schedule", {
      scheduledAt: "2026-06-10T09:00",
      jobDurationMinutes: 120,
      _baseUrl: "https://pressureflow.test"
    });

    assert.equal(calendarCalls, 0);
    assert.equal(scheduleEmails, 1);
    assert.equal(job.status, "Scheduled");
    assert.equal(job.scheduledAt, "2026-06-10T09:00");
    assert.equal(job.googleCalendarEventId, undefined);
  } finally {
    if (previousSkipEmail === undefined) {
      delete process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
    } else {
      process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = previousSkipEmail;
    }
  }
}

function testCustomerFacingSenderName() {
  assert.equal(
    formatEmailAddressHeader("sender@example.com", "Johnson Exterior Cleaning"),
    "=?UTF-8?B?Sm9obnNvbiBFeHRlcmlvciBDbGVhbmluZw==?= <sender@example.com>"
  );
  assert.equal(
    formatEmailAddressHeader("sender@example.com", ""),
    "=?UTF-8?B?UHJlc3N1cmVGbG93?= <sender@example.com>"
  );
}

function testCompletionCertificateUsesGenericServiceWording() {
  const message = buildCompletionCertificateEmailMessage({
    id: "job-complete",
    customerName: "Customer",
    email: "customer@example.com",
    address: "10 Main St",
    estimate: 100,
    depositPercent: 100,
    jobPhotos: { before: [], after: [] }
  }, { businessName: "Service Company" }, "https://example.test");

  assert.match(message.textBody, /scheduled service work/);
  assert.doesNotMatch(message.textBody, /pressure washing/i);
  assert.doesNotMatch(message.htmlBody, /pressure washing/i);
}

async function testEstimateAndInvoicePublicFlow() {
  const jobs = [{
    id: "job-1",
    accountId: "acct-a",
    customerName: "Customer",
    email: "customer@example.com",
    estimate: 200,
    estimateApprovalToken: "estimate-token",
    estimateApprovalUrl: "https://pressureflow.test/estimate/job-1?token=estimate-token",
    contractApprovalToken: "",
    squareDepositInvoiceId: "deposit-token",
    squareFinalInvoiceId: "final-token"
  }];
  const handlers = createPublicWorkflowHandlers({
    createPressureFlowInvoice: async () => ({ invoiceId: "deposit-token", publicUrl: "https://invoice.test/deposit" }),
    readJobs: async () => jobs,
    readSettingsForJob: async (job) => ({ businessName: `settings-for-${job.accountId}` }),
    sendAdminTextAlertSafe: async () => {},
    sendContractEmail: async () => {},
    writeJobs: async () => {}
  });

  assert.equal((await handlers.findPublicEstimate("job-1", "estimate-token")).accountId, "acct-a");
  assert.equal(await handlers.findPublicEstimate("job-1", "wrong-token"), null);
  assert.equal((await handlers.findPublicInvoice("job-1", "deposit", "deposit-token")).id, "job-1");
  assert.equal(await handlers.findPublicInvoice("job-1", "deposit", "wrong-token"), null);
}

async function testWorkflowEmailIdempotency() {
  let tokenIndex = 0;
  const sent = [];
  const actions = createJobActionHandler({
    createGoogleCalendarEvent: async () => ({}),
    createPressureFlowInvoice: async () => ({ invoiceId: "invoice-token", publicUrl: "https://invoice.test/deposit" }),
    readSettings: async () => ({ businessName: "Test Business" }),
    randomToken: () => `token-${++tokenIndex}`,
    sendAdminTextAlertSafe: async () => {},
    sendCompletionCertificateEmailSafe: async () => {},
    sendContractEmail: async (job) => { sent.push(["contract", job.contractApprovalUrl]); },
    sendEstimateEmail: async (job) => { sent.push(["estimate", job.estimateApprovalUrl]); },
    sendScheduleConfirmationEmail: async () => {}
  });

  const job = { id: "job-duplicate-click", customerName: "Customer", email: "customer@example.com", estimate: 100 };
  await actions.applyAction(job, "send-square-estimate", { _baseUrl: "https://pressureflow.test" });
  const estimateUrl = job.estimateApprovalUrl;
  await actions.applyAction(job, "send-square-estimate", { _baseUrl: "https://pressureflow.test" });
  assert.equal(job.estimateApprovalUrl, estimateUrl);
  assert.deepEqual(sent.filter(([type]) => type === "estimate"), [["estimate", estimateUrl]]);

  await actions.applyAction(job, "send-contract", { _baseUrl: "https://pressureflow.test" });
  const contractUrl = job.contractApprovalUrl;
  await actions.applyAction(job, "send-contract", { _baseUrl: "https://pressureflow.test" });
  assert.equal(job.contractApprovalUrl, contractUrl);
  assert.deepEqual(sent.filter(([type]) => type === "contract"), [["contract", contractUrl]]);

  const publicJobs = [{
    id: "public-job",
    accountId: "acct-a",
    customerName: "Customer",
    email: "customer@example.com",
    estimate: 100,
    estimateApprovalToken: "estimate-token",
    estimateApprovalUrl: "https://pressureflow.test/estimate/public-job?token=estimate-token",
    contractApprovalToken: ""
  }];
  let contractEmails = 0;
  let invoices = 0;
  const handlers = createPublicWorkflowHandlers({
    createPressureFlowInvoice: async () => {
      invoices += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { invoiceId: "deposit-token", publicUrl: "https://invoice.test/deposit" };
    },
    readJobs: async () => publicJobs,
    readSettingsForJob: async () => ({ businessName: "Test Business" }),
    sendAdminTextAlertSafe: async () => {},
    sendContractEmail: async () => {
      contractEmails += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
    writeJobs: async () => {}
  });

  await Promise.all([
    handlers.approvePublicEstimate("public-job", "estimate-token"),
    handlers.approvePublicEstimate("public-job", "estimate-token")
  ]);
  assert.equal(contractEmails, 1);

  const contractToken = publicJobs[0].contractApprovalToken;
  await Promise.all([
    handlers.signPublicContract("public-job", contractToken, "Customer", "2026-06-06"),
    handlers.signPublicContract("public-job", contractToken, "Customer", "2026-06-06")
  ]);
  assert.equal(invoices, 1);
}

async function testManualPaymentMarkingStillWorks() {
  const sent = [];
  const actions = createJobActionHandler({
    cancelPendingFollowUp: async (jobId, reason, accountId, type) => {
      sent.push({ jobId, reason, accountId, type });
    },
    createGoogleCalendarEvent: async () => ({}),
    createPressureFlowInvoice: async () => ({}),
    readSettings: async () => ({ businessName: "Test Business" }),
    randomToken: () => "token",
    sendAdminTextAlertSafe: async () => {},
    sendCompletionCertificateEmailSafe: async () => {},
    sendContractEmail: async () => {},
    sendEstimateEmail: async () => {},
    sendScheduleConfirmationEmail: async () => {}
  });
  const job = {
    id: "manual-payment-job",
    accountId: "acct-manual",
    customerName: "Manual Customer",
    email: "manual@example.com",
    address: "10 Main",
    serviceType: "Driveway cleaning",
    estimate: 200,
    depositPercent: 25,
    status: "Final Invoice Sent",
    squareFinalInvoiceId: "final-invoice",
    squareFinalInvoiceUrl: "https://invoice.test/final"
  };

  await actions.applyAction(job, "mark-paid", {
    paymentMethod: "Check",
    paymentReference: "1001",
    _baseUrl: "https://pressureflow.test"
  });

  assert.equal(job.status, "Paid");
  assert.equal(job.paymentRecords[0].method, "Check");
  assert.equal(sent[0].type, "invoice_followup");
}

async function testEmailDeliveryCanBeSkippedForBrowserSmoke() {
  const previous = process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
  process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = "true";
  try {
    const result = await sendCustomerEmail({ emailSendProvider: "smtp" }, {
      to: "customer@example.com",
      subject: "Smoke",
      textBody: "Smoke",
      htmlBody: "<p>Smoke</p>"
    });
    assert.equal(result.skipped, true);
    assert.equal(result.to, "customer@example.com");
  } finally {
    if (previous === undefined) {
      delete process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY;
    } else {
      process.env.PRESSUREFLOW_SKIP_EMAIL_DELIVERY = previous;
    }
  }
}

(async () => {
  testWebhookSignatureVerificationRequiresSecrets();
  await testLoginAndSession();
  await testReaddDisabledTester();
  await testAccountIsolation();
  await testPublicWorkflowLookupIgnoresLoggedInAccountScope();
  await testRecordCreateRoutes();
  await testExpenseJobLinkTenantGuard();
  testValidationReadiness();
  testSettingsVisibilityAndValidation();
  testNewAccountMapboxTokenPropagation();
  await testCalendarlessSchedulingInTestMode();
  testCustomerFacingSenderName();
  testCompletionCertificateUsesGenericServiceWording();
  await testEstimateAndInvoicePublicFlow();
  await testWorkflowEmailIdempotency();
  await testManualPaymentMarkingStillWorks();
  await testEmailDeliveryCanBeSkippedForBrowserSmoke();
  console.log("test-user safety smoke ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
