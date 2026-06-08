const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createAuthHelpers, SESSION_COOKIE } = require("../auth");
const { sendCustomerEmail } = require("../email-delivery");
const { buildCompletionCertificateEmailMessage } = require("../email-content");
const { formatEmailAddressHeader } = require("../integrations/email");
const { createJobActionHandler } = require("../job-actions");
const { createPublicWorkflowHandlers } = require("../public-workflows");
const { createRecordRoutes } = require("../record-routes");
const {
  normalizeSettings,
  publicSettings
} = require("../settings");
const {
  normalizeCustomer,
  normalizeJob
} = require("../records");
const { getDayOfServiceInstructions } = require("../scheduling");
const { createWorkspaceAccess } = require("../workspace");

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
  await testLoginAndSession();
  await testReaddDisabledTester();
  await testAccountIsolation();
  await testPublicWorkflowLookupIgnoresLoggedInAccountScope();
  await testRecordCreateRoutes();
  testSettingsVisibilityAndValidation();
  testCustomerFacingSenderName();
  testCompletionCertificateUsesGenericServiceWording();
  await testEstimateAndInvoicePublicFlow();
  await testWorkflowEmailIdempotency();
  await testEmailDeliveryCanBeSkippedForBrowserSmoke();
  console.log("test-user safety smoke ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
