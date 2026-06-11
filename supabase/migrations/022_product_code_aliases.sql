create or replace function public.is_probable_legacy_barcode(
  input_sku text,
  input_barcode text
)
returns boolean
language sql
immutable
as $$
  select
    nullif(public.normalize_product_code(input_barcode), '') is not null
    and (
      public.normalize_product_code(input_barcode) = public.normalize_product_code(input_sku)
      or length(public.normalize_product_code(input_barcode)) < 8
    );
$$;

create table if not exists public.product_code_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  code text not null,
  normalized_code text not null,
  code_type text not null,
  supplier_id uuid null references public.suppliers(id) on delete set null,
  source text null,
  notes text null,
  created_by uuid null references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint product_code_aliases_code_type_check check (
    code_type in (
      'legacy_internal',
      'supplier_code',
      'previous_barcode',
      'search_alias'
    )
  )
);

alter table public.product_code_aliases
  add column if not exists normalized_code text,
  add column if not exists supplier_id uuid null references public.suppliers(id) on delete set null,
  add column if not exists source text null,
  add column if not exists notes text null,
  add column if not exists created_by uuid null references auth.users(id) on delete set null,
  add column if not exists active boolean not null default true;

update public.product_code_aliases
set normalized_code = public.normalize_product_code(code)
where normalized_code is null
  or normalized_code = '';

alter table public.product_code_aliases
  alter column normalized_code set not null;

create index if not exists idx_product_code_aliases_tenant_code
on public.product_code_aliases (tenant_id, normalized_code)
where active = true;

create index if not exists idx_product_code_aliases_tenant_product
on public.product_code_aliases (tenant_id, product_id, active);

create unique index if not exists idx_product_code_aliases_unique_active
on public.product_code_aliases (tenant_id, product_id, normalized_code, code_type)
where active = true;

alter table public.product_code_aliases enable row level security;

drop policy if exists "members read product_code_aliases" on public.product_code_aliases;
create policy "members read product_code_aliases"
on public.product_code_aliases for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage product_code_aliases" on public.product_code_aliases;
create policy "admins manage product_code_aliases"
on public.product_code_aliases for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

grant select, insert, update on public.product_code_aliases to authenticated;
grant select, insert, update, delete on public.product_code_aliases to service_role;

drop function if exists public.find_product_by_code(uuid, text);

