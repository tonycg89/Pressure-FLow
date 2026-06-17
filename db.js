const { readFile, writeFile, mkdir, rename, copyFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = process.env.PRESSUREFLOW_DATA_DIR || path.join(ROOT, "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const FOLLOW_UP_TASKS_FILE = path.join(DATA_DIR, "follow-up-tasks.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.local.json");
const WEBHOOK_LOG_FILE = path.join(DATA_DIR, "webhook-events.json");
const usePostgres = Boolean(process.env.DATABASE_URL);
let pool;
let postgresSchemaReady = false;

const defaultSettings = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  serviceIndustry: "",
  businessLogoDataUrl: "",
  defaultDepositEnabled: true,
  defaultDepositPercent: 25,
  defaultJobDurationMinutes: 180,
  finalInvoiceTiming: "immediate_after_completion",
  squareEnvironment: "sandbox",
  squareAccessToken: "",
  squareLocationId: "",
  squareWebhookSignatureKey: "",
  emailSendProvider: "google",
  smtpHost: "",
  smtpPort: 587,
  smtpSecurity: "starttls",
  smtpUsername: "",
  smtpPassword: "",
  smtpFromEmail: "",
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  quickBooksCompanyId: "",
  quickBooksClientId: "",
  quickBooksClientSecret: "",
  quickBooksRedirectUri: "",
  quickBooksRefreshToken: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRedirectUri: "",
  googleRefreshToken: "",
  googleCalendarId: "",
  mapboxPublicToken: "",
  zellePayment: "",
  cashAppPayment: "",
  venmoPayment: "",
  paymentInstructions: "",
  paymentFollowUpHours: 48,
  estimateFollowUpEnabled: true,
  estimateFollowUpDelayHours: 24,
  estimateFollowUpSubject: "Following up on your estimate - {jobTitle} at {address}",
  estimateFollowUpBody: [
    "Hi {firstName},",
    "",
    "Just wanted to follow up on the estimate we sent for {jobTitle} at {address}.",
    "",
    "Your estimate of {estimateTotal} is still available for review. Let us know if you have any questions - we're happy to walk you through it.",
    "",
    "Thank you,",
    "{businessName}"
  ].join("\n"),
  dayOfServiceInstructions: "",
  onboardingCompleted: false,
  customTemplates: [],
  customServices: [],
  customServiceTypes: [],
  customPhotoSections: []
};

const statuses = [
  "Lead",
  "Estimate Sent",
  "Estimate Signed",
  "Contract Sent",
  "Contract Signed",
  "Deposit Sent",
  "Deposit Paid",
  "Scheduled",
  "Completed",
  "Final Invoice Sent",
  "Paid"
];

const ownerAccount = {
  id: "owner",
  name: "Owner Account",
  plan: "owner",
  status: "active",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

function seedJobs() {
  return [
    {
      id: crypto.randomUUID(),
      customerName: "Maria Johnson",
      email: "maria@example.com",
      phone: "(555) 123-4567",
      address: "214 Oak Ridge Dr",
      serviceType: "Driveway cleaning",
      leadSource: "referral",
      estimate: 475,
      depositPercent: 25,
      notes: "Oil stains near garage. Customer asked for Saturday availability.",
      accessNotes: "",
      sensitiveAreas: "",
      status: "Estimate Signed",
      scheduledAt: "",
      squareEstimateId: "",
      squareEstimateUrl: "",
      squareCustomerId: "",
      squareDepositOrderId: "",
      squareDepositInvoiceId: "",
      squareDepositInvoiceUrl: "",
      squareFinalOrderId: "",
      squareFinalInvoiceId: "",
      squareFinalInvoiceUrl: "",
      squareContractId: "",
      squareContractUrl: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ];
}

async function ensureDataFile() {
  if (usePostgres) {
    return;
  }

  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }

  if (!existsSync(JOBS_FILE)) {
    await writeJson(JOBS_FILE, seedJobs());
  }

  if (!existsSync(CUSTOMERS_FILE)) {
    await writeJson(CUSTOMERS_FILE, []);
  }

  if (!existsSync(EXPENSES_FILE)) {
    await writeJson(EXPENSES_FILE, []);
  }

  if (!existsSync(FOLLOW_UP_TASKS_FILE)) {
    await writeJson(FOLLOW_UP_TASKS_FILE, []);
  }

  if (!existsSync(USERS_FILE)) {
    await writeJson(USERS_FILE, []);
  }

  if (!existsSync(ACCOUNTS_FILE)) {
    await writeJson(ACCOUNTS_FILE, [ownerAccount]);
  }

  if (!existsSync(SETTINGS_FILE)) {
    await writeJson(SETTINGS_FILE, defaultSettings);
  }

  if (!existsSync(WEBHOOK_LOG_FILE)) {
    await writeJson(WEBHOOK_LOG_FILE, []);
  }

  await reconcileLocalAccounts();
}

async function readJson(file) {
  await ensureDataFile();
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonDirect(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function reconcileLocalAccounts() {
  const users = asArray(await readJsonDirect(USERS_FILE, []));
  const accounts = asArray(await readJsonDirect(ACCOUNTS_FILE, [ownerAccount]));
  const accountMap = new Map(accounts.map((account) => [account.id, normalizeAccount(account)]));

  accountMap.set(ownerAccount.id, normalizeAccount({ ...ownerAccount, ...(accountMap.get(ownerAccount.id) || {}) }));

  users.forEach((user) => {
    const accountId = user.accountId || user.id;
    if (!accountId || accountMap.has(accountId)) {
      return;
    }

    accountMap.set(accountId, normalizeAccount({
      id: accountId,
      name: user.name || user.email || "Tester Account",
      plan: user.role === "owner" ? "owner" : "tester",
      status: user.disabled ? "disabled" : "active",
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }));
  });

  if (accountMap.size !== accounts.length) {
    await writeJson(ACCOUNTS_FILE, [...accountMap.values()]);
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function writeJson(file, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  const temporaryFile = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const backupFile = `${file}.bak`;

  await writeFile(temporaryFile, contents);
  if (existsSync(file)) {
    await copyFile(file, backupFile);
  }
  await rename(temporaryFile, file);
}

async function syncPostgresItems(client, tableName, items, upsertItem, options = {}) {
  const ids = items.map((item) => item.id);
  const idType = options.idType || "uuid";
  if (options.accountId) {
    await client.query(
      `delete from ${tableName} where account_id = $1 and not (id = any($2::${idType}[]))`,
      [options.accountId, ids]
    );
  } else {
    await client.query(`delete from ${tableName} where not (id = any($1::${idType}[]))`, [ids]);
  }

  for (const item of items) {
    await upsertItem(client, item);
  }
}

async function readJobs(options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = options.accountId
      ? await getPool().query("select * from jobs where account_id = $1 order by created_at desc", [options.accountId])
      : await getPool().query("select * from jobs order by created_at desc");
    return result.rows.map(jobFromRow);
  }

  return readJson(JOBS_FILE);
}

async function writeJobs(jobs, options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await syncPostgresItems(client, "jobs", jobs, upsertJob, options);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeJson(JOBS_FILE, jobs);
}

async function readCustomers(options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = options.accountId
      ? await getPool().query("select * from customers where account_id = $1 order by updated_at desc", [options.accountId])
      : await getPool().query("select * from customers order by updated_at desc");
    return result.rows.map(customerFromRow);
  }

  return readJson(CUSTOMERS_FILE);
}

async function writeCustomers(customers, options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await syncPostgresItems(client, "customers", customers, upsertCustomer, options);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeJson(CUSTOMERS_FILE, customers);
}

async function readExpenses(options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = options.accountId
      ? await getPool().query("select * from expenses where account_id = $1 order by expense_date desc, created_at desc", [options.accountId])
      : await getPool().query("select * from expenses order by expense_date desc, created_at desc");
    return result.rows.map(expenseFromRow);
  }

  return readJson(EXPENSES_FILE);
}

async function writeExpenses(expenses, options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await syncPostgresItems(client, "expenses", expenses, upsertExpense, options);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeJson(EXPENSES_FILE, expenses);
}

async function readFollowUpTasks(options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = options.accountId
      ? await getPool().query("select * from follow_up_tasks where account_id = $1 order by scheduled_for asc", [options.accountId])
      : await getPool().query("select * from follow_up_tasks order by scheduled_for asc");
    return result.rows.map(followUpTaskFromRow);
  }

  const tasks = await readJson(FOLLOW_UP_TASKS_FILE);
  return options.accountId
    ? tasks.filter((task) => (task.accountId || "owner") === options.accountId)
    : tasks;
}

async function writeFollowUpTasks(tasks, options = {}) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      if (options.accountId) {
        await client.query("delete from follow_up_tasks where account_id = $1", [options.accountId]);
      } else {
        await client.query("delete from follow_up_tasks");
      }
      for (const task of tasks) {
        await upsertFollowUpTask(client, task);
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  if (options.accountId) {
    const allTasks = await readJson(FOLLOW_UP_TASKS_FILE);
    const otherTasks = allTasks.filter((task) => (task.accountId || "owner") !== options.accountId);
    await writeJson(FOLLOW_UP_TASKS_FILE, [...otherTasks, ...tasks.map((task) => ({ ...task, accountId: options.accountId }))]);
    return;
  }

  if (options.accountId) {
    const allTasks = await readJson(FOLLOW_UP_TASKS_FILE);
    const otherAccountTasks = allTasks.filter((task) => (task.accountId || "owner") !== options.accountId);
    await writeJson(FOLLOW_UP_TASKS_FILE, [
      ...tasks.map((task) => ({ ...task, accountId: options.accountId })),
      ...otherAccountTasks
    ]);
    return;
  }

  await writeJson(FOLLOW_UP_TASKS_FILE, tasks);
}

async function readUsers() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from app_users order by created_at asc");
    return result.rows.map(userFromRow);
  }

  return readJson(USERS_FILE);
}

