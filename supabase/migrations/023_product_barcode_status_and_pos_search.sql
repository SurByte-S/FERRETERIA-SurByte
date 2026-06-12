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
      public.normalize_product_code(p.barcode) as n_product_barcode_code,
      lower(coalesce(p.normalized_name, p.name, '')) as n_name,
      lower(unaccent(coalesce(c.name, ''))) as n_category,
      lower(unaccent(coalesce(b.name, ''))) as n_brand,
      lower(coalesce(su.sale_unit_barcodes, '')) as n_sale_unit_barcodes,
      su.exact_sale_unit_id,
      trim(
        public.normalize_product_search_text(
          coalesce(p.sku, '') || ' ' ||
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
            base.n_sku_code = params.code_q
            or base.n_product_barcode_code = params.code_q
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
        when params.code_q is not null and base.n_sku_code = params.code_q then 'sku'
        when params.code_q is not null
          and nullif(base.n_product_barcode_code, '') = params.code_q then 'product_barcode'
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
      or (params.code_q is not null and base.n_sku_code = params.code_q)
      or (params.code_q is not null and nullif(base.n_product_barcode_code, '') = params.code_q)
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
