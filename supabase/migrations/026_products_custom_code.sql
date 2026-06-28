alter table public.products
add column if not exists custom_code text;

create unique index if not exists idx_products_tenant_custom_code_unique
on public.products (tenant_id, public.normalize_product_code(custom_code))
where nullif(public.normalize_product_code(custom_code), '') is not null;