async function writeUsers(users) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await syncPostgresItems(client, "app_users", users, upsertUser);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeJson(USERS_FILE, users);
}

async function readAccounts() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from accounts order by created_at asc");
    return result.rows.map(accountFromRow);
  }

  return readJson(ACCOUNTS_FILE);
}

async function writeAccounts(accounts) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await syncPostgresItems(client, "accounts", accounts, upsertAccount, { idType: "text" });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
    return;
  }

  await writeJson(ACCOUNTS_FILE, accounts);
}

async function readUserSettings(userId) {
  if (!userId || userId === "env-admin" || userId === "owner") {
    return readSettings();
  }

  const [ownerSettings, users] = await Promise.all([
    readSettings(),
    readUsers()
  ]);
  const user = findUserForSettings(users, userId);
  const settings = mergeUserSettingsWithPlatform(user?.settings || {}, ownerSettings);
  return settings;
}

function mergeUserSettingsWithPlatform(userSettings = {}, ownerSettings = {}) {
  const settings = { ...defaultSettings, ...userSettings };
  settings.googleClientId = settings.googleClientId || ownerSettings.googleClientId || "";
  settings.googleClientSecret = settings.googleClientSecret || ownerSettings.googleClientSecret || "";
  settings.googleRedirectUri = settings.googleRedirectUri || ownerSettings.googleRedirectUri || "";
  ["googleRefreshToken", "googleCalendarId"].forEach((key) => {
    if (settings[key] && settings[key] === ownerSettings[key]) {
      settings[key] = "";
    }
  });
  settings.mapboxPublicToken = settings.mapboxPublicToken ||
    ownerSettings.mapboxPublicToken ||
    process.env.MAPBOX_PUBLIC_TOKEN ||
    "";
  return settings;
}

async function writeUserSettings(userId, settings) {
  if (!userId || userId === "env-admin" || userId === "owner") {
    return writeSettings(settings);
  }

  const users = await readUsers();
  const user = findUserForSettings(users, userId);
  if (!user) {
    throw new Error("User account not found.");
  }

  user.settings = settings;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
}

function findUserForSettings(users, accountOrUserId) {
  return users.find((item) => item.id === accountOrUserId) ||
    users.find((item) => (item.accountId || item.id) === accountOrUserId);
}

async function readSettings() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from app_settings where id = 1");
    const rowSettings = result.rows[0] ? settingsFromRow(result.rows[0]) : defaultSettings;
    return applyRuntimeSettings(rowSettings);
  }

  return applyRuntimeSettings(await readJson(SETTINGS_FILE));
}

