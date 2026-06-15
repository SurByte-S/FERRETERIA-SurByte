create or replace function public.create_product_atomic(
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
  set is_default = psu.row_number = default_row_number
  where psu.is_default is distinct from (psu.row_number = default_row_number);

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
