const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const EXPENSES_FILE = path.join(DATA_DIR, "expenses.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.local.json");
const WEBHOOK_LOG_FILE = path.join(DATA_DIR, "webhook-events.json");
const usePostgres = Boolean(process.env.DATABASE_URL);
let pool;
let postgresSchemaReady = false;

const defaultSettings = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  businessLogoDataUrl: "",
  defaultDepositPercent: 25,
  defaultJobDurationMinutes: 180,
  finalInvoiceTiming: "immediate_after_completion",
  squareEnvironment: "sandbox",
  squareAccessToken: "",
  squareLocationId: "",
  squareWebhookSignatureKey: "",
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
  customTemplates: [],
  customServices: []
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

  if (!existsSync(USERS_FILE)) {
    await writeJson(USERS_FILE, []);
  }

  if (!existsSync(SETTINGS_FILE)) {
    await writeJson(SETTINGS_FILE, defaultSettings);
  }

  if (!existsSync(WEBHOOK_LOG_FILE)) {
    await writeJson(WEBHOOK_LOG_FILE, []);
  }
}

async function readJson(file) {
  await ensureDataFile();
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJobs() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from jobs order by created_at desc");
    return result.rows.map(jobFromRow);
  }

  return readJson(JOBS_FILE);
}

async function writeJobs(jobs) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("delete from jobs");
      for (const job of jobs) {
        await upsertJob(client, job);
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

  await writeJson(JOBS_FILE, jobs);
}

async function readCustomers() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from customers order by updated_at desc");
    return result.rows.map(customerFromRow);
  }

  return readJson(CUSTOMERS_FILE);
}

async function writeCustomers(customers) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("delete from customers");
      for (const customer of customers) {
        await upsertCustomer(client, customer);
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

  await writeJson(CUSTOMERS_FILE, customers);
}

async function readExpenses() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from expenses order by expense_date desc, created_at desc");
    return result.rows.map(expenseFromRow);
  }

  return readJson(EXPENSES_FILE);
}