function applyRuntimeSettings(settings = {}) {
  const rowSettings = { ...defaultSettings, ...settings };
  return {
    ...defaultSettings,
    ...rowSettings,
    squareEnvironment: process.env.SQUARE_ENV || rowSettings.squareEnvironment || defaultSettings.squareEnvironment,
    squareAccessToken: process.env.SQUARE_ACCESS_TOKEN || rowSettings.squareAccessToken || "",
    squareLocationId: process.env.SQUARE_LOCATION_ID || rowSettings.squareLocationId || defaultSettings.squareLocationId,
    squareWebhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || rowSettings.squareWebhookSignatureKey || "",
    emailSendProvider: ["google", "smtp"].includes(rowSettings.emailSendProvider) ? rowSettings.emailSendProvider : "google",
    smtpHost: rowSettings.smtpHost || "",
    smtpPort: Number(rowSettings.smtpPort || 587),
    smtpSecurity: ["ssl", "starttls", "none"].includes(rowSettings.smtpSecurity) ? rowSettings.smtpSecurity : "starttls",
    smtpUsername: rowSettings.smtpUsername || "",
    smtpPassword: rowSettings.smtpPassword || "",
    smtpFromEmail: rowSettings.smtpFromEmail || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || rowSettings.stripeSecretKey || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || rowSettings.stripeWebhookSecret || "",
    quickBooksCompanyId: rowSettings.quickBooksCompanyId || "",
    quickBooksClientId: rowSettings.quickBooksClientId || "",
    quickBooksClientSecret: rowSettings.quickBooksClientSecret || "",
    quickBooksRedirectUri: rowSettings.quickBooksRedirectUri || "",
    quickBooksRefreshToken: rowSettings.quickBooksRefreshToken || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || rowSettings.googleClientId || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || rowSettings.googleClientSecret || "",
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || rowSettings.googleRedirectUri || defaultSettings.googleRedirectUri,
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || rowSettings.googleRefreshToken || "",
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || rowSettings.googleCalendarId || defaultSettings.googleCalendarId,
    mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN || rowSettings.mapboxPublicToken || "",
    zellePayment: rowSettings.zellePayment || "",
    cashAppPayment: rowSettings.cashAppPayment || "",
    venmoPayment: rowSettings.venmoPayment || "",
    paymentInstructions: rowSettings.paymentInstructions || "",
    paymentFollowUpHours: Number(rowSettings.paymentFollowUpHours ?? 48),
    estimateFollowUpEnabled: rowSettings.estimateFollowUpEnabled !== false,
    estimateFollowUpDelayHours: Number(rowSettings.estimateFollowUpDelayHours ?? 24),
    estimateFollowUpSubject: rowSettings.estimateFollowUpSubject || defaultSettings.estimateFollowUpSubject,
    estimateFollowUpBody: rowSettings.estimateFollowUpBody || defaultSettings.estimateFollowUpBody,
    dayOfServiceInstructions: rowSettings.dayOfServiceInstructions || "",
    serviceIndustry: rowSettings.serviceIndustry || "",
    defaultDepositEnabled: rowSettings.defaultDepositEnabled !== false,
    onboardingCompleted: Boolean(rowSettings.onboardingCompleted),
    businessLogoDataUrl: rowSettings.businessLogoDataUrl || "",
    customTemplates: Array.isArray(rowSettings.customTemplates) ? rowSettings.customTemplates : [],
    customServices: Array.isArray(rowSettings.customServices) ? rowSettings.customServices : [],
    customServiceTypes: Array.isArray(rowSettings.customServiceTypes) ? rowSettings.customServiceTypes : [],
    customPhotoSections: Array.isArray(rowSettings.customPhotoSections) ? rowSettings.customPhotoSections : []
  };
}

async function writeSettings(settings) {
  if (usePostgres) {
    await ensurePostgresSchema();
    await getPool().query(
      `insert into app_settings (
        id,
        business_name,
        business_email,
        business_phone,
        business_logo_data_url,
        default_deposit_percent,
        default_job_duration_minutes,
        final_invoice_timing,
        square_environment,
        square_access_token,
        square_location_id,
        square_webhook_signature_key,
        email_send_provider,
        smtp_host,
        smtp_port,
        smtp_security,
        smtp_username,
        smtp_password,
        smtp_from_email,
        stripe_secret_key,
        stripe_webhook_secret,
        quickbooks_company_id,
        quickbooks_client_id,
        quickbooks_client_secret,
        quickbooks_redirect_uri,
        quickbooks_refresh_token,
        google_refresh_token,
        google_calendar_id,
        mapbox_public_token,
        zelle_payment,
        cash_app_payment,
        venmo_payment,
        payment_instructions,
        payment_follow_up_hours,
        estimate_follow_up_enabled,
        estimate_follow_up_delay_hours,
        estimate_follow_up_subject,
        estimate_follow_up_body,
        day_of_service_instructions,
        onboarding_completed,
        custom_templates,
        custom_services,
        custom_service_types,
        custom_photo_sections,
        updated_at
      ) values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40::jsonb, $41::jsonb, $42::jsonb, $43::jsonb, now())
      on conflict (id) do update set
        business_name = excluded.business_name,
        business_email = excluded.business_email,
        business_phone = excluded.business_phone,
        business_logo_data_url = excluded.business_logo_data_url,
        default_deposit_percent = excluded.default_deposit_percent,
        default_job_duration_minutes = excluded.default_job_duration_minutes,
        final_invoice_timing = excluded.final_invoice_timing,
        square_environment = excluded.square_environment,
        square_access_token = excluded.square_access_token,
        square_location_id = excluded.square_location_id,
        square_webhook_signature_key = excluded.square_webhook_signature_key,
        email_send_provider = excluded.email_send_provider,
        smtp_host = excluded.smtp_host,
        smtp_port = excluded.smtp_port,
        smtp_security = excluded.smtp_security,
        smtp_username = excluded.smtp_username,
        smtp_password = excluded.smtp_password,
        smtp_from_email = excluded.smtp_from_email,
        stripe_secret_key = excluded.stripe_secret_key,
        stripe_webhook_secret = excluded.stripe_webhook_secret,
        quickbooks_company_id = excluded.quickbooks_company_id,
        quickbooks_client_id = excluded.quickbooks_client_id,
        quickbooks_client_secret = excluded.quickbooks_client_secret,
        quickbooks_redirect_uri = excluded.quickbooks_redirect_uri,
        quickbooks_refresh_token = excluded.quickbooks_refresh_token,
        google_refresh_token = excluded.google_refresh_token,
        google_calendar_id = excluded.google_calendar_id,
        mapbox_public_token = excluded.mapbox_public_token,
        zelle_payment = excluded.zelle_payment,
        cash_app_payment = excluded.cash_app_payment,
        venmo_payment = excluded.venmo_payment,
        payment_instructions = excluded.payment_instructions,
        payment_follow_up_hours = excluded.payment_follow_up_hours,
        estimate_follow_up_enabled = excluded.estimate_follow_up_enabled,
        estimate_follow_up_delay_hours = excluded.estimate_follow_up_delay_hours,
        estimate_follow_up_subject = excluded.estimate_follow_up_subject,
        estimate_follow_up_body = excluded.estimate_follow_up_body,
        day_of_service_instructions = excluded.day_of_service_instructions,
        onboarding_completed = excluded.onboarding_completed,
        custom_templates = excluded.custom_templates,
        custom_services = excluded.custom_services,
        custom_service_types = excluded.custom_service_types,
        custom_photo_sections = excluded.custom_photo_sections,
        updated_at = now()`,
      [
        settings.businessName || "",
        settings.businessEmail || "",
        settings.businessPhone || "",
        settings.businessLogoDataUrl || "",
        settings.defaultDepositPercent || 25,
        settings.defaultJobDurationMinutes || 180,
        settings.finalInvoiceTiming || "immediate_after_completion",
        settings.squareEnvironment || "sandbox",
        settings.squareAccessToken || "",
        settings.squareLocationId || "",
        settings.squareWebhookSignatureKey || "",
        settings.emailSendProvider || "google",
        settings.smtpHost || "",
        Number(settings.smtpPort || 587),
        settings.smtpSecurity || "starttls",
        settings.smtpUsername || "",
        settings.smtpPassword || "",
        settings.smtpFromEmail || "",
        settings.stripeSecretKey || "",
        settings.stripeWebhookSecret || "",
        settings.quickBooksCompanyId || "",
        settings.quickBooksClientId || "",
        settings.quickBooksClientSecret || "",
        settings.quickBooksRedirectUri || "",
        settings.quickBooksRefreshToken || "",
        settings.googleRefreshToken || "",
        settings.googleCalendarId || "",
        settings.mapboxPublicToken || "",
        settings.zellePayment || "",
        settings.cashAppPayment || "",
        settings.venmoPayment || "",
        settings.paymentInstructions || "",
        Number(settings.paymentFollowUpHours ?? 48),
        settings.estimateFollowUpEnabled !== false,
        Number(settings.estimateFollowUpDelayHours ?? 24),
        settings.estimateFollowUpSubject || defaultSettings.estimateFollowUpSubject,
        settings.estimateFollowUpBody || defaultSettings.estimateFollowUpBody,
        settings.dayOfServiceInstructions || "",
        Boolean(settings.onboardingCompleted),
        JSON.stringify(settings.customTemplates || []),
        JSON.stringify(settings.customServices || []),
        JSON.stringify(settings.customServiceTypes || []),
        JSON.stringify(settings.customPhotoSections || [])
      ]
    );
    return;
  }

  await writeJson(SETTINGS_FILE, settings);
}

