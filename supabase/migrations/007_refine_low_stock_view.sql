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
  and (
    stock_quantity <= 0
    or (min_stock > 0 and stock_quantity <= min_stock)
  );

grant select on public.low_stock_products to authenticated;
grant select on public.low_stock_products to service_role;