async function writeExpenses(expenses) {
  if (usePostgres) {
    await ensurePostgresSchema();
    const client = await getPool().connect();
    try {
      await client.query("begin");
      await client.query("delete from expenses");
      for (const expense of expenses) {
        await upsertExpense(client, expense);
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

  await writeJson(EXPENSES_FILE, expenses);
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
      await client.query("delete from app_users");
      for (const user of users) {
        await upsertUser(client, user);
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

  await writeJson(USERS_FILE, users);
}

async function readUserSettings(userId) {
  if (!userId || userId === "env-admin") {
    return readSettings();
  }

  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  return { ...defaultSettings, ...(user?.settings || {}) };
}

async function writeUserSettings(userId, settings) {
  if (!userId || userId === "env-admin") {
    return writeSettings(settings);
  }

  const users = await readUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) {
    throw new Error("User account not found.");
  }

  user.settings = settings;
  user.updatedAt = new Date().toISOString();
  await writeUsers(users);
}

async function readSettings() {
  if (usePostgres) {
    await ensurePostgresSchema();
    const result = await getPool().query("select * from app_settings where id = 1");
    const rowSettings = result.rows[0] ? settingsFromRow(result.rows[0]) : defaultSettings;
    return {
      ...defaultSettings,
      ...rowSettings,
      squareEnvironment: process.env.SQUARE_ENV || rowSettings.squareEnvironment || defaultSettings.squareEnvironment,
      squareAccessToken: process.env.SQUARE_ACCESS_TOKEN || "",
      squareLocationId: process.env.SQUARE_LOCATION_ID || rowSettings.squareLocationId || defaultSettings.squareLocationId,
      squareWebhookSignatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY || "",
      googleClientId: process.env.GOOGLE_CLIENT_ID || rowSettings.googleClientId || "",
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || rowSettings.googleRedirectUri || defaultSettings.googleRedirectUri,
      googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN || rowSettings.googleRefreshToken || "",
      googleCalendarId: process.env.GOOGLE_CALENDAR_ID || rowSettings.googleCalendarId || defaultSettings.googleCalendarId,
      mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN || rowSettings.mapboxPublicToken || "",
      zellePayment: rowSettings.zellePayment || "",
      cashAppPayment: rowSettings.cashAppPayment || "",
      venmoPayment: rowSettings.venmoPayment || "",
      paymentInstructions: rowSettings.paymentInstructions || "",
      businessLogoDataUrl: rowSettings.businessLogoDataUrl || "",
      customTemplates: Array.isArray(rowSettings.customTemplates) ? rowSettings.customTemplates : [],
      customServices: Array.isArray(rowSettings.customServices) ? rowSettings.customServices : []
    };
  }

  return { ...defaultSettings, ...(await readJson(SETTINGS_FILE)) };
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
        square_location_id,
        google_refresh_token,
        google_calendar_id,
        mapbox_public_token,
        zelle_payment,
        cash_app_payment,
        venmo_payment,
        payment_instructions,
        custom_templates,
        custom_services,
        updated_at
      ) values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18::jsonb, now())
      on conflict (id) do update set
        business_name = excluded.business_name,
        business_email = excluded.business_email,
        business_phone = excluded.business_phone,
        business_logo_data_url = excluded.business_logo_data_url,
        default_deposit_percent = excluded.default_deposit_percent,
        default_job_duration_minutes = excluded.default_job_duration_minutes,
        final_invoice_timing = excluded.final_invoice_timing,
        square_environment = excluded.square_environment,
        square_location_id = excluded.square_location_id,
        google_refresh_token = excluded.google_refresh_token,
        google_calendar_id = excluded.google_calendar_id,
        mapbox_public_token = excluded.mapbox_public_token,
        zelle_payment = excluded.zelle_payment,
        cash_app_payment = excluded.cash_app_payment,
        venmo_payment = excluded.venmo_payment,
        payment_instructions = excluded.payment_instructions,
        custom_templates = excluded.custom_templates,
        custom_services = excluded.custom_services,
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
        settings.squareLocationId || "",
        settings.googleRefreshToken || "",
        settings.googleCalendarId || "",
        settings.mapboxPublicToken || "",
        settings.zellePayment || "",
        settings.cashAppPayment || "",
        settings.venmoPayment || "",
        settings.paymentInstructions || "",
        JSON.stringify(settings.customTemplates || []),
        JSON.stringify(settings.customServices || [])
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
    square_location_id text not null default '',
    google_refresh_token text not null default '',
    google_calendar_id text not null default '',
    mapbox_public_token text not null default '',
    zelle_payment text not null default '',
    cash_app_payment text not null default '',
    venmo_payment text not null default '',
    payment_instructions text not null default '',
    custom_templates jsonb not null default '[]'::jsonb,
    custom_services jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
  )`);
  await getPool().query("alter table app_settings add column if not exists google_refresh_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists business_logo_data_url text not null default ''");
  await getPool().query("alter table app_settings add column if not exists mapbox_public_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists zelle_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists cash_app_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists venmo_payment text not null default ''");
  await getPool().query("alter table app_settings add column if not exists payment_instructions text not null default ''");
  await getPool().query("alter table app_settings add column if not exists custom_templates jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_settings add column if not exists custom_services jsonb not null default '[]'::jsonb");
  await getPool().query("alter table app_users add column if not exists settings jsonb not null default '{}'::jsonb");
  await getPool().query("alter table customers add column if not exists account_id text not null default 'owner'");
  await getPool().query("alter table expenses add column if not exists account_id text not null default 'owner'");
  await getPool().query("alter table jobs add column if not exists account_id text not null default 'owner'");
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
  await getPool().query("alter table jobs add column if not exists contract_approval_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_approval_url text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_mailto text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_sent_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_date text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_signer_name text not null default ''");
  postgresSchemaReady = true;
}

async function upsertUser(client, user) {
  await client.query(
    `insert into app_users (
      id,
      name,
      email,
      password_hash,
      role,
      disabled,
      settings,
      last_login_at,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
    on conflict (id) do update set
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

function userFromRow(row) {
  return {
    id: row.id,
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
      account_id = $26
    where id = $27`,
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
    squareLocationId: row.square_location_id || "",
    googleRefreshToken: row.google_refresh_token || "",
    googleCalendarId: row.google_calendar_id || "",
    mapboxPublicToken: row.mapbox_public_token || "",
    zellePayment: row.zelle_payment || "",
    cashAppPayment: row.cash_app_payment || "",
    venmoPayment: row.venmo_payment || "",
    paymentInstructions: row.payment_instructions || "",
    customTemplates: Array.isArray(row.custom_templates) ? row.custom_templates : [],
    customServices: Array.isArray(row.custom_services) ? row.custom_services : []
  };
}

async function upsertExpense(client, expense) {
  await client.query(
    `insert into expenses (
      id, vendor, category, amount, expense_date, notes, receipt_photos, created_at, updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    on conflict (id) do update set
      vendor = excluded.vendor,
      category = excluded.category,
      amount = excluded.amount,
      expense_date = excluded.expense_date,
      notes = excluded.notes,
      receipt_photos = excluded.receipt_photos,
      updated_at = excluded.updated_at`,
    [
      expense.id,
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
  readUsers,
  writeUsers,
  readUserSettings,
  writeUserSettings,
  readSettings,
  writeSettings,
  readWebhookEvents,
  writeWebhookEvents
};