create function public.find_product_by_code(
  input_tenant_id uuid,
  input_code text
)
returns table (
  status text,
  product_id uuid,
  product_name text,
  sku text,
  matched_by text,
  alias_id uuid,
  sale_unit_id uuid,
  active boolean,
  tenant_id uuid,
  conflict_count int,
  conflict_sources jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_code text;
  matched_product_count int;
begin
  clean_code := public.normalize_product_code(input_code);

  if input_tenant_id is null or clean_code = '' then
    status := 'not_found';
    product_id := null;
    product_name := null;
    sku := null;
    matched_by := null;
    alias_id := null;
    sale_unit_id := null;
    active := null;
    tenant_id := input_tenant_id;
    conflict_count := 0;
    conflict_sources := '[]'::jsonb;
    return next;
    return;
  end if;

  if auth.role() <> 'service_role' and not public.is_tenant_member(input_tenant_id) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  drop table if exists pg_temp.product_code_matches;

  create temp table product_code_matches on commit drop as
  select
    p.id as product_id,
    p.name as product_name,
    p.sku,
    null::uuid as alias_id,
    null::uuid as sale_unit_id,
    'sku'::text as matched_by,
    p.active as active,
    1 as priority,
    p.sku as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and public.normalize_product_code(p.sku) = clean_code

  union all

  select
    p.id as product_id,
    p.name as product_name,
    p.sku,
    null::uuid as alias_id,
    null::uuid as sale_unit_id,
    'barcode'::text as matched_by,
    p.active as active,
    2 as priority,
    p.barcode as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and public.normalize_product_code(p.barcode) = clean_code

  union all

  select
    p.id as product_id,
    p.name as product_name,
    p.sku,
    null::uuid as alias_id,
    psu.id as sale_unit_id,
    'sale_unit_barcode'::text as matched_by,
    (p.active and psu.active) as active,
    3 as priority,
    psu.barcode as code_value
  from public.product_sale_units psu
  join public.products p
    on p.tenant_id = psu.tenant_id
    and p.id = psu.product_id
  where psu.tenant_id = input_tenant_id
    and public.normalize_product_code(psu.barcode) = clean_code

  union all

  select
    p.id as product_id,
    p.name as product_name,
    p.sku,
    alias.id as alias_id,
    null::uuid as sale_unit_id,
    alias.code_type as matched_by,
    (p.active and alias.active) as active,
    case alias.code_type
      when 'supplier_code' then 4
      when 'legacy_internal' then 5
      when 'previous_barcode' then 6
      else 7
    end as priority,
    alias.code as code_value
  from public.product_code_aliases alias
  join public.products p
    on p.tenant_id = alias.tenant_id
    and p.id = alias.product_id
  where alias.tenant_id = input_tenant_id
    and alias.active = true
    and alias.normalized_code = clean_code;

  select count(distinct product_code_matches.product_id)
    into matched_product_count
  from pg_temp.product_code_matches;

  if matched_product_count = 0 then
    status := 'not_found';
    product_id := null;
    product_name := null;
    sku := null;
    matched_by := null;
    alias_id := null;
    sale_unit_id := null;
    active := null;
    tenant_id := input_tenant_id;
    conflict_count := 0;
    conflict_sources := '[]'::jsonb;
    return next;
    return;
  end if;

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_id',
          product_code_matches.product_id,
          'product_name',
          product_code_matches.product_name,
          'sku',
          product_code_matches.sku,
          'alias_id',
          product_code_matches.alias_id,
          'sale_unit_id',
          product_code_matches.sale_unit_id,
          'matched_by',
          product_code_matches.matched_by,
          'active',
          product_code_matches.active,
          'code',
          product_code_matches.code_value
        )
        order by product_code_matches.priority, product_code_matches.sku
      ),
      '[]'::jsonb
    )
    into conflict_sources
  from pg_temp.product_code_matches;

  if matched_product_count > 1 then
    status := 'conflict';
    product_id := null;
    product_name := null;
    sku := null;
    matched_by := null;
    alias_id := null;
    sale_unit_id := null;
    active := null;
    tenant_id := input_tenant_id;
    conflict_count := matched_product_count;
    return next;
    return;
  end if;

  select
    product_code_matches.product_id,
    product_code_matches.product_name,
    product_code_matches.sku,
    product_code_matches.matched_by,
    product_code_matches.alias_id,
    product_code_matches.sale_unit_id,
    product_code_matches.active
    into product_id, product_name, sku, matched_by, alias_id, sale_unit_id, active
  from pg_temp.product_code_matches
  order by product_code_matches.active desc, product_code_matches.priority asc
  limit 1;

  status := case when active then 'found' else 'inactive' end;
  tenant_id := input_tenant_id;
  conflict_count := matched_product_count;
  return next;
end;
$$;

revoke execute on function public.find_product_by_code(uuid, text) from public;
revoke execute on function public.find_product_by_code(uuid, text) from anon;
grant execute on function public.find_product_by_code(uuid, text) to authenticated;
grant execute on function public.find_product_by_code(uuid, text) to service_role;

drop function if exists public.add_product_code_alias(uuid, uuid, uuid, text, text, text, text);

