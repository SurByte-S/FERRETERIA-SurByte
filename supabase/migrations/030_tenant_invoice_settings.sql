create table if not exists public.tenant_invoice_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  legal_name text,
  cuit text,
  iva_condition text,
  fiscal_address text,
  sale_point text,
  gross_income text,
  activity_start_date date,
  invoice_footer_text text,
  print_paper_size text not null default 'a4',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_invoice_settings_print_paper_size_check
    check (print_paper_size in ('ticket_80mm', 'a5', 'a4'))
);

drop trigger if exists trg_tenant_invoice_settings_updated_at on public.tenant_invoice_settings;
create trigger trg_tenant_invoice_settings_updated_at
before update on public.tenant_invoice_settings
for each row execute function public.set_updated_at();

alter table public.tenant_invoice_settings enable row level security;

grant select, insert, update on public.tenant_invoice_settings to authenticated;
grant select, insert, update on public.tenant_invoice_settings to service_role;

drop policy if exists "members read tenant invoice settings" on public.tenant_invoice_settings;
create policy "members read tenant invoice settings"
on public.tenant_invoice_settings for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage tenant invoice settings" on public.tenant_invoice_settings;
create policy "admins manage tenant invoice settings"
on public.tenant_invoice_settings for insert
to authenticated
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

drop policy if exists "admins update tenant invoice settings" on public.tenant_invoice_settings;
create policy "admins update tenant invoice settings"
on public.tenant_invoice_settings for update
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));
