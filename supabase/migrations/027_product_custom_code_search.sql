drop function if exists public.find_product_by_code(uuid, text);

create function public.find_product_by_code(
  input_tenant_id uuid,
  input_code text
)
returns table (
  status text,
  product_id uuid,
  matched_by text,
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
    matched_by := null;
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
    null::uuid as sale_unit_id,
    'product_barcode'::text as matched_by,
    p.active as active,
    1 as priority,
    p.barcode as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and nullif(public.normalize_product_code(p.barcode), '') = clean_code

  union all

  select
    p.id as product_id,
    null::uuid as sale_unit_id,
    'custom_code'::text as matched_by,
    p.active as active,
    2 as priority,
    p.custom_code as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and nullif(public.normalize_product_code(p.custom_code), '') = clean_code

  union all

  select
    p.id as product_id,
    null::uuid as sale_unit_id,
    'sku'::text as matched_by,
    p.active as active,
    3 as priority,
    p.sku as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and nullif(public.normalize_product_code(p.sku), '') = clean_code

  union all

  select
    p.id as product_id,
    psu.id as sale_unit_id,
    'sale_unit_barcode'::text as matched_by,
    (p.active and psu.active) as active,
    4 as priority,
    psu.barcode as code_value
  from public.product_sale_units psu
  join public.products p
    on p.tenant_id = psu.tenant_id
    and p.id = psu.product_id
  where psu.tenant_id = input_tenant_id
    and psu.active = true
    and nullif(public.normalize_product_code(psu.barcode), '') = clean_code;

  select count(distinct product_code_matches.product_id)
    into matched_product_count
  from pg_temp.product_code_matches;

  if matched_product_count = 0 then
    status := 'not_found';
    product_id := null;
    matched_by := null;
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
          'sale_unit_id',
          product_code_matches.sale_unit_id,
          'matched_by',
          product_code_matches.matched_by,
          'active',
          product_code_matches.active,
          'code',
          product_code_matches.code_value
        )
        order by product_code_matches.priority, product_code_matches.product_id::text
      ),
      '[]'::jsonb
    )
    into conflict_sources
  from pg_temp.product_code_matches;

  if matched_product_count > 1 then
    status := 'conflict';
    product_id := null;
    matched_by := null;
    sale_unit_id := null;
    active := null;
    tenant_id := input_tenant_id;
    conflict_count := matched_product_count;
    return next;
    return;
  end if;

  select
    product_code_matches.product_id,
    product_code_matches.matched_by,
    product_code_matches.sale_unit_id,
    product_code_matches.active
    into product_id, matched_by, sale_unit_id, active
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

drop function if exists public.search_pos_products(uuid, text, int, int, boolean);

