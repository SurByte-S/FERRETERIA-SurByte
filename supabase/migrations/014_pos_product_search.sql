create schema if not exists extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.normalize_product_search_text(input_text text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  with raw as (
    select lower(unaccent(coalesce(input_text, ''))) as value
  ),
  inch_symbols as (
    select regexp_replace(value, '([0-9]+)\s*"', '\1 in ', 'g') as value
    from raw
  ),
  units as (
    select regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            value,
            '\m(pulgadas?|pulg|plg|inches|inch|in)\M',
            ' in ',
            'g'
          ),
          '\m(milimetros?|mms?)\M',
          ' mm ',
          'g'
        ),
        '\m(centimetros?|cms?)\M',
        ' cm ',
        'g'
      ),
      '\m(metros?|mts?)\M',
      ' m ',
      'g'
    ) as value
    from inch_symbols
  ),
  separators as (
    select regexp_replace(value, '([0-9])\s*(x|por|\*)\s*([0-9])', '\1 x \3', 'g') as value
    from units
  )
  select trim(regexp_replace(regexp_replace(value, '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
  from separators;
$$;

create index if not exists idx_products_pos_tenant_active_stock
on public.products (tenant_id, active, stock_quantity);

create index if not exists idx_products_pos_search_trgm
on public.products
using gin (
  public.normalize_product_search_text(
    coalesce(sku, '') || ' ' ||
    coalesce(barcode, '') || ' ' ||
    coalesce(name, '') || ' ' ||
    coalesce(normalized_name, '') || ' ' ||
    coalesce(description, '')
  ) gin_trgm_ops
);

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
      public.normalize_product_search_text(p.sku) as n_sku,
      public.normalize_product_search_text(p.barcode) as n_barcode,
      public.normalize_product_search_text(p.name) as n_name,
      public.normalize_product_search_text(p.normalized_name) as n_normalized_name,
      public.normalize_product_search_text(p.description) as n_description,
      public.normalize_product_search_text(c.name) as n_category,
      public.normalize_product_search_text(b.name) as n_brand,
      public.normalize_product_search_text(
        coalesce(p.sku, '') || ' ' ||
        coalesce(p.barcode, '') || ' ' ||
        coalesce(p.name, '') || ' ' ||
        coalesce(p.normalized_name, '') || ' ' ||
        coalesce(p.description, '') || ' ' ||
        coalesce(c.name, '') || ' ' ||
        coalesce(b.name, '')
      ) as haystack
    from public.products p
    left join public.categories c on c.id = p.category_id and c.tenant_id = p.tenant_id
    left join public.brands b on b.id = p.brand_id and b.tenant_id = p.tenant_id
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
        when base.n_sku = params.q or base.n_barcode = params.q then 1
        when base.n_name = params.q or base.n_normalized_name = params.q then 2
        when base.n_name like params.q || '%' or base.n_normalized_name like params.q || '%' then 3
        when array_length(terms.tokens, 1) > 0 and not exists (
          select 1
          from unnest(terms.tokens) as token
          where base.haystack not like '%' || token || '%'
        ) then 4
        when array_length(terms.tokens, 1) > 0 and exists (
          select 1
          from unnest(terms.tokens) as token
          where base.haystack like '%' || token || '%'
        ) then 5
        when base.n_category like '%' || params.q || '%' then 6
        else 7
      end as rank,
      case
        when params.q is null then 0::numeric
        else similarity(base.haystack, params.q)::numeric
      end as score
    from base
    cross join params
    cross join terms
    where params.q is null
      or base.n_sku = params.q
      or base.n_barcode = params.q
      or base.n_name = params.q
      or base.n_normalized_name = params.q
      or base.n_name like params.q || '%'
      or base.n_normalized_name like params.q || '%'
      or base.n_category like '%' || params.q || '%'
      or base.n_brand like '%' || params.q || '%'
      or (
        array_length(terms.tokens, 1) > 0
        and not exists (
          select 1
          from unnest(terms.tokens) as token
          where base.haystack not like '%' || token || '%'
        )
      )
      or (
        array_length(terms.tokens, 1) > 0
        and exists (
          select 1
          from unnest(terms.tokens) as token
          where base.haystack like '%' || token || '%'
        )
      )
      or similarity(base.haystack, params.q) >= 0.18
  ),
  counted as (
    select matched.*, count(*) over() as total_count
    from matched
  )
  select
    counted.id,
    counted.sku,
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
    counted.total_count
  from counted
  cross join params
  order by
    counted.rank asc,
    counted.score desc,
    counted.name asc,
    counted.sku asc
  limit params.limit_value
  offset params.offset_value;
$$;

revoke execute on function public.search_pos_products(uuid, text, int, int, boolean) from public;
revoke execute on function public.search_pos_products(uuid, text, int, int, boolean) from anon;
grant execute on function public.search_pos_products(uuid, text, int, int, boolean) to authenticated;
grant execute on function public.search_pos_products(uuid, text, int, int, boolean) to service_role;
