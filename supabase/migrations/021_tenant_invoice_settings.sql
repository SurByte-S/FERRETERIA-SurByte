create table if not exists public.tenant_invoice_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  fantasy_name text,
  legal_name text,
  tax_id text,
  iva_condition text,
  address text,
  city text,
  province text,
  phone text,
  email text,
  receipt_footer text,
  receipt_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tenant_invoice_settings_tenant
on public.tenant_invoice_settings (tenant_id);

drop trigger if exists set_tenant_invoice_settings_updated_at on public.tenant_invoice_settings;
create trigger set_tenant_invoice_settings_updated_at
before update on public.tenant_invoice_settings
for each row execute function public.set_updated_at();

alter table public.tenant_invoice_settings enable row level security;

grant select, insert, update, delete on public.tenant_invoice_settings to authenticated;

drop policy if exists "members read tenant invoice settings" on public.tenant_invoice_settings;
create policy "members read tenant invoice settings"
on public.tenant_invoice_settings for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage tenant invoice settings" on public.tenant_invoice_settings;
create policy "admins manage tenant invoice settings"
on public.tenant_invoice_settings for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));
