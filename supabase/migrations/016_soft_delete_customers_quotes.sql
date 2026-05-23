alter table public.customers
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

alter table public.quotes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists idx_customers_tenant_deleted_name
on public.customers (tenant_id, deleted_at, name);

create index if not exists idx_quotes_tenant_deleted_created
on public.quotes (tenant_id, deleted_at, created_at desc);