async function readWebhookEvents() {
  if (usePostgres) {
    const result = await getPool().query("select * from webhook_events order by received_at desc limit 100");
    return result.rows.map((row) => ({
      provider: row.provider,
      eventId: row.event_id,
      type: row.event_type,
      status: row.status,
      result: row.result,
      receivedAt: row.received_at?.toISOString?.() || row.received_at
    }));
  }

  return readJson(WEBHOOK_LOG_FILE);
}

async function writeWebhookEvents(events) {
  if (usePostgres) {
    const latest = events.at(-1);
    if (!latest) return;
    await getPool().query(
      `insert into webhook_events (provider, event_id, event_type, status, result, received_at)
      values ($1, $2, $3, $4, $5, $6)`,
      [
        latest.provider || "",
        latest.eventId || latest.event_id || "",
        latest.type || "",
        latest.status || "",
        latest.result || {},
        latest.receivedAt || new Date().toISOString()
      ]
    );
    return;
  }

  await writeJson(WEBHOOK_LOG_FILE, events.slice(-100));
}

function getPool() {
  if (!pool) {
    const { Pool } = require("pg");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function ensurePostgresSchema() {
  if (postgresSchemaReady) return;
  await getPool().query(`create table if not exists accounts (
    id text primary key,
    name text not null default '',
    plan text not null default 'tester',
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query(
    `insert into accounts (id, name, plan, status, created_at, updated_at)
    values ($1, $2, $3, $4, $5, $6)
    on conflict (id) do nothing`,
    [
      ownerAccount.id,
      ownerAccount.name,
      ownerAccount.plan,
      ownerAccount.status,
      ownerAccount.createdAt,
      ownerAccount.updatedAt
    ]
  );
  await getPool().query(`create table if not exists file_assets (
    id uuid primary key default gen_random_uuid(),
    account_id text not null default 'owner',
    provider text not null default 'inline',
    owner_type text not null default '',
    owner_id text not null default '',
    purpose text not null default '',
    name text not null default '',
    mime_type text not null default '',
    byte_length integer not null default 0,
    content_hash text not null default '',
    storage_key text not null default '',
    data_url text not null default '',
    created_at timestamptz not null default now()
  )`);
  await getPool().query(`create table if not exists customers (
    id uuid primary key default gen_random_uuid(),
    account_id text not null default 'owner',
    customer_name text not null,
    email text not null default '',
    phone text not null default '',
    address text not null default '',
    street_address text not null default '',
    address_unit text not null default '',
    city text not null default '',
    state text not null default '',
    zip text not null default '',
    lead_source text not null default '',
    notes text not null default '',
    service_area_photos jsonb not null default '[]'::jsonb,
    property_measurements jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query(`create table if not exists expenses (
    id uuid primary key default gen_random_uuid(),
    account_id text not null default 'owner',
    vendor text not null default '',
    category text not null default '',
    amount numeric(10, 2) not null default 0,
    expense_date date not null default current_date,
    notes text not null default '',
    receipt_photos jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query(`create table if not exists app_users (
    id uuid primary key default gen_random_uuid(),
    account_id text not null default '',
    name text not null default '',
    email text not null unique,
    password_hash text not null default '',
    role text not null default 'tester',
    disabled boolean not null default false,
    settings jsonb not null default '{}'::jsonb,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query(`create table if not exists app_settings (
    id integer primary key,
    business_name text not null default '',
    business_email text not null default '',
    business_phone text not null default '',
    business_logo_data_url text not null default '',
    default_deposit_percent numeric not null default 25,
    default_job_duration_minutes integer not null default 180,
    final_invoice_timing text not null default 'immediate_after_completion',
    square_environment text not null default 'sandbox',
    square_access_token text not null default '',
    square_location_id text not null default '',
    square_webhook_signature_key text not null default '',
    email_send_provider text not null default 'google',
    smtp_host text not null default '',
    smtp_port integer not null default 587,
    smtp_security text not null default 'starttls',
    smtp_username text not null default '',
    smtp_password text not null default '',
    smtp_from_email text not null default '',
    stripe_secret_key text not null default '',
    stripe_webhook_secret text not null default '',
    quickbooks_company_id text not null default '',
    quickbooks_client_id text not null default '',
    quickbooks_client_secret text not null default '',
    quickbooks_redirect_uri text not null default '',
    quickbooks_refresh_token text not null default '',
    google_refresh_token text not null default '',
    google_calendar_id text not null default '',
    mapbox_public_token text not null default '',
    zelle_payment text not null default '',
    cash_app_payment text not null default '',
    venmo_payment text not null default '',
    payment_instructions text not null default '',
    payment_follow_up_hours integer not null default 48,
    estimate_follow_up_enabled boolean not null default true,
    estimate_follow_up_delay_hours integer not null default 24,
    estimate_follow_up_subject text not null default '',
    estimate_follow_up_body text not null default '',
    day_of_service_instructions text not null default '',
    onboarding_completed boolean not null default false,
    custom_templates jsonb not null default '[]'::jsonb,
    custom_services jsonb not null default '[]'::jsonb,
    custom_service_types jsonb not null default '[]'::jsonb,
    custom_photo_sections jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  )`);
  await getPool().query("alter table app_settings add column if not exists google_refresh_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists business_logo_data_url text not null default ''");
  await getPool().query("alter table app_settings add column if not exists square_access_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists square_webhook_signature_key text not null default ''");
  await getPool().query("alter table app_settings add column if not exists email_send_provider text not null default 'google'");
  await getPool().query("alter table app_settings add column if not exists smtp_host text not null default ''");
  await getPool().query("alter table app_settings add column if not exists smtp_port integer not null default 587");
  await getPool().query("alter table app_settings add column if not exists smtp_security text not null default 'starttls'");
  await getPool().query("alter table app_settings add column if not exists smtp_username text not null default ''");
  await getPool().query("alter table app_settings add column if not exists smtp_password text not null default ''");
  await getPool().query("alter table app_settings add column if not exists smtp_from_email text not null default ''");
  await getPool().query("alter table app_settings add column if not exists stripe_secret_key text not null default ''");
  await getPool().query("alter table app_settings add column if not exists stripe_webhook_secret text not null default ''");
  await getPool().query("alter table app_settings add column if not exists quickbooks_company_id text not null default ''");
  await getPool().query("alter table app_settings add column if not exists quickbooks_client_id text not null default ''");
  await getPool().query("alter table app_settings add column if not exists quickbooks_client_secret text not null default ''");
  await getPool().query("alter table app_settings add column if not exists quickbooks_redirect_uri text not null default ''");
  await getPool().query("alter table app_settings add column if not exists quickbooks_refresh_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists mapbox_public_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists zelle_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists cash_app_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists venmo_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists payment_instructions text not null default ''");
  await getPool().query("alter table app_settings add column if not exists payment_follow_up_hours integer not null default 48");
  await getPool().query("alter table app_settings add column if not exists estimate_follow_up_enabled boolean not null default true");
  await getPool().query("alter table app_settings add column if not exists estimate_follow_up_delay_hours integer not null default 24");
  await getPool().query("alter table app_settings add column if not exists estimate_follow_up_subject text not null default ''");
  await getPool().query("alter table app_settings add column if not exists estimate_follow_up_body text not null default ''");
  await getPool().query("alter table app_settings add column if not exists day_of_service_instructions text not null default ''");
  await getPool().query("alter table app_settings add column if not exists onboarding_completed boolean not null default false");
  await getPool().query("alter table app_settings add column if not exists custom_templates jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_settings add column if not exists custom_services jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_settings add column if not exists custom_service_types jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_settings add column if not exists custom_photo_sections jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_users add column if not exists account_id text not null default ''");
  await getPool().query("update app_users set account_id = id::text where account_id = ''");
  await getPool().query(`
    insert into accounts (id, name, plan, status, created_at, updated_at)
    select distinct on (account_id)
      account_id,
      coalesce(nullif(name, ''), nullif(email, ''), account_id),
      case when role = 'owner' then 'owner' else 'tester' end,
      case when disabled then 'disabled' else 'active' end,
      created_at,
      updated_at
    from app_users
    where account_id <> ''
    on conflict (id) do nothing
  `);
  await getPool().query("alter table app_users add column if not exists settings jsonb not null default '{}'::jsonb");
  await getPool().query("alter table customers add column if not exists account_id text not null default 'owner'");
  await getPool().query("alter table expenses add column if not exists account_id text not null default 'owner'");
  await getPool().query("alter table expenses add column if not exists job_id uuid");
  await getPool().query("alter table jobs add column if not exists account_id text not null default 'owner'");
  await getPool().query(`
    do $$
    begin
      if not exists (
        select 1
        from pg_constraint constraint_info
        join pg_attribute column_info
          on column_info.attrelid = constraint_info.conrelid
          and column_info.attnum = any(constraint_info.conkey)
        where constraint_info.contype = 'f'
          and constraint_info.conrelid = 'expenses'::regclass
          and constraint_info.confrelid = 'jobs'::regclass
          and column_info.attname = 'job_id'
      ) then
        alter table expenses
          add constraint expenses_job_id_fkey
          foreign key (job_id)
          references jobs(id)
          on delete set null;
      end if;
    end $$;
  `);
  await getPool().query("alter table customers add column if not exists lead_source text not null default ''");
  await getPool().query("alter table customers add column if not exists property_measurements jsonb not null default '[]'::jsonb");
  await getPool().query("alter table customers add column if not exists street_address text not null default ''");
  await getPool().query("alter table customers add column if not exists address_unit text not null default ''");
  await getPool().query("alter table customers add column if not exists city text not null default ''");
  await getPool().query("alter table customers add column if not exists state text not null default ''");
  await getPool().query("alter table customers add column if not exists zip text not null default ''");
  await getPool().query("alter table jobs add column if not exists customer_id text not null default ''");
  await getPool().query("alter table jobs add column if not exists street_address text not null default ''");
  await getPool().query("alter table jobs add column if not exists address_unit text not null default ''");
  await getPool().query("alter table jobs add column if not exists city text not null default ''");
  await getPool().query("alter table jobs add column if not exists state text not null default ''");
  await getPool().query("alter table jobs add column if not exists zip text not null default ''");
  await getPool().query("alter table jobs add column if not exists lead_source text not null default ''");
  await getPool().query("alter table jobs add column if not exists job_photos jsonb not null default '{}'::jsonb");
  await getPool().query("alter table jobs add column if not exists completion_proof_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists completion_proof_url text not null default ''");
  await getPool().query("alter table jobs add column if not exists line_items jsonb not null default '[]'::jsonb");
  await getPool().query("alter table jobs add column if not exists measurement jsonb not null default '{}'::jsonb");
  await getPool().query("alter table jobs add column if not exists estimate_discount_percent numeric not null default 0");
  await getPool().query("alter table jobs add column if not exists estimate_approval_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists estimate_approval_url text not null default ''");
  await getPool().query("alter table jobs add column if not exists estimate_mailto text not null default ''");
  await getPool().query("alter table jobs add column if not exists estimate_sent_at timestamptz");
  await getPool().query("alter table jobs add column if not exists estimate_approved_at timestamptz");
  await getPool().query("alter table jobs add column if not exists estimate_rejected_at timestamptz");
  await getPool().query("alter table jobs add column if not exists estimate_rejection_reason text not null default ''");
  await getPool().query("alter table jobs add column if not exists estimate_rejection_note text not null default ''");
  await getPool().query("alter table jobs add column if not exists scheduled_event_at timestamptz");
  await getPool().query("alter table jobs add column if not exists payment_records jsonb not null default '[]'::jsonb");
  await getPool().query("alter table jobs add column if not exists suppress_estimate_follow_up boolean not null default false");
  await getPool().query("alter table jobs add column if not exists contract_approval_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_approval_url text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_mailto text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_sent_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_date text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_signer_name text not null default ''");
  await getPool().query("create index if not exists idx_jobs_account_created_at on jobs(account_id, created_at desc)");
  await getPool().query("create index if not exists idx_customers_account_updated_at on customers(account_id, updated_at desc)");
  await getPool().query("create index if not exists idx_expenses_account_expense_date on expenses(account_id, expense_date desc, created_at desc)");
  await getPool().query("create index if not exists idx_file_assets_account_owner on file_assets(account_id, owner_type, owner_id)");
  await getPool().query("create index if not exists idx_file_assets_content_hash on file_assets(content_hash)");
  await getPool().query(`create table if not exists follow_up_tasks (
    id text primary key,
    account_id text not null default 'owner',
    job_id text not null,
    type text not null default 'estimate_followup',
    source text not null default 'auto',
    scheduled_for timestamptz not null,
    status text not null default 'pending',
    cancelled_reason text not null default '',
    sent_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query("alter table follow_up_tasks add column if not exists source text not null default 'auto'");
  await getPool().query("create index if not exists idx_follow_up_tasks_account_status_scheduled on follow_up_tasks(account_id, status, scheduled_for)");
  postgresSchemaReady = true;
}

async function upsertUser(client, user) {
  await client.query(
    `insert into app_users (
      id,
      account_id,
      name,
      email,
      password_hash,
      role,
      disabled,
      settings,
      last_login_at,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
    on conflict (id) do update set
      account_id = excluded.account_id,
      name = excluded.name,
      email = excluded.email,
      password_hash = excluded.password_hash,
      role = excluded.role,
      disabled = excluded.disabled,
      settings = excluded.settings,
      last_login_at = excluded.last_login_at,
      updated_at = excluded.updated_at`,
    [
      user.id,
      user.accountId || user.id,
      user.name || "",
      user.email || "",
      user.passwordHash || "",
      user.role || "tester",
      Boolean(user.disabled),
      JSON.stringify(user.settings || {}),
      user.lastLoginAt || null,
      user.createdAt || new Date().toISOString(),
      user.updatedAt || new Date().toISOString()
    ]
  );
}

async function upsertAccount(client, account) {
  const normalized = normalizeAccount(account);
  await client.query(
    `insert into accounts (
      id,
      name,
      plan,
      status,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6)
    on conflict (id) do update set
      name = excluded.name,
      plan = excluded.plan,
      status = excluded.status,
      updated_at = excluded.updated_at`,
    [
      normalized.id,
      normalized.name,
      normalized.plan,
      normalized.status,
      normalized.createdAt,
      normalized.updatedAt
    ]
  );
}

function normalizeAccount(account = {}) {
  const id = String(account.id || "").trim();
  return {
    id,
    name: String(account.name || id || "Account").trim(),
    plan: String(account.plan || "tester").trim(),
    status: ["active", "disabled"].includes(account.status) ? account.status : "active",
    createdAt: account.createdAt || new Date().toISOString(),
    updatedAt: account.updatedAt || new Date().toISOString()
  };
}

function accountFromRow(row) {
  return {
    id: row.id,
    name: row.name || "",
    plan: row.plan || "tester",
    status: row.status || "active",
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

function userFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id || row.id,
    name: row.name || "",
    email: row.email || "",
    passwordHash: row.password_hash || "",
    role: row.role || "tester",
    disabled: Boolean(row.disabled),
    settings: row.settings && typeof row.settings === "object" ? row.settings : {},
    lastLoginAt: row.last_login_at?.toISOString?.() || "",
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

async function upsertJob(client, job) {
  await client.query(
    `insert into jobs (
      id,
      customer_id,
      customer_name,
      email,
      phone,
      address,
      service_type,
      lead_source,
      estimate,
      deposit_percent,
      status,
      scheduled_at,
      job_duration_minutes,
      notes,
      access_notes,
      sensitive_areas,
      square_estimate_id,
      square_estimate_url,
      square_customer_id,
      square_contract_id,
      square_contract_url,
      square_deposit_order_id,
      square_deposit_invoice_id,
      square_deposit_invoice_url,
      square_deposit_invoice_status,
      square_deposit_paid_at,
      square_final_order_id,
      square_final_invoice_id,
      square_final_invoice_url,
      square_final_invoice_status,
      square_final_paid_at,
      google_calendar_event_id,
      google_calendar_event_url,
      completion_notice_sent_at,
      completion_notice_subject,
      completion_notice_body,
      completion_notice_mailto,
      completion_proof_token,
      completion_proof_url,
      created_at,
      updated_at
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, nullif($12, '')::timestamptz,
      $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25,
      nullif($26, '')::timestamptz, $27, $28, $29, $30, nullif($31, '')::timestamptz,
      $32, $33, nullif($34, '')::timestamptz, $35, $36, $37, $38, $39, $40, $41
    )
    on conflict (id) do update set
      customer_id = excluded.customer_id,
      customer_name = excluded.customer_name,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      service_type = excluded.service_type,
      lead_source = excluded.lead_source,
      estimate = excluded.estimate,
      deposit_percent = excluded.deposit_percent,
      status = excluded.status,
      scheduled_at = excluded.scheduled_at,
      job_duration_minutes = excluded.job_duration_minutes,
      notes = excluded.notes,
      access_notes = excluded.access_notes,
      sensitive_areas = excluded.sensitive_areas,
      square_estimate_id = excluded.square_estimate_id,
      square_estimate_url = excluded.square_estimate_url,
      square_customer_id = excluded.square_customer_id,
      square_contract_id = excluded.square_contract_id,
      square_contract_url = excluded.square_contract_url,
      square_deposit_order_id = excluded.square_deposit_order_id,
      square_deposit_invoice_id = excluded.square_deposit_invoice_id,
      square_deposit_invoice_url = excluded.square_deposit_invoice_url,
      square_deposit_invoice_status = excluded.square_deposit_invoice_status,
      square_deposit_paid_at = excluded.square_deposit_paid_at,
      square_final_order_id = excluded.square_final_order_id,
      square_final_invoice_id = excluded.square_final_invoice_id,
      square_final_invoice_url = excluded.square_final_invoice_url,
      square_final_invoice_status = excluded.square_final_invoice_status,
      square_final_paid_at = excluded.square_final_paid_at,
      google_calendar_event_id = excluded.google_calendar_event_id,
      google_calendar_event_url = excluded.google_calendar_event_url,
      completion_notice_sent_at = excluded.completion_notice_sent_at,
      completion_notice_subject = excluded.completion_notice_subject,
      completion_notice_body = excluded.completion_notice_body,
      completion_notice_mailto = excluded.completion_notice_mailto,
      completion_proof_token = excluded.completion_proof_token,
      completion_proof_url = excluded.completion_proof_url,
      updated_at = excluded.updated_at`,
    [
      job.id,
      job.customerId || "",
      job.customerName,
      job.email,
      job.phone,
      job.address,
      job.serviceType,
      job.leadSource || "",
      Number(job.estimate || 0),
      Number(job.depositPercent || 25),
      job.status || "Lead",
      job.scheduledAt || "",
      Number(job.jobDurationMinutes || 180),
      job.notes || "",
      job.accessNotes || "",
      job.sensitiveAreas || "",
      job.squareEstimateId || "",
      job.squareEstimateUrl || "",
      job.squareCustomerId || "",
      job.squareContractId || "",
      job.squareContractUrl || "",
      job.squareDepositOrderId || "",
      job.squareDepositInvoiceId || "",
      job.squareDepositInvoiceUrl || "",
      job.squareDepositInvoiceStatus || "",
      job.squareDepositPaidAt || "",
      job.squareFinalOrderId || "",
      job.squareFinalInvoiceId || "",
      job.squareFinalInvoiceUrl || "",
      job.squareFinalInvoiceStatus || "",
      job.squareFinalPaidAt || "",
      job.googleCalendarEventId || "",
      job.googleCalendarEventUrl || "",
      job.completionNoticeSentAt || "",
      job.completionNoticeSubject || "",
      job.completionNoticeBody || "",
      job.completionNoticeMailto || "",
      job.completionProofToken || "",
      job.completionProofUrl || "",
      job.createdAt || new Date().toISOString(),
      job.updatedAt || new Date().toISOString()
    ]
  );
  await client.query(
    `update jobs set
      line_items = $1::jsonb,
      estimate_discount_percent = $2,
      measurement = $3::jsonb,
      job_photos = $4::jsonb,
      estimate_approval_token = $5,
      estimate_approval_url = $6,
      estimate_mailto = $7,
      estimate_sent_at = nullif($8, '')::timestamptz,
      estimate_approved_at = nullif($9, '')::timestamptz,
      estimate_rejected_at = nullif($10, '')::timestamptz,
      estimate_rejection_reason = $11,
      estimate_rejection_note = $12,
      contract_approval_token = $13,
      contract_approval_url = $14,
      contract_mailto = $15,
      contract_sent_at = nullif($16, '')::timestamptz,
      contract_signed_at = nullif($17, '')::timestamptz,
      contract_signed_date = $18,
      contract_signer_name = $19,
      scheduled_event_at = nullif($20, '')::timestamptz,
      street_address = $21,
      address_unit = $22,
      city = $23,
      state = $24,
      zip = $25,
      account_id = $26,
      payment_records = $27::jsonb,
      suppress_estimate_follow_up = $28
    where id = $29`,
    [
      JSON.stringify(job.lineItems || []),
      Number(job.discountPercent || 0),
      JSON.stringify(job.measurement || {}),
      JSON.stringify(job.jobPhotos || {}),
      job.estimateApprovalToken || "",
      job.estimateApprovalUrl || "",
      job.estimateMailto || "",
      job.estimateSentAt || "",
      job.estimateApprovedAt || "",
      job.estimateRejectedAt || "",
      job.estimateRejectionReason || "",
      job.estimateRejectionNote || "",
      job.contractApprovalToken || "",
      job.contractApprovalUrl || "",
      job.contractMailto || "",
      job.contractSentAt || "",
      job.contractSignedAt || "",
      job.contractSignedDate || "",
      job.contractSignerName || "",
      job.scheduledEventAt || "",
      job.streetAddress || "",
      job.addressUnit || "",
      job.city || "",
      job.state || "",
      job.zip || "",
      job.accountId || "owner",
      JSON.stringify(job.paymentRecords || []),
      Boolean(job.suppressEstimateFollowUp),
      job.id
    ]
  );
}

function jobFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id || "owner",
    customerId: row.customer_id || "",
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    streetAddress: row.street_address || "",
    addressUnit: row.address_unit || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    serviceType: row.service_type,
    estimate: Number(row.estimate || 0),
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    measurement: row.measurement && typeof row.measurement === "object" ? row.measurement : {},
    jobPhotos: row.job_photos && typeof row.job_photos === "object" ? row.job_photos : {},
    discountPercent: Number(row.estimate_discount_percent || 0),
    estimateApprovalToken: row.estimate_approval_token || "",
    estimateApprovalUrl: row.estimate_approval_url || "",
    estimateMailto: row.estimate_mailto || "",
    estimateSentAt: row.estimate_sent_at?.toISOString?.() || "",
    estimateApprovedAt: row.estimate_approved_at?.toISOString?.() || "",
    estimateRejectedAt: row.estimate_rejected_at?.toISOString?.() || "",
    estimateRejectionReason: row.estimate_rejection_reason || "",
    estimateRejectionNote: row.estimate_rejection_note || "",
    contractApprovalToken: row.contract_approval_token || "",
    contractApprovalUrl: row.contract_approval_url || "",
    contractMailto: row.contract_mailto || "",
    contractSentAt: row.contract_sent_at?.toISOString?.() || "",
    contractSignedAt: row.contract_signed_at?.toISOString?.() || "",
    contractSignedDate: row.contract_signed_date || "",
    contractSignerName: row.contract_signer_name || "",
    depositPercent: Number(row.deposit_percent || 25),
    status: row.status,
    scheduledAt: row.scheduled_at ? toLocalInputValue(row.scheduled_at) : "",
    scheduledEventAt: row.scheduled_event_at?.toISOString?.() || "",
      jobDurationMinutes: Number(row.job_duration_minutes || 180),
    leadSource: row.lead_source || "",
    notes: row.notes || "",
    accessNotes: row.access_notes || "",
    sensitiveAreas: row.sensitive_areas || "",
    squareEstimateId: row.square_estimate_id || "",
    squareEstimateUrl: row.square_estimate_url || "",
    squareCustomerId: row.square_customer_id || "",
    squareContractId: row.square_contract_id || "",
    squareContractUrl: row.square_contract_url || "",
    squareDepositOrderId: row.square_deposit_order_id || "",
    squareDepositInvoiceId: row.square_deposit_invoice_id || "",
    squareDepositInvoiceUrl: row.square_deposit_invoice_url || "",
    squareDepositInvoiceStatus: row.square_deposit_invoice_status || "",
    squareDepositPaidAt: row.square_deposit_paid_at?.toISOString?.() || "",
    squareFinalOrderId: row.square_final_order_id || "",
    squareFinalInvoiceId: row.square_final_invoice_id || "",
    squareFinalInvoiceUrl: row.square_final_invoice_url || "",
    squareFinalInvoiceStatus: row.square_final_invoice_status || "",
    squareFinalPaidAt: row.square_final_paid_at?.toISOString?.() || "",
    paymentRecords: Array.isArray(row.payment_records) ? row.payment_records : [],
    suppressEstimateFollowUp: Boolean(row.suppress_estimate_follow_up),
    googleCalendarEventId: row.google_calendar_event_id || "",
    googleCalendarEventUrl: row.google_calendar_event_url || "",
    completionNoticeSentAt: row.completion_notice_sent_at?.toISOString?.() || "",
    completionNoticeSubject: row.completion_notice_subject || "",
    completionNoticeBody: row.completion_notice_body || "",
    completionNoticeMailto: row.completion_notice_mailto || "",
    completionProofToken: row.completion_proof_token || "",
    completionProofUrl: row.completion_proof_url || "",
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

async function upsertCustomer(client, customer) {
  await client.query(
    `insert into customers (
      id,
      customer_name,
      email,
      phone,
      address,
      street_address,
      address_unit,
      city,
      state,
      zip,
      lead_source,
      notes,
      service_area_photos,
      property_measurements,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15, $16)
    on conflict (id) do update set
      customer_name = excluded.customer_name,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      street_address = excluded.street_address,
      address_unit = excluded.address_unit,
      city = excluded.city,
      state = excluded.state,
      zip = excluded.zip,
      lead_source = excluded.lead_source,
      notes = excluded.notes,
      service_area_photos = excluded.service_area_photos,
      property_measurements = excluded.property_measurements,
      updated_at = excluded.updated_at`,
    [
      customer.id,
      customer.customerName || "",
      customer.email || "",
      customer.phone || "",
      customer.address || "",
      customer.streetAddress || "",
      customer.addressUnit || "",
      customer.city || "",
      customer.state || "",
      customer.zip || "",
      customer.leadSource || "",
      customer.notes || "",
      JSON.stringify(customer.serviceAreaPhotos || []),
      JSON.stringify(customer.propertyMeasurements || []),
      customer.createdAt || new Date().toISOString(),
      customer.updatedAt || new Date().toISOString()
    ]
  );
  await client.query("update customers set account_id = $1 where id = $2", [customer.accountId || "owner", customer.id]);
}

function customerFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id || "owner",
    customerName: row.customer_name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    streetAddress: row.street_address || "",
    addressUnit: row.address_unit || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip || "",
    leadSource: row.lead_source || "",
    notes: row.notes || "",
    serviceAreaPhotos: Array.isArray(row.service_area_photos) ? row.service_area_photos : [],
    propertyMeasurements: Array.isArray(row.property_measurements) ? row.property_measurements : [],
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

function settingsFromRow(row) {
  return {
    businessName: row.business_name || "",
    businessEmail: row.business_email || "",
    businessPhone: row.business_phone || "",
    businessLogoDataUrl: row.business_logo_data_url || "",
    defaultDepositPercent: Number(row.default_deposit_percent || 25),
    defaultJobDurationMinutes: Number(row.default_job_duration_minutes || 180),
    finalInvoiceTiming: row.final_invoice_timing || "immediate_after_completion",
    squareEnvironment: row.square_environment || "sandbox",
    squareAccessToken: row.square_access_token || "",
    squareLocationId: row.square_location_id || "",
    squareWebhookSignatureKey: row.square_webhook_signature_key || "",
    emailSendProvider: row.email_send_provider || "google",
    smtpHost: row.smtp_host || "",
    smtpPort: Number(row.smtp_port || 587),
    smtpSecurity: row.smtp_security || "starttls",
    smtpUsername: row.smtp_username || "",
    smtpPassword: row.smtp_password || "",
    smtpFromEmail: row.smtp_from_email || "",
    stripeSecretKey: row.stripe_secret_key || "",
    stripeWebhookSecret: row.stripe_webhook_secret || "",
    quickBooksCompanyId: row.quickbooks_company_id || "",
    quickBooksClientId: row.quickbooks_client_id || "",
    quickBooksClientSecret: row.quickbooks_client_secret || "",
    quickBooksRedirectUri: row.quickbooks_redirect_uri || "",
    quickBooksRefreshToken: row.quickbooks_refresh_token || "",
    googleRefreshToken: row.google_refresh_token || "",
    googleCalendarId: row.google_calendar_id || "",
    mapboxPublicToken: row.mapbox_public_token || "",
    zellePayment: row.zelle_payment || "",
    cashAppPayment: row.cash_app_payment || "",
    venmoPayment: row.venmo_payment || "",
    paymentInstructions: row.payment_instructions || "",
    paymentFollowUpHours: Number(row.payment_follow_up_hours ?? 48),
    estimateFollowUpEnabled: row.estimate_follow_up_enabled !== false,
    estimateFollowUpDelayHours: Number(row.estimate_follow_up_delay_hours ?? 24),
    estimateFollowUpSubject: row.estimate_follow_up_subject || defaultSettings.estimateFollowUpSubject,
    estimateFollowUpBody: row.estimate_follow_up_body || defaultSettings.estimateFollowUpBody,
    dayOfServiceInstructions: row.day_of_service_instructions || "",
    onboardingCompleted: Boolean(row.onboarding_completed),
    customTemplates: Array.isArray(row.custom_templates) ? row.custom_templates : [],
    customServices: Array.isArray(row.custom_services) ? row.custom_services : [],
    customServiceTypes: Array.isArray(row.custom_service_types) ? row.custom_service_types : [],
    customPhotoSections: Array.isArray(row.custom_photo_sections) ? row.custom_photo_sections : []
  };
}

async function upsertExpense(client, expense) {
  await client.query(
    `insert into expenses (
      id, job_id, vendor, category, amount, expense_date, notes, receipt_photos, created_at, updated_at
    ) values ($1, nullif($2, '')::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
    on conflict (id) do update set
      job_id = excluded.job_id,
      vendor = excluded.vendor,
      category = excluded.category,
      amount = excluded.amount,
      expense_date = excluded.expense_date,
      notes = excluded.notes,
      receipt_photos = excluded.receipt_photos,
      updated_at = excluded.updated_at`,
    [
      expense.id,
      expense.jobId || "",
      expense.vendor || "",
      expense.category || "",
      Number(expense.amount || 0),
      expense.expenseDate || new Date().toISOString().slice(0, 10),
      expense.notes || "",
      JSON.stringify(expense.receiptPhotos || []),
      expense.createdAt || new Date().toISOString(),
      expense.updatedAt || new Date().toISOString()
    ]
  );
  await client.query("update expenses set account_id = $1 where id = $2", [expense.accountId || "owner", expense.id]);
}

function expenseFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id || "owner",
    jobId: row.job_id || "",
    vendor: row.vendor || "",
    category: row.category || "",
    amount: Number(row.amount || 0),
    expenseDate: row.expense_date?.toISOString?.().slice(0, 10) || row.expense_date || "",
    notes: row.notes || "",
    receiptPhotos: Array.isArray(row.receipt_photos) ? row.receipt_photos : [],
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

async function upsertFollowUpTask(client, task) {
  await client.query(
    `insert into follow_up_tasks (
      id, account_id, job_id, type, source, scheduled_for, status, cancelled_reason, sent_at, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, nullif($9, '')::timestamptz, $10::timestamptz, $11::timestamptz)
    on conflict (id) do update set
      account_id = excluded.account_id,
      job_id = excluded.job_id,
      type = excluded.type,
      source = excluded.source,
      scheduled_for = excluded.scheduled_for,
      status = excluded.status,
      cancelled_reason = excluded.cancelled_reason,
      sent_at = excluded.sent_at,
      updated_at = excluded.updated_at`,
    [
      task.id,
      task.accountId || "owner",
      task.jobId,
      task.type || "estimate_followup",
      task.source || "auto",
      task.scheduledFor,
      task.status || "pending",
      task.cancelledReason || "",
      task.sentAt || "",
      task.createdAt || new Date().toISOString(),
      task.updatedAt || new Date().toISOString()
    ]
  );
}

function followUpTaskFromRow(row) {
  return {
    id: row.id,
    accountId: row.account_id || "owner",
    jobId: row.job_id || "",
    type: row.type || "estimate_followup",
    source: row.source || "auto",
    scheduledFor: row.scheduled_for?.toISOString?.() || "",
    status: row.status || "pending",
    cancelledReason: row.cancelled_reason || "",
    sentAt: row.sent_at?.toISOString?.() || "",
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

function toLocalInputValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

module.exports = {
  defaultSettings,
  statuses,
  ensureDataFile,
  readJobs,
  writeJobs,
  readCustomers,
  writeCustomers,
  readExpenses,
  writeExpenses,
  readFollowUpTasks,
  writeFollowUpTasks,
  readAccounts,
  writeAccounts,
  readUsers,
  writeUsers,
  mergeUserSettingsWithPlatform,
  readUserSettings,
  writeUserSettings,
  readSettings,
  writeSettings,
  readWebhookEvents,
  writeWebhookEvents
};
