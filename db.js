const { readFile, writeFile, mkdir } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const JOBS_FILE = path.join(DATA_DIR, "jobs.json");
const CUSTOMERS_FILE = path.join(DATA_DIR, "customers.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.local.json");
const WEBHOOK_LOG_FILE = path.join(DATA_DIR, "webhook-events.json");
const usePostgres = Boolean(process.env.DATABASE_URL);
let pool;
let postgresSchemaReady = false;

const defaultSettings = {
  businessName: "",
  businessEmail: "",
  businessPhone: "",
  defaultDepositPercent: 25,
  defaultJobDurationMinutes: 180,
  finalInvoiceTiming: "immediate_after_completion",
  squareEnvironment: "sandbox",
  squareAccessToken: "",
  squareLocationId: "LMAS5W0GDF117",
  squareWebhookSignatureKey: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRedirectUri: "http://localhost:3000/auth/google/callback",
  googleRefreshToken: "",
  googleCalendarId: "tonycg89@gmail.com",
  mapboxPublicToken: ""
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
      mapboxPublicToken: process.env.MAPBOX_PUBLIC_TOKEN || rowSettings.mapboxPublicToken || ""
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
        default_deposit_percent,
        default_job_duration_minutes,
        final_invoice_timing,
        square_environment,
        square_location_id,
        google_refresh_token,
        google_calendar_id,
        mapbox_public_token,
        updated_at
      ) values (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      on conflict (id) do update set
        business_name = excluded.business_name,
        business_email = excluded.business_email,
        business_phone = excluded.business_phone,
        default_deposit_percent = excluded.default_deposit_percent,
        default_job_duration_minutes = excluded.default_job_duration_minutes,
        final_invoice_timing = excluded.final_invoice_timing,
        square_environment = excluded.square_environment,
        square_location_id = excluded.square_location_id,
        google_refresh_token = excluded.google_refresh_token,
        google_calendar_id = excluded.google_calendar_id,
        mapbox_public_token = excluded.mapbox_public_token,
        updated_at = now()`,
      [
        settings.businessName || "",
        settings.businessEmail || "",
        settings.businessPhone || "",
        settings.defaultDepositPercent || 25,
        settings.defaultJobDurationMinutes || 180,
        settings.finalInvoiceTiming || "immediate_after_completion",
        settings.squareEnvironment || "sandbox",
        settings.squareLocationId || "",
        settings.googleRefreshToken || "",
        settings.googleCalendarId || "",
        settings.mapboxPublicToken || ""
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
    customer_name text not null,
    email text not null default '',
    phone text not null default '',
    address text not null default '',
    notes text not null default '',
    service_area_photos jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`);
  await getPool().query("alter table app_settings add column if not exists google_refresh_token text not null default ''");
  await getPool().query("alter table app_settings add column if not exists mapbox_public_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists customer_id text not null default ''");
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
  await getPool().query("alter table jobs add column if not exists contract_approval_token text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_approval_url text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_mailto text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_sent_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_at timestamptz");
  await getPool().query("alter table jobs add column if not exists contract_signed_date text not null default ''");
  await getPool().query("alter table jobs add column if not exists contract_signer_name text not null default ''");
  postgresSchemaReady = true;
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
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, nullif($11, '')::timestamptz,
      $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24,
      nullif($25, '')::timestamptz, $26, $27, $28, $29, nullif($30, '')::timestamptz,
      $31, $32, nullif($33, '')::timestamptz, $34, $35, $36, $37, $38, $39, $40
    )
    on conflict (id) do update set
      customer_id = excluded.customer_id,
      customer_name = excluded.customer_name,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      service_type = excluded.service_type,
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
      contract_approval_token = $10,
      contract_approval_url = $11,
      contract_mailto = $12,
      contract_sent_at = nullif($13, '')::timestamptz,
      contract_signed_at = nullif($14, '')::timestamptz,
      contract_signed_date = $15,
      contract_signer_name = $16
    where id = $17`,
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
      job.contractApprovalToken || "",
      job.contractApprovalUrl || "",
      job.contractMailto || "",
      job.contractSentAt || "",
      job.contractSignedAt || "",
      job.contractSignedDate || "",
      job.contractSignerName || "",
      job.id
    ]
  );
}

function jobFromRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id || "",
    customerName: row.customer_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
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
    jobDurationMinutes: Number(row.job_duration_minutes || 180),
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
      notes,
      service_area_photos,
      created_at,
      updated_at
    ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
    on conflict (id) do update set
      customer_name = excluded.customer_name,
      email = excluded.email,
      phone = excluded.phone,
      address = excluded.address,
      notes = excluded.notes,
      service_area_photos = excluded.service_area_photos,
      updated_at = excluded.updated_at`,
    [
      customer.id,
      customer.customerName || "",
      customer.email || "",
      customer.phone || "",
      customer.address || "",
      customer.notes || "",
      JSON.stringify(customer.serviceAreaPhotos || []),
      customer.createdAt || new Date().toISOString(),
      customer.updatedAt || new Date().toISOString()
    ]
  );
}

function customerFromRow(row) {
  return {
    id: row.id,
    customerName: row.customer_name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    notes: row.notes || "",
    serviceAreaPhotos: Array.isArray(row.service_area_photos) ? row.service_area_photos : [],
    createdAt: row.created_at?.toISOString?.() || "",
    updatedAt: row.updated_at?.toISOString?.() || ""
  };
}

function settingsFromRow(row) {
  return {
    businessName: row.business_name || "",
    businessEmail: row.business_email || "",
    businessPhone: row.business_phone || "",
    defaultDepositPercent: Number(row.default_deposit_percent || 25),
    defaultJobDurationMinutes: Number(row.default_job_duration_minutes || 180),
    finalInvoiceTiming: row.final_invoice_timing || "immediate_after_completion",
    squareEnvironment: row.square_environment || "sandbox",
    squareLocationId: row.square_location_id || "",
    googleRefreshToken: row.google_refresh_token || "",
    googleCalendarId: row.google_calendar_id || "",
    mapboxPublicToken: row.mapbox_public_token || ""
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
  readSettings,
  writeSettings,
  readWebhookEvents,
  writeWebhookEvents
};