create function public.search_pos_products(
  p_tenant_id uuid,
  p_query text default '',
  p_limit int default 40,
  p_offset int default 0,
  p_include_out_of_stock boolean default false
)
returns table (
  id uuid,
  sku text,
  custom_code text,
  barcode text,
  name text,
  description text,
  normalized_name text,
  unit text,
  sale_price numeric,
  stock_quantity numeric,
  min_stock numeric,
  category_name text,
  brand_name text,
  rank int,
  score numeric,
  matched_by text,
  matched_sale_unit_id uuid,
  total_count bigint
)
language sql
security definer
set search_path = public, extensions
stable
as $$
  with params as (
    select
      nullif(public.normalize_product_search_text(p_query), '') as q,
      nullif(public.normalize_product_code(p_query), '') as code_q,
      least(greatest(coalesce(p_limit, 40), 1), 80) as limit_value,
      greatest(coalesce(p_offset, 0), 0) as offset_value
  ),
  terms as (
    select coalesce(regexp_split_to_array(q, '\s+'), array[]::text[]) as tokens
    from params
  ),
  base as (
    select
      p.id,
      p.sku,
      p.custom_code,
      p.barcode,
      p.name,
      p.description,
      p.normalized_name,
      p.unit,
      p.sale_price,
      p.stock_quantity,
      p.min_stock,
      c.name as category_name,
      b.name as brand_name,
      public.normalize_product_code(p.sku) as n_sku_code,
      public.normalize_product_code(p.custom_code) as n_custom_code,
      public.normalize_product_code(p.barcode) as n_product_barcode_code,
      lower(coalesce(p.normalized_name, p.name, '')) as n_name,
      lower(unaccent(coalesce(c.name, ''))) as n_category,
      lower(unaccent(coalesce(b.name, ''))) as n_brand,
      lower(coalesce(su.sale_unit_barcodes, '')) as n_sale_unit_barcodes,
      su.exact_sale_unit_id,
      trim(
        public.normalize_product_search_text(
          coalesce(p.sku, '') || ' ' ||
          coalesce(p.custom_code, '') || ' ' ||
          coalesce(p.barcode, '') || ' ' ||
          coalesce(p.normalized_name, p.name, '') || ' ' ||
          coalesce(c.name, '') || ' ' ||
          coalesce(b.name, '') || ' ' ||
          coalesce(su.sale_unit_text, '')
        )
      ) as search_text
    from public.products p
    cross join params
    left join public.categories c on c.id = p.category_id and c.tenant_id = p.tenant_id
    left join public.brands b on b.id = p.brand_id and b.tenant_id = p.tenant_id
    left join lateral (
      select
        string_agg(public.normalize_product_code(psu.barcode), ' ')
          filter (where nullif(public.normalize_product_code(psu.barcode), '') is not null) as sale_unit_barcodes,
        string_agg(coalesce(psu.name, '') || ' ' || coalesce(psu.barcode, ''), ' ') as sale_unit_text,
        (
          array_agg(psu.id order by psu.is_default desc, psu.name)
            filter (
              where params.code_q is not null
                and nullif(public.normalize_product_code(psu.barcode), '') = params.code_q
            )
        )[1] as exact_sale_unit_id
      from public.product_sale_units psu
      where psu.tenant_id = p.tenant_id
        and psu.product_id = p.id
        and psu.active = true
    ) su on true
    where p.tenant_id = p_tenant_id
      and p.active = true
      and (p_include_out_of_stock or p.stock_quantity > 0)
      and (auth.role() = 'service_role' or public.is_tenant_member(p_tenant_id))
  ),
  matched as (
    select
      base.*,
      case
        when params.q is null then 8
        when params.code_q is not null
          and (
            base.n_product_barcode_code = params.code_q
            or base.n_custom_code = params.code_q
            or base.n_sku_code = params.code_q
            or base.exact_sale_unit_id is not null
          ) then 1
        when base.n_sale_unit_barcodes like '%' || lower(params.code_q) || '%' then 1
        when base.n_name = params.q then 2
        when base.n_name like params.q || '%' then 3
        when array_length(terms.tokens, 1) > 0 and not exists (
          select 1
          from unnest(terms.tokens) as token
          where base.search_text not like '%' || token || '%'
        ) then 4
        when array_length(terms.tokens, 1) > 0 and exists (
          select 1
          from unnest(terms.tokens) as token
          where base.search_text like '%' || token || '%'
        ) then 5
        when base.n_category like '%' || params.q || '%' then 6
        else 7
      end as rank,
      case
        when params.q is null then 0::numeric
        else (
          select count(*)::numeric
          from unnest(terms.tokens) as token
          where base.search_text like '%' || token || '%'
        )
      end as score,
      case
        when params.code_q is not null
          and nullif(base.n_product_barcode_code, '') = params.code_q then 'product_barcode'
        when params.code_q is not null
          and nullif(base.n_custom_code, '') = params.code_q then 'custom_code'
        when params.code_q is not null and base.n_sku_code = params.code_q then 'sku'
        when base.exact_sale_unit_id is not null then 'sale_unit_barcode'
        else 'text'
      end as matched_by,
      case
        when base.exact_sale_unit_id is not null then base.exact_sale_unit_id
        else null::uuid
      end as matched_sale_unit_id
    from base
    cross join params
    cross join terms
    where params.q is null
      or (params.code_q is not null and nullif(base.n_product_barcode_code, '') = params.code_q)
      or (params.code_q is not null and nullif(base.n_custom_code, '') = params.code_q)
      or (params.code_q is not null and base.n_sku_code = params.code_q)
      or base.exact_sale_unit_id is not null
      or (params.code_q is not null and base.n_sale_unit_barcodes like '%' || lower(params.code_q) || '%')
      or base.n_name = params.q
      or base.n_name like params.q || '%'
      or base.n_name like '%' || params.q || '%'
      or base.n_category like '%' || params.q || '%'
      or base.n_brand like '%' || params.q || '%'
      or (
        array_length(terms.tokens, 1) > 0
        and not exists (
          select 1
          from unnest(terms.tokens) as token
          where base.search_text not like '%' || token || '%'
        )
      )
      or (
        array_length(terms.tokens, 1) > 0
        and exists (
          select 1
          from unnest(terms.tokens) as token
          where base.search_text like '%' || token || '%'
        )
      )
      or (
        length(params.q) >= 4
        and base.n_name % params.q
      )
  ),
  counted as (
    select matched.*, count(*) over() as total_count
    from matched
  )
  select
    counted.id,
    counted.sku,
    counted.custom_code,
    counted.barcode,
    counted.name,
    counted.description,
    counted.normalized_name,
    counted.unit,
    counted.sale_price,
    counted.stock_quantity,
    counted.min_stock,
    counted.category_name,
    counted.brand_name,
    counted.rank,
    counted.score,
    counted.matched_by,
    counted.matched_sale_unit_id,
    counted.total_count
  from counted
  cross join params
  order by
    counted.rank asc,
    counted.score desc,
    counted.name asc,
    counted.sku asc
  limit (select limit_value from params)
  offset (select offset_value from params);
