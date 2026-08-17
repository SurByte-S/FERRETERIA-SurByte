alter table public.tenant_invoice_settings
  add column if not exists cuit text,
  add column if not exists fiscal_address text,
  add column if not exists sale_point text,
  add column if not exists gross_income text,
  add column if not exists activity_start_date date,
  add column if not exists invoice_footer_text text,
  add column if not exists print_paper_size text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'tax_id'
  ) then
    execute $sql$
      update public.tenant_invoice_settings
      set cuit = tax_id
      where (cuit is null or btrim(cuit) = '')
        and tax_id is not null
        and btrim(tax_id) <> ''
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'address'
  ) then
    execute $sql$
      update public.tenant_invoice_settings
      set fiscal_address = address
      where (fiscal_address is null or btrim(fiscal_address) = '')
        and address is not null
        and btrim(address) <> ''
    $sql$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'receipt_footer'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'receipt_message'
  ) then
    execute $sql$
      update public.tenant_invoice_settings
      set invoice_footer_text = coalesce(nullif(btrim(receipt_footer), ''), nullif(btrim(receipt_message), ''))
      where (invoice_footer_text is null or btrim(invoice_footer_text) = '')
        and (
          (receipt_footer is not null and btrim(receipt_footer) <> '')
          or (receipt_message is not null and btrim(receipt_message) <> '')
        )
    $sql$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'receipt_footer'
  ) then
    execute $sql$
      update public.tenant_invoice_settings
      set invoice_footer_text = receipt_footer
      where (invoice_footer_text is null or btrim(invoice_footer_text) = '')
        and receipt_footer is not null
        and btrim(receipt_footer) <> ''
    $sql$;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tenant_invoice_settings'
      and column_name = 'receipt_message'
  ) then
    execute $sql$
      update public.tenant_invoice_settings
      set invoice_footer_text = receipt_message
      where (invoice_footer_text is null or btrim(invoice_footer_text) = '')
        and receipt_message is not null
        and btrim(receipt_message) <> ''
    $sql$;
  end if;
end $$;

update public.tenant_invoice_settings
set print_paper_size = 'a4'
where print_paper_size is null
  or btrim(print_paper_size) = ''
  or print_paper_size not in ('ticket_80mm', 'a5', 'a4');

alter table public.tenant_invoice_settings
  alter column print_paper_size set default 'a4',
  alter column print_paper_size set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tenant_invoice_settings'::regclass
      and conname = 'tenant_invoice_settings_print_paper_size_check'
  ) then
    alter table public.tenant_invoice_settings
      add constraint tenant_invoice_settings_print_paper_size_check
      check (print_paper_size in ('ticket_80mm', 'a5', 'a4'));
  end if;
end $$;

do $$
declare
  tenant_id_attnum smallint;
  duplicate_count integer;
  has_tenant_unique boolean;
begin
  select attnum
    into tenant_id_attnum
  from pg_attribute
  where attrelid = 'public.tenant_invoice_settings'::regclass
    and attname = 'tenant_id'
    and not attisdropped;

  select count(*)
    into duplicate_count
  from (
    select tenant_id
    from public.tenant_invoice_settings
    group by tenant_id
    having count(*) > 1
  ) duplicates;

  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tenant_invoice_settings'::regclass
      and contype in ('p', 'u')
      and conkey = array[tenant_id_attnum]::smallint[]
  )
    into has_tenant_unique;

  if duplicate_count = 0 and not has_tenant_unique then
    alter table public.tenant_invoice_settings
      add constraint tenant_invoice_settings_tenant_id_unique unique (tenant_id);
  elsif duplicate_count > 0 then
    raise notice 'tenant_invoice_settings has duplicate tenant_id rows. Skipping unique constraint.';
  end if;
end $$;

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