create function public.add_product_code_alias(
  input_tenant_id uuid,
  input_user_id uuid,
  input_product_id uuid,
  input_code text,
  input_code_type text,
  input_source text default null,
  input_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_code text;
  alias_id uuid;
begin
  clean_code := public.normalize_product_code(input_code);

  if input_tenant_id is null or input_user_id is null or input_product_id is null or clean_code = '' then
    raise exception 'PRODUCT_CODE_ALIAS_INVALID';
  end if;

  if input_code_type not in ('legacy_internal', 'supplier_code', 'previous_barcode', 'search_alias') then
    raise exception 'PRODUCT_CODE_ALIAS_INVALID_TYPE';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = input_tenant_id
      and tm.user_id = input_user_id
      and tm.active = true
      and tm.role = any(array['owner', 'admin']::public.tenant_role[])
  ) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.products p
    where p.tenant_id = input_tenant_id
      and p.id = input_product_id
  ) then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.products p
    where p.tenant_id = input_tenant_id
      and p.id <> input_product_id
      and (
        public.normalize_product_code(p.sku) = clean_code
        or public.normalize_product_code(p.barcode) = clean_code
      )
  ) or exists (
    select 1
    from public.product_sale_units psu
    where psu.tenant_id = input_tenant_id
      and psu.product_id <> input_product_id
      and public.normalize_product_code(psu.barcode) = clean_code
  ) or exists (
    select 1
    from public.product_code_aliases alias
    where alias.tenant_id = input_tenant_id
      and alias.product_id <> input_product_id
      and alias.active = true
      and alias.normalized_code = clean_code
  ) then
    raise exception 'PRODUCT_CODE_CONFLICT';
  end if;

  insert into public.product_code_aliases (
    tenant_id,
    product_id,
    code,
    normalized_code,
    code_type,
    source,
    notes,
    created_by,
    active
  )
  values (
    input_tenant_id,
    input_product_id,
    trim(coalesce(input_code, '')),
    clean_code,
    input_code_type,
    nullif(trim(coalesce(input_source, '')), ''),
    nullif(trim(coalesce(input_notes, '')), ''),
    input_user_id,
    true
  )
  on conflict (tenant_id, product_id, normalized_code, code_type)
  where active = true
  do update set
    source = excluded.source,
    notes = excluded.notes,
    active = true
  returning id into alias_id;

  return alias_id;
end;
$$;