$$;

revoke execute on function public.search_pos_products(uuid, text, int, int, boolean) from public;
revoke execute on function public.search_pos_products(uuid, text, int, int, boolean) from anon;
grant execute on function public.search_pos_products(uuid, text, int, int, boolean) to authenticated;
grant execute on function public.search_pos_products(uuid, text, int, int, boolean) to service_role;

create table if not exists public.product_custom_code_counters (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  next_value bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table public.product_custom_code_counters from public;
revoke all on table public.product_custom_code_counters from anon;
revoke all on table public.product_custom_code_counters from authenticated;
grant all on table public.product_custom_code_counters to service_role;

create or replace function public.next_product_custom_code(input_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_code text;
  candidate_value bigint;
  attempts int := 0;
begin
  if input_tenant_id is null then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  if auth.role() <> 'service_role' and not public.is_tenant_member(input_tenant_id) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  insert into public.product_custom_code_counters (tenant_id, next_value)
  values (input_tenant_id, 1)
  on conflict (tenant_id) do nothing;

  loop
    update public.product_custom_code_counters
    set
      next_value = next_value + 1,
      updated_at = now()
    where tenant_id = input_tenant_id
    returning next_value - 1 into candidate_value;

    candidate_code := lpad(candidate_value::text, 4, '0');

    if not exists (
      select 1
      from public.products p
      where p.tenant_id = input_tenant_id
        and (
          public.normalize_product_code(p.sku) = candidate_code
          or public.normalize_product_code(p.custom_code) = candidate_code
          or public.normalize_product_code(p.barcode) = candidate_code
        )
    ) and not exists (
      select 1
      from public.product_sale_units psu
      where psu.tenant_id = input_tenant_id
        and public.normalize_product_code(psu.barcode) = candidate_code
    ) then
      return candidate_code;
    end if;

    attempts := attempts + 1;

    if attempts > 100000 then
      raise exception 'PRODUCT_CUSTOM_CODE_GENERATION_FAILED';
    end if;
  end loop;
end;
$$;

revoke execute on function public.next_product_custom_code(uuid) from public;
revoke execute on function public.next_product_custom_code(uuid) from anon;
grant execute on function public.next_product_custom_code(uuid) to authenticated;
grant execute on function public.next_product_custom_code(uuid) to service_role;

drop function if exists public.create_product_atomic(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  boolean,
  jsonb
);

create function public.create_product_atomic(
  input_tenant_id uuid,
  input_user_id uuid,
  input_sku text,
  input_barcode text,
  input_name text,
  input_normalized_name text,
  input_description text,
  input_brand_id uuid,
  input_supplier_id uuid,
  input_unit text,
  input_cost_without_tax numeric,
  input_cost_with_tax numeric,
  input_sale_price numeric,
  input_tax_rate numeric,
  input_profit_margin_percent numeric,
  input_stock_quantity numeric,
  input_min_stock numeric,
  input_active boolean,
  input_sale_units jsonb,
  input_custom_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_sku text;
  clean_custom_code text;
  clean_barcode text;
  clean_name text;
  clean_normalized_name text;
  clean_description text;
  clean_unit text;
  clean_tax_rate numeric(6,2);
  clean_profit_margin_percent numeric(8,2);
  clean_stock_quantity numeric(14,3);
  clean_min_stock numeric(14,3);
  created_product_id uuid;
  default_row_number int;
begin
  if input_tenant_id is null or input_user_id is null then
    raise exception 'TENANT_FORBIDDEN';
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

  clean_sku := public.normalize_product_code(input_sku);
  clean_custom_code := nullif(public.normalize_product_code(input_custom_code), '');
  clean_barcode := nullif(public.normalize_product_code(input_barcode), '');
  clean_name := nullif(trim(coalesce(input_name, '')), '');
  clean_normalized_name := nullif(trim(coalesce(input_normalized_name, '')), '');
  clean_description := nullif(trim(coalesce(input_description, '')), '');
  clean_unit := coalesce(nullif(trim(coalesce(input_unit, '')), ''), 'unidad');
  clean_tax_rate := coalesce(input_tax_rate, 0);
  clean_profit_margin_percent := coalesce(input_profit_margin_percent, 0);
  clean_stock_quantity := coalesce(input_stock_quantity, 0);
  clean_min_stock := coalesce(input_min_stock, 0);

  if clean_name is null then
    raise exception 'PRODUCT_NAME_REQUIRED';
  end if;

  if clean_sku = '' then
    raise exception 'PRODUCT_SKU_REQUIRED';
  end if;

  if clean_custom_code is null then
    clean_custom_code := public.next_product_custom_code(input_tenant_id);
  end if;

  if clean_normalized_name is null then
    clean_normalized_name := lower(clean_name);
  end if;

  if clean_tax_rate < 0
    or clean_profit_margin_percent < 0
    or clean_stock_quantity < 0
    or clean_min_stock < 0
    or coalesce(input_cost_without_tax, 0) < 0
    or coalesce(input_cost_with_tax, 0) < 0
    or coalesce(input_sale_price, 0) < 0 then
    raise exception 'PRODUCT_NUMERIC_INVALID';
  end if;

  if input_brand_id is not null and not exists (
    select 1 from public.brands b
    where b.tenant_id = input_tenant_id
      and b.id = input_brand_id
  ) then
    raise exception 'PRODUCT_BRAND_INVALID';
  end if;

  if input_supplier_id is not null and not exists (
    select 1 from public.suppliers s
    where s.tenant_id = input_tenant_id
      and s.id = input_supplier_id
  ) then
    raise exception 'PRODUCT_SUPPLIER_INVALID';
  end if;

  if clean_sku is not null and (
    exists (
      select 1
      from public.products p
      where p.tenant_id = input_tenant_id
        and (
          public.normalize_product_code(p.sku) = clean_sku
          or public.normalize_product_code(p.custom_code) = clean_sku
          or public.normalize_product_code(p.barcode) = clean_sku
        )
    ) or exists (
      select 1
      from public.product_sale_units psu
      where psu.tenant_id = input_tenant_id
        and public.normalize_product_code(psu.barcode) = clean_sku
    )
  ) then
    raise exception 'PRODUCT_SKU_CONFLICT';
  end if;

  if clean_custom_code is not null and (
    exists (
      select 1
      from public.products p
      where p.tenant_id = input_tenant_id
        and (
          public.normalize_product_code(p.sku) = clean_custom_code
          or public.normalize_product_code(p.custom_code) = clean_custom_code
          or public.normalize_product_code(p.barcode) = clean_custom_code
        )
    ) or exists (
      select 1
      from public.product_sale_units psu
      where psu.tenant_id = input_tenant_id
        and public.normalize_product_code(psu.barcode) = clean_custom_code
    )
  ) then
    raise exception 'PRODUCT_CUSTOM_CODE_CONFLICT';
  end if;

  if clean_barcode is not null and (
    exists (
      select 1
      from public.products p
      where p.tenant_id = input_tenant_id
        and (
          public.normalize_product_code(p.sku) = clean_barcode
          or public.normalize_product_code(p.custom_code) = clean_barcode
          or public.normalize_product_code(p.barcode) = clean_barcode
        )
    ) or exists (
      select 1
      from public.product_sale_units psu
      where psu.tenant_id = input_tenant_id
        and public.normalize_product_code(psu.barcode) = clean_barcode
    )
  ) then
    raise exception 'PRODUCT_BARCODE_CONFLICT';
  end if;

  if input_sale_units is null or jsonb_typeof(input_sale_units) <> 'array' then
    raise exception 'PRODUCT_SALE_UNITS_INVALID';
  end if;

  drop table if exists pg_temp.new_product_sale_units;

  create temp table new_product_sale_units on commit drop as
  select
    item.ordinality::int as row_number,
    nullif(trim(coalesce(item.value ->> 'name', '')), '') as name,
    coalesce(nullif(item.value ->> 'quantityInBaseUnit', '')::numeric, 1)::numeric(14,3) as quantity_in_base_unit,
    coalesce(nullif(item.value ->> 'salePrice', '')::numeric, 0)::numeric(14,2) as sale_price,
    nullif(public.normalize_product_code(item.value ->> 'barcode'), '') as barcode,
    coalesce(nullif(item.value ->> 'isDefault', '')::boolean, false) as requested_default,
    coalesce(nullif(item.value ->> 'active', '')::boolean, true) as active,
    false as is_default
  from jsonb_array_elements(input_sale_units) with ordinality as item(value, ordinality)
  where coalesce(nullif(item.value ->> 'active', '')::boolean, true) = true;

  if not exists (select 1 from pg_temp.new_product_sale_units) then
    insert into pg_temp.new_product_sale_units (
      row_number,
      name,
      quantity_in_base_unit,
      sale_price,
      barcode,
      requested_default,
      active,
      is_default
    )
    values (
      1,
      'Unidad',
      1,
      coalesce(input_sale_price, 0),
      null,
      true,
      true,
      false
    );
  end if;

  if exists (
    select 1
    from pg_temp.new_product_sale_units psu
    where psu.name is null
      or psu.quantity_in_base_unit <= 0
      or psu.sale_price < 0
  ) then
    raise exception 'PRODUCT_SALE_UNITS_INVALID';
  end if;

  if exists (
    select 1
    from pg_temp.new_product_sale_units psu
    where psu.barcode is not null
      and (
        psu.barcode = clean_sku
        or psu.barcode = clean_custom_code
        or psu.barcode = clean_barcode
      )
  ) then
    raise exception 'PRODUCT_SALE_UNIT_BARCODE_CONFLICT';
  end if;

  if exists (
    select 1
    from pg_temp.new_product_sale_units psu
    where psu.barcode is not null
    group by psu.barcode
    having count(*) > 1
  ) then
    raise exception 'PRODUCT_SALE_UNIT_BARCODE_DUPLICATE';
  end if;

  if exists (
    select 1
    from pg_temp.new_product_sale_units input_unit
    join public.products p
      on p.tenant_id = input_tenant_id
      and (
        public.normalize_product_code(p.sku) = input_unit.barcode
        or public.normalize_product_code(p.custom_code) = input_unit.barcode
        or public.normalize_product_code(p.barcode) = input_unit.barcode
      )
    where input_unit.barcode is not null
  ) or exists (
    select 1
    from pg_temp.new_product_sale_units input_unit
    join public.product_sale_units psu
      on psu.tenant_id = input_tenant_id
      and public.normalize_product_code(psu.barcode) = input_unit.barcode
    where input_unit.barcode is not null
  ) then
    raise exception 'PRODUCT_SALE_UNIT_BARCODE_CONFLICT';
  end if;

  select coalesce(
      min(row_number) filter (where requested_default = true),
      min(row_number)
    )
    into default_row_number
  from pg_temp.new_product_sale_units;

  update pg_temp.new_product_sale_units psu
  set is_default = psu.row_number = default_row_number
  where psu.is_default is distinct from (psu.row_number = default_row_number);

  insert into public.products (
    tenant_id,
    sku,
    custom_code,
    barcode,
    name,
    normalized_name,
    description,
    brand_id,
    supplier_id,
    unit,
    cost_without_tax,
    cost_with_tax,
    sale_price,
    tax_rate,
    profit_margin_percent,
    stock_quantity,
    min_stock,
    active
  )
  values (
    input_tenant_id,
    clean_sku,
    clean_custom_code,
    clean_barcode,
    clean_name,
    clean_normalized_name,
    coalesce(clean_description, clean_name),
    input_brand_id,
    input_supplier_id,
    clean_unit,
    input_cost_without_tax,
    input_cost_with_tax,
    input_sale_price,
    clean_tax_rate,
    clean_profit_margin_percent,
    clean_stock_quantity,
    clean_min_stock,
    coalesce(input_active, true)
  )
  returning id into created_product_id;

  insert into public.product_sale_units (
    tenant_id,
    product_id,
    name,
    quantity_in_base_unit,
    sale_price,
    barcode,
    is_default,
    active
  )
  select
    input_tenant_id,
    created_product_id,
    psu.name,
    psu.quantity_in_base_unit,
    psu.sale_price,
    psu.barcode,
    psu.is_default,
    true
  from pg_temp.new_product_sale_units psu
  order by psu.row_number;

  if clean_stock_quantity > 0 then
    insert into public.inventory_movements (
      tenant_id,
      product_id,
      movement_type,
      quantity,
      unit_cost,
      notes,
      created_by
    )
    values (
      input_tenant_id,
      created_product_id,
      'initial'::public.inventory_movement_type,
      clean_stock_quantity,
      input_cost_with_tax,
      'Stock inicial al crear producto',
      input_user_id
    );
  end if;

  return created_product_id;
end;
$$;

revoke execute on function public.create_product_atomic(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, jsonb, text
) from public;
revoke execute on function public.create_product_atomic(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, jsonb, text
) from anon;
grant execute on function public.create_product_atomic(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, jsonb, text
) to authenticated;
grant execute on function public.create_product_atomic(
  uuid, uuid, text, text, text, text, text, uuid, uuid, text,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, boolean, jsonb, text
) to service_role;
