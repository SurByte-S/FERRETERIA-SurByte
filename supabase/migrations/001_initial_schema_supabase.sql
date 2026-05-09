-- FERRETERIA SaaS - Supabase/Postgres initial schema
-- Ejecutar en Supabase SQL Editor o como migración: supabase/migrations/001_initial_schema.sql

create extension if not exists pgcrypto;

-- 1) Core multi-tenant
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  business_name text,
  tax_id text,
  phone text,
  email text,
  address text,
  logo_url text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type public.tenant_role as enum ('owner', 'admin', 'seller', 'viewer');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.tenant_role not null default 'seller',
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- 2) Catálogo
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  icon text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_name text not null,
  imported_by uuid references auth.users(id),
  total_rows int not null default 0,
  valid_rows int not null default 0,
  invalid_rows int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sku text not null,
  barcode text,
  name text not null,
  normalized_name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  unit text not null default 'unidad',
  cost_without_tax numeric(14,2),
  cost_with_tax numeric(14,2),
  sale_price numeric(14,2),
  tax_rate numeric(6,2) not null default 21.00,
  stock_quantity numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  image_url text,
  active boolean not null default true,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  source_excel_row int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku)
);

create index if not exists idx_products_tenant_name on public.products (tenant_id, normalized_name);
create index if not exists idx_products_tenant_category on public.products (tenant_id, category_id);
create index if not exists idx_products_tenant_brand on public.products (tenant_id, brand_id);
create index if not exists idx_products_tenant_supplier on public.products (tenant_id, supplier_id);
create index if not exists idx_products_tenant_barcode on public.products (tenant_id, barcode);
create index if not exists idx_products_tenant_active on public.products (tenant_id, active);
create index if not exists idx_tenant_members_user on public.tenant_members (user_id, tenant_id);
create index if not exists idx_tenant_members_tenant_role on public.tenant_members (tenant_id, role, active);
create index if not exists idx_categories_tenant_active on public.categories (tenant_id, active, sort_order);
create index if not exists idx_brands_tenant_active on public.brands (tenant_id, active, name);
create index if not exists idx_suppliers_tenant_name on public.suppliers (tenant_id, name);
create index if not exists idx_import_batches_tenant_created on public.import_batches (tenant_id, created_at desc);

-- 3) Stock
do $$
begin
  create type public.inventory_movement_type as enum ('initial', 'purchase', 'sale', 'adjustment', 'return');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type public.inventory_movement_type not null,
  quantity numeric(14,3) not null,
  unit_cost numeric(14,2),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_tenant_product on public.inventory_movements (tenant_id, product_id, created_at desc);
create index if not exists idx_inventory_tenant_created on public.inventory_movements (tenant_id, created_at desc);

-- 4) Clientes, presupuestos y ventas
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  create type public.document_status as enum ('draft', 'issued', 'cancelled', 'converted');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  quote_number bigint generated always as identity,
  status public.document_status not null default 'draft',
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_number bigint generated always as identity,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  tax_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  payment_method text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  sku text,
  name text not null,
  quantity numeric(14,3) not null,
  unit_price numeric(14,2) not null,
  discount_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null
);

create index if not exists idx_customers_tenant_name on public.customers (tenant_id, name);
create index if not exists idx_quotes_tenant_created on public.quotes (tenant_id, created_at desc);
create index if not exists idx_quotes_tenant_customer on public.quotes (tenant_id, customer_id);
create index if not exists idx_quote_items_tenant_quote on public.quote_items (tenant_id, quote_id);
create index if not exists idx_quote_items_tenant_product on public.quote_items (tenant_id, product_id);
create index if not exists idx_sales_tenant_created on public.sales (tenant_id, created_at desc);
create index if not exists idx_sales_tenant_customer on public.sales (tenant_id, customer_id);
create index if not exists idx_sale_items_tenant_sale on public.sale_items (tenant_id, sale_id);
create index if not exists idx_sale_items_tenant_product on public.sale_items (tenant_id, product_id);

-- Updated at helper
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- RLS helper functions
create or replace function public.is_tenant_member(check_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = check_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
  );
$$;

create or replace function public.has_tenant_role(check_tenant_id uuid, allowed_roles public.tenant_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = check_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
      and tm.role = any(allowed_roles)
  );
$$;

-- Enable RLS on all tenant data tables
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.suppliers enable row level security;
alter table public.import_batches enable row level security;
alter table public.products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

-- SQL grants for logged-in users. Tenant isolation is enforced by RLS policies below.
grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.tenants,
  public.tenant_members,
  public.categories,
  public.brands,
  public.suppliers,
  public.import_batches,
  public.products,
  public.inventory_movements,
  public.customers,
  public.quotes,
  public.quote_items,
  public.sales,
  public.sale_items
to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tenant policies
create policy "members can view their tenants"
on public.tenants for select
to authenticated
using (public.is_tenant_member(id));

create policy "owners and admins can update tenant"
on public.tenants for update
to authenticated
using (public.has_tenant_role(id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(id, array['owner','admin']::public.tenant_role[]));

create policy "members can view tenant members"
on public.tenant_members for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy "owners and admins manage tenant members"
on public.tenant_members for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

-- Generic member-read, seller-write policies
create policy "members read categories" on public.categories for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "admins manage categories" on public.categories for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

create policy "members read brands" on public.brands for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "admins manage brands" on public.brands for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

create policy "members read suppliers" on public.suppliers for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "admins manage suppliers" on public.suppliers for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

create policy "members read products" on public.products for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "admins manage products" on public.products for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

create policy "members read stock movements" on public.inventory_movements for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller creates stock movements" on public.inventory_movements for insert to authenticated with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read customers" on public.customers for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller manages customers" on public.customers for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read quotes" on public.quotes for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller manages quotes" on public.quotes for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read quote items" on public.quote_items for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller manages quote items" on public.quote_items for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read sales" on public.sales for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller manages sales" on public.sales for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read sale items" on public.sale_items for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "seller manages sale items" on public.sale_items for all to authenticated using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[])) with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create policy "members read import batches" on public.import_batches for select to authenticated using (public.is_tenant_member(tenant_id));
create policy "admins create import batches" on public.import_batches for insert to authenticated with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));
