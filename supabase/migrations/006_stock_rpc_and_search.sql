create or replace function public.adjust_product_stock(
  input_product_id uuid,
  input_tenant_id uuid,
  input_new_stock numeric,
  input_notes text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  product_row public.products%rowtype;
  clean_notes text;
  clean_new_stock numeric(14,3);
  stock_difference numeric(14,3);
  movement public.inventory_movement_type;
begin
  clean_notes := trim(coalesce(input_notes, ''));
  clean_new_stock := coalesce(input_new_stock, 0);

  if clean_notes = '' then
    raise exception 'STOCK_NOTE_REQUIRED';
  end if;

  select *
    into product_row
  from public.products
  where id = input_product_id
    and tenant_id = input_tenant_id
  for update;

  if not found then
    raise exception 'PRODUCT_NOT_FOUND';
  end if;

  stock_difference := clean_new_stock - product_row.stock_quantity;
  movement := case
    when product_row.stock_quantity = 0 and clean_new_stock > 0 then 'initial'::public.inventory_movement_type
    else 'adjustment'::public.inventory_movement_type
  end;

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
    input_product_id,
    movement,
    stock_difference,
    product_row.cost_with_tax,
    clean_notes,
    null
  );

  update public.products
  set
    stock_quantity = clean_new_stock,
    updated_at = now()
  where id = input_product_id
    and tenant_id = input_tenant_id;

  return clean_new_stock;
end;
$$;

revoke execute on function public.adjust_product_stock(uuid, uuid, numeric, text) from public;
revoke execute on function public.adjust_product_stock(uuid, uuid, numeric, text) from anon;
revoke execute on function public.adjust_product_stock(uuid, uuid, numeric, text) from authenticated;
grant execute on function public.adjust_product_stock(uuid, uuid, numeric, text) to service_role;

create or replace view public.low_stock_products
with (security_invoker = true) as
select
  id,
  tenant_id,
  sku,
  name,
  stock_quantity,
  min_stock
from public.products
where active = true
  and stock_quantity <= min_stock;

grant select on public.low_stock_products to authenticated;
grant select on public.low_stock_products to service_role;

drop function if exists public.search_products(uuid, text, text, uuid, int, int);

create function public.search_products(
  search_tenant_id uuid,
  search_code text default '',
  search_name text default '',
  search_category_id uuid default null,
  page_size int default 100,
  page_offset int default 0
)
returns table (
  id uuid,
  sku text,
  barcode text,
  name text,
  description text,
  normalized_name text,
  unit text,
  cost_with_tax numeric,
  sale_price numeric,
  stock_quantity numeric,
  min_stock numeric,
  active boolean,
  image_url text,
  category_id uuid,
  category_name text,
  brand_id uuid,
  brand_name text,
  rank int,
  total_count bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with params as (
    select
      nullif(trim(search_code), '') as code,
      nullif(trim(search_name), '') as name_text
  ),
  ranked as (
    select
      p.id,
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.normalized_name,
      p.unit,
      p.cost_with_tax,
      p.sale_price,
      p.stock_quantity,
      p.min_stock,
      p.active,
      p.image_url,
      p.category_id,
      c.name as category_name,
      p.brand_id,
      b.name as brand_name,
      case
        when params.code is not null and (p.sku = params.code or p.barcode = params.code) then 1
        when params.code is not null and (p.sku ilike params.code || '%' or p.barcode ilike params.code || '%') then 2
        when params.name_text is not null and (
          p.name ilike params.name_text || '%'
          or p.normalized_name ilike params.name_text || '%'
          or p.description ilike params.name_text || '%'
          or b.name ilike params.name_text || '%'
        ) then 3
        else 4
      end as rank
    from public.products p
    left join public.categories c on c.id = p.category_id
    left join public.brands b on b.id = p.brand_id
    cross join params
    where p.tenant_id = search_tenant_id
      and (search_category_id is null or p.category_id = search_category_id)
      and (
        (params.code is null and params.name_text is null)
        or (
          params.code is not null
          and (p.sku ilike '%' || params.code || '%' or p.barcode ilike '%' || params.code || '%')
        )
        or (
          params.name_text is not null
          and (
            p.name ilike '%' || params.name_text || '%'
            or p.normalized_name ilike '%' || params.name_text || '%'
            or p.description ilike '%' || params.name_text || '%'
            or b.name ilike '%' || params.name_text || '%'
          )
        )
      )
  ),
  counted as (
    select ranked.*, count(*) over() as total_count
    from ranked
  )
  select *
  from counted
  order by rank asc, name asc, sku asc
  limit greatest(page_size, 1)
  offset greatest(page_offset, 0);
$$;

grant execute on function public.search_products(uuid, text, text, uuid, int, int) to authenticated;
grant execute on function public.search_products(uuid, text, text, uuid, int, int) to service_role;
