create or replace function public.search_products(
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
