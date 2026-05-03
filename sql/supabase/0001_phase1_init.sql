create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text,
  role text not null default 'seller',
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  code text not null,
  description text not null,
  category_id uuid references categories(id),
  brand_id uuid references brands(id),
  cost_without_tax numeric(14,2),
  cost_with_tax numeric(14,2),
  tax_rate numeric(6,4),
  public_price numeric(14,2),
  stock_qty numeric(14,3),
  raw_discount text,
  unit text,
  source_sheet text,
  source_row_number integer,
  raw_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists import_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source_filename text not null,
  status text not null check (status in ('processing','done','error')),
  rows_total integer,
  rows_ok integer,
  rows_error integer,
  error_summary text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists import_job_errors (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references import_jobs(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  row_number integer,
  raw_row jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);

alter table tenants enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table brands enable row level security;
alter table products enable row level security;
alter table import_jobs enable row level security;
alter table import_job_errors enable row level security;

create policy tenant_isolation_profiles on profiles using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
create policy tenant_isolation_categories on categories using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
create policy tenant_isolation_brands on brands using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
create policy tenant_isolation_products on products using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
create policy tenant_isolation_import_jobs on import_jobs using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
create policy tenant_isolation_import_job_errors on import_job_errors using (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