revoke execute on function public.add_product_code_alias(uuid, uuid, uuid, text, text, text, text) from public;
revoke execute on function public.add_product_code_alias(uuid, uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.add_product_code_alias(uuid, uuid, uuid, text, text, text, text) from authenticated;
grant execute on function public.add_product_code_alias(uuid, uuid, uuid, text, text, text, text) to service_role;

drop function if exists public.set_verified_product_barcode(uuid, uuid, uuid, text, boolean);

create function public.set_verified_product_barcode(
  input_tenant_id uuid,
  input_user_id uuid,
  input_product_id uuid,
  input_barcode text,
  input_replace_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_barcode text;
  product_row public.products%rowtype;
  current_barcode text;
  previous_code_type text;
begin
  clean_barcode := public.normalize_product_code(input_barcode);

  if input_tenant_id is null or input_user_id is null or input_product_id is null or clean_barcode = '' then
    raise exception 'PRODUCT_BARCODE_INVALID';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = input_tenant_id
      and tm.user_id = input_user_id
      and tm.active = true
      and tm.role = any(array['owner', 'admin']::public.tenant_role[])
  ) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  select *
    into product_row
  from public.products p
  where p.tenant_id = input_tenant_id
    and p.id = input_product_id
    and p.active = true
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  if public.normalize_product_code(product_row.barcode) = clean_barcode then
    return product_row.id;
  end if;

  if exists (
    select 1
    from public.products p
    where p.tenant_id = input_tenant_id
      and p.id <> input_product_id
      and (
        public.normalize_product_code(p.sku) = clean_barcode
        or public.normalize_product_code(p.barcode) = clean_barcode
      )
  ) or exists (
    select 1
    from public.product_sale_units psu
    where psu.tenant_id = input_tenant_id
      and psu.product_id <> input_product_id
      and public.normalize_product_code(psu.barcode) = clean_barcode
  ) or exists (
    select 1
    from public.product_code_aliases alias
    where alias.tenant_id = input_tenant_id
      and alias.product_id <> input_product_id
      and alias.active = true
      and alias.normalized_code = clean_barcode
  ) then
    raise exception 'PRODUCT_CODE_CONFLICT';
  end if;

  current_barcode := nullif(public.normalize_product_code(product_row.barcode), '');

  if current_barcode is not null then
    if input_replace_existing = false and public.is_probable_legacy_barcode(product_row.sku, product_row.barcode) = false then
      raise exception 'PRODUCT_BARCODE_EXISTS';
    end if;

    previous_code_type := case
      when public.is_probable_legacy_barcode(product_row.sku, product_row.barcode)
        then 'legacy_internal'
      else 'previous_barcode'
    end;

    perform public.add_product_code_alias(
      input_tenant_id,
      input_user_id,
      input_product_id,
      product_row.barcode,
      previous_code_type,
      'scanner-replace-main-barcode',
      'Valor anterior preservado antes de asociar codigo real.'
    );
  end if;

  update public.products
  set
    barcode = clean_barcode,
    updated_at = now()
  where tenant_id = input_tenant_id
    and id = input_product_id;

  return input_product_id;
end;
$$;

revoke execute on function public.set_verified_product_barcode(uuid, uuid, uuid, text, boolean) from public;
revoke execute on function public.set_verified_product_barcode(uuid, uuid, uuid, text, boolean) from anon;
revoke execute on function public.set_verified_product_barcode(uuid, uuid, uuid, text, boolean) from authenticated;
grant execute on function public.set_verified_product_barcode(uuid, uuid, uuid, text, boolean) to service_role;

drop function if exists public.set_default_sale_unit_barcode(uuid, uuid, uuid, text, boolean);

create function public.set_default_sale_unit_barcode(
  input_tenant_id uuid,
  input_user_id uuid,
  input_product_id uuid,
  input_barcode text,
  input_replace_existing boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_barcode text;
  sale_unit_row public.product_sale_units%rowtype;
begin
  clean_barcode := public.normalize_product_code(input_barcode);

  if clean_barcode = '' then
    raise exception 'PRODUCT_BARCODE_INVALID';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = input_tenant_id
      and tm.user_id = input_user_id
      and tm.active = true
      and tm.role = any(array['owner', 'admin']::public.tenant_role[])
  ) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  if exists (
    select 1
    from public.products p
    where p.tenant_id = input_tenant_id
      and p.id <> input_product_id
      and (
        public.normalize_product_code(p.sku) = clean_barcode
        or public.normalize_product_code(p.barcode) = clean_barcode
      )
  ) or exists (
    select 1
    from public.product_sale_units psu
    where psu.tenant_id = input_tenant_id
      and psu.product_id <> input_product_id
      and public.normalize_product_code(psu.barcode) = clean_barcode
  ) or exists (
    select 1
    from public.product_code_aliases alias
    where alias.tenant_id = input_tenant_id
      and alias.product_id <> input_product_id
      and alias.active = true
      and alias.normalized_code = clean_barcode
  ) then
    raise exception 'PRODUCT_CODE_CONFLICT';
  end if;

  select *
    into sale_unit_row
  from public.product_sale_units psu
  where psu.tenant_id = input_tenant_id
    and psu.product_id = input_product_id
    and psu.active = true
    and psu.is_default = true
  order by psu.created_at asc
  limit 1
  for update;

  if not found then
    raise exception 'PRODUCT_SALE_UNIT_NOT_FOUND';
  end if;

  if public.normalize_product_code(sale_unit_row.barcode) = clean_barcode then
    return sale_unit_row.id;
  end if;

  if nullif(public.normalize_product_code(sale_unit_row.barcode), '') is not null and input_replace_existing = false then
    raise exception 'PRODUCT_SALE_UNIT_BARCODE_EXISTS';
  end if;

  update public.product_sale_units
  set
    barcode = clean_barcode,
    updated_at = now()
  where tenant_id = input_tenant_id
    and id = sale_unit_row.id;

  return sale_unit_row.id;
end;
$$;

revoke execute on function public.set_default_sale_unit_barcode(uuid, uuid, uuid, text, boolean) from public;
revoke execute on function public.set_default_sale_unit_barcode(uuid, uuid, uuid, text, boolean) from anon;
revoke execute on function public.set_default_sale_unit_barcode(uuid, uuid, uuid, text, boolean) from authenticated;
grant execute on function public.set_default_sale_unit_barcode(uuid, uuid, uuid, text, boolean) to service_role;
