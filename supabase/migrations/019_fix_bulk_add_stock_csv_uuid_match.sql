create or replace function public.bulk_add_stock_csv(
  input_tenant_id uuid,
  input_user_id uuid,
  input_source_name text,
  input_rows jsonb
)
returns table (
  batch_id uuid,
  updated_products int,
  total_quantity numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_source_name text;
  invalid_count int;
  not_found_count int;
  ambiguous_count int;
begin
  clean_source_name := nullif(trim(coalesce(input_source_name, '')), '');

  if jsonb_typeof(coalesce(input_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'STOCK_CSV_INVALID_ROWS';
  end if;

  drop table if exists pg_temp.stock_csv_rows;
  drop table if exists pg_temp.stock_csv_consolidated;
  drop table if exists pg_temp.stock_csv_matches;

  create temp table stock_csv_rows (
    row_number int not null,
    code text not null,
    quantity numeric(14,3)
  ) on commit drop;

  insert into stock_csv_rows (row_number, code, quantity)
  select
    item.ordinality::int,
    trim(coalesce(item.value ->> 'codigo', '')),
    case
      when trim(coalesce(item.value ->> 'cantidad', '')) ~ '^[0-9]+([.,][0-9]+)?$'
        then replace(trim(item.value ->> 'cantidad'), ',', '.')::numeric(14,3)
      else null
    end
  from jsonb_array_elements(coalesce(input_rows, '[]'::jsonb)) with ordinality as item(value, ordinality);

  select count(*)
    into invalid_count
  from stock_csv_rows
  where code = ''
    or quantity is null
    or quantity <= 0;

  if invalid_count > 0 then
    raise exception 'STOCK_CSV_INVALID_ROWS';
  end if;

  create temp table stock_csv_consolidated on commit drop as
  select
    code,
    sum(quantity)::numeric(14,3) as quantity
  from stock_csv_rows
  group by code;

  create temp table stock_csv_matches on commit drop as
  select
    consolidated.code,
    consolidated.quantity,
    coalesce(sku_product.id, barcode_product.product_id) as product_id,
    barcode_product.match_count as barcode_match_count,
    coalesce(sku_product.cost_with_tax, barcode_product.unit_cost) as unit_cost
  from stock_csv_consolidated consolidated
  left join public.products sku_product
    on sku_product.tenant_id = input_tenant_id
    and sku_product.sku = consolidated.code
  left join lateral (
    select
      (array_agg(product.id order by product.id::text))[1] as product_id,
      (array_agg(product.cost_with_tax order by product.id::text))[1] as unit_cost,
      count(*)::int as match_count
    from public.products product
    where product.tenant_id = input_tenant_id
      and product.barcode = consolidated.code
  ) barcode_product on sku_product.id is null;

  select count(*)
    into ambiguous_count
  from stock_csv_matches
  where product_id is null
    and barcode_match_count > 1;

  if ambiguous_count > 0 then
    raise exception 'STOCK_CSV_AMBIGUOUS_BARCODE';
  end if;

  select count(*)
    into not_found_count
  from stock_csv_matches
  where product_id is null;

  if not_found_count > 0 then
    raise exception 'STOCK_CSV_PRODUCT_NOT_FOUND';
  end if;

  insert into public.import_batches (
    tenant_id,
    source_name,
    imported_by,
    total_rows,
    valid_rows,
    invalid_rows,
    notes
  )
  values (
    input_tenant_id,
    coalesce(clean_source_name, 'stock.csv'),
    input_user_id,
    (select count(*) from stock_csv_rows),
    (select count(*) from stock_csv_consolidated),
    0,
    'Carga rapida de stock CSV'
  )
  returning id into batch_id;

  insert into public.inventory_movements (
    tenant_id,
    product_id,
    movement_type,
    quantity,
    unit_cost,
    notes,
    created_by
  )
  select
    input_tenant_id,
    matches.product_id,
    'purchase'::public.inventory_movement_type,
    matches.quantity,
    matches.unit_cost,
    'Carga rapida CSV: ' || coalesce(clean_source_name, 'stock.csv'),
    input_user_id
  from stock_csv_matches matches;

  update public.products product
  set
    stock_quantity = product.stock_quantity + matches.quantity,
    updated_at = now()
  from stock_csv_matches matches
  where product.id = matches.product_id
    and product.tenant_id = input_tenant_id;

  get diagnostics updated_products = row_count;

  select coalesce(sum(quantity), 0)
    into total_quantity
  from stock_csv_matches;

  return next;
end;
$$;

revoke execute on function public.bulk_add_stock_csv(uuid, uuid, text, jsonb) from public;
revoke execute on function public.bulk_add_stock_csv(uuid, uuid, text, jsonb) from anon;
revoke execute on function public.bulk_add_stock_csv(uuid, uuid, text, jsonb) from authenticated;
grant execute on function public.bulk_add_stock_csv(uuid, uuid, text, jsonb) to service_role;
