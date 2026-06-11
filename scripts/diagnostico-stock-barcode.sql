-- Diagnostico read-only de Stock / Codigo de barras.
-- Reemplazar los valores de params antes de ejecutar.
-- No contiene UPDATE, DELETE, INSERT ni operaciones destructivas.

with params as (
  select
    'REEMPLAZAR_TENANT_ID'::uuid as tenant_id,
    nullif(public.normalize_product_code(''), '') as codigo
)
select
  t.id as tenant_id,
  t.slug,
  t.name,
  count(p.id) as products_total,
  count(p.id) filter (where p.active = true) as products_active,
  count(p.id) filter (where p.active = false) as products_inactive,
  count(p.id) filter (where p.active = true and p.stock_quantity > 0) as products_with_stock,
  count(p.id) filter (where p.active = true and p.stock_quantity <= 0) as products_without_stock
from params
join public.tenants t on t.id = params.tenant_id
left join public.products p on p.tenant_id = t.id
group by t.id, t.slug, t.name;

with params as (
  select
    'REEMPLAZAR_TENANT_ID'::uuid as tenant_id,
    nullif(public.normalize_product_code('REEMPLAZAR_CODIGO_OPCIONAL'), '') as codigo
),
matches as (
  select
    p.id as product_id,
    p.sku,
    p.barcode,
    p.name,
    p.stock_quantity,
    p.active,
    'product_sku' as source,
    p.sku as source_code
  from params
  join public.products p on p.tenant_id = params.tenant_id
  where params.codigo is not null
    and public.normalize_product_code(p.sku) = params.codigo

  union all

  select
    p.id as product_id,
    p.sku,
    p.barcode,
    p.name,
    p.stock_quantity,
    p.active,
    'product_barcode' as source,
    p.barcode as source_code
  from params
  join public.products p on p.tenant_id = params.tenant_id
  where params.codigo is not null
    and public.normalize_product_code(p.barcode) = params.codigo

  union all

  select
    p.id as product_id,
    p.sku,
    p.barcode,
    p.name,
    p.stock_quantity,
    (p.active and psu.active) as active,
    'sale_unit_barcode' as source,
    psu.barcode as source_code
  from params
  join public.product_sale_units psu on psu.tenant_id = params.tenant_id
  join public.products p on p.tenant_id = psu.tenant_id and p.id = psu.product_id
  where params.codigo is not null
    and public.normalize_product_code(psu.barcode) = params.codigo
)
select *
from matches
order by active desc, source asc, sku asc;

with params as (
  select 'REEMPLAZAR_TENANT_ID'::uuid as tenant_id
),
codes as (
  select
    public.normalize_product_code(p.sku) as code,
    p.id as product_id,
    p.sku,
    p.name,
    p.active,
    'product_sku' as source
  from params
  join public.products p on p.tenant_id = params.tenant_id

  union all

  select
    public.normalize_product_code(p.barcode) as code,
    p.id as product_id,
    p.sku,
    p.name,
    p.active,
    'product_barcode' as source
  from params
  join public.products p on p.tenant_id = params.tenant_id
  where nullif(public.normalize_product_code(p.barcode), '') is not null

  union all

  select
    public.normalize_product_code(psu.barcode) as code,
    p.id as product_id,
    p.sku,
    p.name,
    (p.active and psu.active) as active,
    'sale_unit_barcode' as source
  from params
  join public.product_sale_units psu on psu.tenant_id = params.tenant_id
  join public.products p on p.tenant_id = psu.tenant_id and p.id = psu.product_id
  where nullif(public.normalize_product_code(psu.barcode), '') is not null
)
select
  code,
  count(*) as source_count,
  count(distinct product_id) as product_count,
  jsonb_agg(
    jsonb_build_object(
      'product_id', product_id,
      'sku', sku,
      'name', name,
      'source', source,
      'active', active
    )
    order by source, sku
  ) as sources
from codes
where code <> ''
group by code
having count(*) > 1
order by count(distinct product_id) desc, count(*) desc, code asc
limit 100;

with params as (
  select 'REEMPLAZAR_TENANT_ID'::uuid as tenant_id
)
select
  p.id,
  p.sku,
  p.barcode,
  p.name,
  p.stock_quantity,
  p.active,
  p.created_at,
  p.updated_at
from params
join public.products p on p.tenant_id = params.tenant_id
order by p.created_at desc
limit 50;
