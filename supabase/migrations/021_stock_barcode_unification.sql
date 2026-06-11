create or replace function public.normalize_product_code(raw_code text)
returns text
language sql
immutable
as $$
  select upper(
    btrim(
      replace(
        replace(
          replace(
            replace(
              replace(coalesce(raw_code, ''), chr(65279), ''),
              chr(8203),
              ''
            ),
            chr(8204),
            ''
          ),
          chr(8205),
          ''
        ),
        chr(8288),
        ''
      )
    )
  );
$$;

create index if not exists idx_products_tenant_normalized_sku
on public.products (tenant_id, public.normalize_product_code(sku));

create index if not exists idx_products_tenant_normalized_barcode
on public.products (tenant_id, public.normalize_product_code(barcode));

create index if not exists idx_product_sale_units_tenant_normalized_barcode
on public.product_sale_units (tenant_id, public.normalize_product_code(barcode));

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
    null::uuid as sale_unit_id,
    'product_barcode'::text as matched_by,
    p.active as active,
    2 as priority,
    p.barcode as code_value
  from public.products p
  where p.tenant_id = input_tenant_id
    and public.normalize_product_code(p.barcode) = clean_code

  union all

  select
    p.id as product_id,
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
    and public.normalize_product_code(psu.barcode) = clean_code;

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
  input_sale_units jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_sku text;
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

  if exists (
    select 1
    from public.products p
    where p.tenant_id = input_tenant_id
      and (
        public.normalize_product_code(p.sku) = clean_sku
        or public.normalize_product_code(p.barcode) = clean_sku
      )
  ) or exists (
    select 1
    from public.product_sale_units psu
    where psu.tenant_id = input_tenant_id
      and public.normalize_product_code(psu.barcode) = clean_sku
  ) then
    raise exception 'PRODUCT_SKU_CONFLICT';
  end if;

  if clean_barcode is not null and (
    exists (
      select 1
      from public.products p
      where p.tenant_id = input_tenant_id
        and (
          public.normalize_product_code(p.sku) = clean_barcode
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
      and (psu.barcode = clean_sku or psu.barcode = clean_barcode)
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
  set is_default = psu.row_number = default_row_number;

  insert into public.products (
    tenant_id,
    sku,
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
) from public;
revoke execute on function public.create_product_atomic(
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
) from anon;
revoke execute on function public.create_product_atomic(
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
) from authenticated;
grant execute on function public.create_product_atomic(
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
) to service_role;

drop function if exists public.stock_barcode_diagnostics(uuid, uuid);

create function public.stock_barcode_diagnostics(
  input_tenant_id uuid,
  input_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
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

  return jsonb_build_object(
    'tenant_id',
    input_tenant_id,
    'generated_at',
    now(),
    'counts',
    jsonb_build_object(
      'products_total',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id),
      'products_active',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id and p.active = true),
      'products_inactive',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id and p.active = false),
      'products_with_stock',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id and p.active = true and p.stock_quantity > 0),
      'products_without_stock',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id and p.active = true and p.stock_quantity <= 0),
      'products_with_product_barcode',
      (select count(*) from public.products p where p.tenant_id = input_tenant_id and nullif(public.normalize_product_code(p.barcode), '') is not null),
      'active_sale_units',
      (select count(*) from public.product_sale_units psu where psu.tenant_id = input_tenant_id and psu.active = true),
      'active_sale_units_with_barcode',
      (select count(*) from public.product_sale_units psu where psu.tenant_id = input_tenant_id and psu.active = true and nullif(public.normalize_product_code(psu.barcode), '') is not null)
    ),
    'duplicates',
    jsonb_build_object(
      'product_barcodes',
      coalesce((
        select jsonb_agg(row_to_json(duplicate_row))
        from (
          select
            public.normalize_product_code(p.barcode) as code,
            count(*)::int as source_count,
            count(distinct p.id)::int as product_count,
            jsonb_agg(jsonb_build_object('product_id', p.id, 'sku', p.sku, 'active', p.active) order by p.sku) as products
          from public.products p
          where p.tenant_id = input_tenant_id
            and nullif(public.normalize_product_code(p.barcode), '') is not null
          group by public.normalize_product_code(p.barcode)
          having count(*) > 1
          order by count(*) desc, code asc
          limit 50
        ) duplicate_row
      ), '[]'::jsonb),
      'sale_unit_barcodes',
      coalesce((
        select jsonb_agg(row_to_json(duplicate_row))
        from (
          select
            public.normalize_product_code(psu.barcode) as code,
            count(*)::int as source_count,
            count(distinct psu.product_id)::int as product_count,
            jsonb_agg(jsonb_build_object('product_id', psu.product_id, 'sale_unit_id', psu.id, 'active', psu.active) order by psu.product_id::text) as sale_units
          from public.product_sale_units psu
          where psu.tenant_id = input_tenant_id
            and nullif(public.normalize_product_code(psu.barcode), '') is not null
          group by public.normalize_product_code(psu.barcode)
          having count(*) > 1
          order by count(*) desc, code asc
          limit 50
        ) duplicate_row
      ), '[]'::jsonb),
      'codes_across_sources',
      coalesce((
        with codes as (
          select
            public.normalize_product_code(p.sku) as code,
            p.id as product_id,
            'product_sku'::text as source,
            p.active as active
          from public.products p
          where p.tenant_id = input_tenant_id

          union all

          select
            public.normalize_product_code(p.barcode) as code,
            p.id as product_id,
            'product_barcode'::text as source,
            p.active as active
          from public.products p
          where p.tenant_id = input_tenant_id
            and nullif(public.normalize_product_code(p.barcode), '') is not null

          union all

          select
            public.normalize_product_code(psu.barcode) as code,
            psu.product_id as product_id,
            'sale_unit_barcode'::text as source,
            psu.active as active
          from public.product_sale_units psu
          where psu.tenant_id = input_tenant_id
            and nullif(public.normalize_product_code(psu.barcode), '') is not null
        )
        select jsonb_agg(row_to_json(collision_row))
        from (
          select
            codes.code,
            count(*)::int as source_count,
            count(distinct codes.product_id)::int as product_count,
            jsonb_agg(jsonb_build_object('product_id', codes.product_id, 'source', codes.source, 'active', codes.active) order by codes.source) as sources
          from codes
          where codes.code <> ''
          group by codes.code
          having count(*) > 1
          order by count(distinct codes.product_id) desc, count(*) desc, codes.code asc
          limit 50
        ) collision_row
      ), '[]'::jsonb)
    ),
    'products_without_default_sale_unit',
    coalesce((
      select jsonb_agg(row_to_json(missing_row))
      from (
        select p.id, p.sku, p.name, p.active
        from public.products p
        where p.tenant_id = input_tenant_id
          and not exists (
            select 1
            from public.product_sale_units psu
            where psu.tenant_id = input_tenant_id
              and psu.product_id = p.id
              and psu.active = true
              and psu.is_default = true
          )
        order by p.updated_at desc
        limit 100
      ) missing_row
    ), '[]'::jsonb),
    'recent_products',
    coalesce((
      select jsonb_agg(row_to_json(recent_row))
      from (
        select
          p.id,
          p.sku,
          p.barcode,
          p.name,
          p.stock_quantity,
          p.active,
          p.created_at,
          p.updated_at
        from public.products p
        where p.tenant_id = input_tenant_id
        order by p.created_at desc
        limit 20
      ) recent_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.stock_barcode_diagnostics(uuid, uuid) from public;
revoke execute on function public.stock_barcode_diagnostics(uuid, uuid) from anon;
revoke execute on function public.stock_barcode_diagnostics(uuid, uuid) from authenticated;
grant execute on function public.stock_barcode_diagnostics(uuid, uuid) to service_role;
