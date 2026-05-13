create or replace function public.create_quote_with_items(
  input_tenant_id uuid,
  input_customer_id uuid,
  input_customer_name text,
  input_customer_phone text,
  input_customer_email text,
  input_customer_address text,
  input_items jsonb,
  input_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  final_customer_id uuid;
  created_quote_id uuid;
  clean_customer_name text;
  clean_notes text;
  item_count integer;
  subtotal_amount numeric(14,2);
begin
  if input_tenant_id is null or not exists (
    select 1
    from public.tenants
    where id = input_tenant_id
  ) then
    raise exception 'TENANT_NOT_FOUND';
  end if;

  if input_items is null or jsonb_typeof(input_items) <> 'array' then
    raise exception 'QUOTE_WITHOUT_ITEMS';
  end if;

  select jsonb_array_length(input_items) into item_count;

  if item_count = 0 then
    raise exception 'QUOTE_WITHOUT_ITEMS';
  end if;

  clean_customer_name := trim(coalesce(input_customer_name, ''));
  clean_notes := nullif(trim(coalesce(input_notes, '')), '');

  drop table if exists pg_temp.quote_input_items;
  create temporary table quote_input_items on commit drop as
  select
    row_number() over () as line_number,
    case
      when trim(coalesce(item ->> 'product_id', '')) = '' then null
      when trim(coalesce(item ->> 'product_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then trim(item ->> 'product_id')::uuid
      else null
    end as product_id,
    nullif(trim(coalesce(item ->> 'sku', '')), '') as sku,
    coalesce(nullif(item ->> 'quantity', '')::numeric, 0) as quantity
  from jsonb_array_elements(input_items) as item;

  if exists (
    select 1
    from pg_temp.quote_input_items
    where quantity <= 0
      or (product_id is null and sku is null)
  ) then
    raise exception 'QUOTE_ITEMS_INVALID';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_items) as item
    where trim(coalesce(item ->> 'product_id', '')) <> ''
      and not (trim(item ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  ) then
    raise exception 'QUOTE_ITEMS_INVALID';
  end if;

  if input_customer_id is not null then
    select id
      into final_customer_id
    from public.customers
    where id = input_customer_id
      and tenant_id = input_tenant_id;

    if final_customer_id is null then
      raise exception 'CUSTOMER_NOT_FOUND';
    end if;
  elsif clean_customer_name <> '' then
    insert into public.customers (
      tenant_id,
      name,
      phone,
      email,
      address
    )
    values (
      input_tenant_id,
      clean_customer_name,
      nullif(trim(coalesce(input_customer_phone, '')), ''),
      nullif(trim(coalesce(input_customer_email, '')), ''),
      nullif(trim(coalesce(input_customer_address, '')), '')
    )
    returning id into final_customer_id;
  else
    final_customer_id := null;
  end if;

  drop table if exists pg_temp.quote_validated_items;
  create temporary table quote_validated_items on commit drop as
  select
    qi.line_number,
    p.id as product_id,
    p.sku,
    p.name,
    p.description,
    qi.quantity,
    coalesce(p.sale_price, 0)::numeric(14,2) as unit_price,
    (qi.quantity * coalesce(p.sale_price, 0))::numeric(14,2) as total
  from pg_temp.quote_input_items qi
  join public.products p
    on p.tenant_id = input_tenant_id
    and p.active = true
    and (
      (qi.product_id is not null and p.id = qi.product_id)
      or (qi.product_id is null and qi.sku is not null and p.sku = qi.sku)
    );

  if (
    select count(*)
    from pg_temp.quote_validated_items
  ) <> item_count then
    raise exception 'QUOTE_PRODUCTS_NOT_FOUND';
  end if;

  select coalesce(sum(total), 0)::numeric(14,2)
    into subtotal_amount
  from pg_temp.quote_validated_items;

  insert into public.quotes (
    tenant_id,
    customer_id,
    status,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    notes
  )
  values (
    input_tenant_id,
    final_customer_id,
    'draft',
    subtotal_amount,
    0,
    0,
    subtotal_amount,
    coalesce(clean_notes, 'Presupuesto creado desde mostrador')
  )
  returning id into created_quote_id;

  insert into public.quote_items (
    tenant_id,
    quote_id,
    product_id,
    sku,
    name,
    quantity,
    unit_price,
    discount_amount,
    total
  )
  select
    input_tenant_id,
    created_quote_id,
    product_id,
    sku,
    coalesce(description, name),
    quantity,
    unit_price,
    0,
    total
  from pg_temp.quote_validated_items
  order by line_number;

  return created_quote_id;
end;
$$;

revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from public;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from anon;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from authenticated;
grant execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) to service_role;
