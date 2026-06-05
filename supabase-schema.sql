-- PressureFlow production schema draft for Supabase Postgres.
-- Run this in Supabase SQL Editor when we are ready to migrate off local JSON.

create table if not exists accounts (
  id text primary key,
  name text not null default '',
  plan text not null default 'tester',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists file_assets (
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
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  account_id text not null default 'owner',
  customer_id text not null default '',
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  service_type text not null,
  lead_source text not null default '',
  estimate numeric(10, 2) not null default 0,
  line_items jsonb not null default '[]'::jsonb,
  measurement jsonb not null default '{}'::jsonb,
  job_photos jsonb not null default '{}'::jsonb,
  estimate_discount_percent numeric(5, 2) not null default 0,
  estimate_approval_token text not null default '',
  estimate_approval_url text not null default '',
  estimate_mailto text not null default '',
  estimate_sent_at timestamptz,
  estimate_approved_at timestamptz,
  estimate_rejected_at timestamptz,
  estimate_rejection_reason text not null default '',
  estimate_rejection_note text not null default '',
  contract_approval_token text not null default '',
  contract_approval_url text not null default '',
  contract_mailto text not null default '',
  contract_sent_at timestamptz,
  contract_signed_at timestamptz,
  contract_signed_date text not null default '',
  contract_signer_name text not null default '',
  deposit_percent numeric(5, 2) not null default 25,
  status text not null default 'Lead',
  scheduled_at timestamptz,
  job_duration_minutes integer not null default 180,
  notes text not null default '',
  access_notes text not null default '',
  sensitive_areas text not null default '',
  square_estimate_id text not null default '',
  square_estimate_url text not null default '',
  square_customer_id text not null default '',
  square_contract_id text not null default '',
  square_contract_url text not null default '',
  square_deposit_order_id text not null default '',
  square_deposit_invoice_id text not null default '',
  square_deposit_invoice_url text not null default '',
  square_deposit_invoice_status text not null default '',
  square_deposit_paid_at timestamptz,
  square_final_order_id text not null default '',
  square_final_invoice_id text not null default '',
  square_final_invoice_url text not null default '',
  square_final_invoice_status text not null default '',
  square_final_paid_at timestamptz,
  google_calendar_event_id text not null default '',
  google_calendar_event_url text not null default '',
  completion_notice_sent_at timestamptz,
  completion_notice_subject text not null default '',
  completion_notice_body text not null default '',
  completion_notice_mailto text not null default '',
  completion_proof_token text not null default '',
  completion_proof_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  account_id text not null default 'owner',
  customer_name text not null,
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  lead_source text not null default '',
  notes text not null default '',
  service_area_photos jsonb not null default '[]'::jsonb,
  property_measurements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expenses (
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
);

create table if not exists app_users (
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
);

create table if not exists app_settings (
  id integer primary key default 1,
  business_name text not null default '',
  business_email text not null default '',
  business_phone text not null default '',
  business_logo_data_url text not null default '',
  default_deposit_percent numeric(5, 2) not null default 25,
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
  onboarding_completed boolean not null default false,
  custom_templates jsonb not null default '[]'::jsonb,
  custom_services jsonb not null default '[]'::jsonb,
  custom_service_types jsonb not null default '[]'::jsonb,
  custom_photo_sections jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint singleton_settings check (id = 1)
);

create table if not exists integration_tokens (
  provider text primary key,
  encrypted_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null default '',
  event_type text not null default '',
  status text not null,
  result jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);

create index if not exists idx_jobs_status on jobs(status);
create index if not exists idx_jobs_customer_id on jobs(customer_id);
create index if not exists idx_jobs_lead_source on jobs(lead_source);
create index if not exists idx_jobs_account_created_at on jobs(account_id, created_at desc);
create index if not exists idx_jobs_deposit_invoice on jobs(square_deposit_invoice_id);
create index if not exists idx_jobs_final_invoice on jobs(square_final_invoice_id);
create index if not exists idx_customers_updated_at on customers(updated_at desc);
create index if not exists idx_customers_lead_source on customers(lead_source);
create index if not exists idx_customers_account_updated_at on customers(account_id, updated_at desc);
create index if not exists idx_expenses_expense_date on expenses(expense_date desc);
create index if not exists idx_expenses_account_expense_date on expenses(account_id, expense_date desc, created_at desc);
create index if not exists idx_file_assets_account_owner on file_assets(account_id, owner_type, owner_id);
create index if not exists idx_file_assets_content_hash on file_assets(content_hash);
create index if not exists idx_webhook_events_received_at on webhook_events(received_at desc);
