-- PressureFlow production schema draft for Supabase Postgres.
-- Run this in Supabase SQL Editor when we are ready to migrate off local JSON.

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  email text not null,
  phone text not null,
  address text not null,
  service_type text not null,
  estimate numeric(10, 2) not null default 0,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  id integer primary key default 1,
  business_name text not null default '',
  business_email text not null default '',
  business_phone text not null default '',
  default_deposit_percent numeric(5, 2) not null default 25,
  default_job_duration_minutes integer not null default 180,
  final_invoice_timing text not null default 'immediate_after_completion',
  square_environment text not null default 'sandbox',
  square_location_id text not null default '',
  google_calendar_id text not null default '',
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
create index if not exists idx_jobs_deposit_invoice on jobs(square_deposit_invoice_id);
create index if not exists idx_jobs_final_invoice on jobs(square_final_invoice_id);
create index if not exists idx_webhook_events_received_at on webhook_events(received_at desc);

