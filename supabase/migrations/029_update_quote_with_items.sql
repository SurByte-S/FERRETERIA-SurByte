alter table public.quotes
add column if not exists updated_at timestamptz not null default now();

drop function if exists public.update_quote_with_items(
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  uuid
);

create function public.update_quote_with_items(
  input_quote_id uuid,
  input_tenant_id uuid,
  input_customer_id uuid,
  input_customer_name text,
  input_customer_phone text,
  input_customer_email text,
  input_customer_address text,
  input_items jsonb,
  input_notes text,
  input_updated_by uuid default null
)
returns table (
  quote_id uuid,
  quote_number bigint,
  total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  final_customer_id uuid;
  clean_customer_name text;
  clean_notes text;
  item_count integer;
  subtotal_amount numeric(14,2);
begin
  if input_quote_id is null or input_tenant_id is null or input_updated_by is null then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = input_tenant_id
      and tm.user_id = input_updated_by
      and tm.active = true
      and tm.role = any(array['owner', 'admin', 'seller']::public.tenant_role[])
  ) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  select *
    into quote_row
  from public.quotes
  where id = input_quote_id
    and tenant_id = input_tenant_id
  for update;

  if not found then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  if quote_row.deleted_at is not null then
    raise exception 'QUOTE_NOT_FOUND';
  end if;

  if quote_row.status not in ('draft', 'issued') then
    raise exception 'QUOTE_NOT_EDITABLE';
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
    case
      when trim(coalesce(item ->> 'sale_unit_id', '')) = '' then null
      when trim(coalesce(item ->> 'sale_unit_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then trim(item ->> 'sale_unit_id')::uuid
      else null
    end as sale_unit_id,
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
    where (
      trim(coalesce(item ->> 'product_id', '')) <> ''
      and not (trim(item ->> 'product_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    ) or (
      trim(coalesce(item ->> 'sale_unit_id', '')) <> ''
      and not (trim(item ->> 'sale_unit_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
    )
  ) then
    raise exception 'QUOTE_ITEMS_INVALID';
  end if;

  if input_customer_id is not null then
    select id
      into final_customer_id
    from public.customers
    where id = input_customer_id
      and tenant_id = input_tenant_id
      and deleted_at is null;

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
    psu.id as product_sale_unit_id,
    coalesce(psu.name, 'Unidad') as sale_unit_name,
    coalesce(psu.quantity_in_base_unit, 1)::numeric(14,3) as quantity_in_base_unit,
    coalesce(psu.sale_price, p.sale_price, 0)::numeric(14,2) as unit_price,
    (qi.quantity * coalesce(psu.sale_price, p.sale_price, 0))::numeric(14,2) as total
  from pg_temp.quote_input_items qi
  join public.products p
    on p.tenant_id = input_tenant_id
    and p.active = true
    and (
      (qi.product_id is not null and p.id = qi.product_id)
      or (qi.product_id is null and qi.sku is not null and p.sku = qi.sku)
    )
  left join lateral (
    select su.*
    from public.product_sale_units su
    where su.tenant_id = input_tenant_id
      and su.product_id = p.id
      and su.active = true
      and (
        (qi.sale_unit_id is not null and su.id = qi.sale_unit_id)
        or (qi.sale_unit_id is null and su.is_default = true)
      )
    order by
      case when qi.sale_unit_id is not null and su.id = qi.sale_unit_id then 0 else 1 end,
      case when su.is_default then 0 else 1 end,
      su.created_at asc
    limit 1
  ) psu on true;

  if (
    select count(*)
    from pg_temp.quote_validated_items
  ) <> item_count then
    raise exception 'QUOTE_PRODUCTS_NOT_FOUND';
  end if;

  if exists (
    select 1
    from pg_temp.quote_input_items qi
    join pg_temp.quote_validated_items qv on qv.line_number = qi.line_number
    where qi.sale_unit_id is not null
      and qv.product_sale_unit_id is null
  ) then
    raise exception 'QUOTE_PRODUCTS_NOT_FOUND';
  end if;

  select coalesce(sum(total), 0)::numeric(14,2)
    into subtotal_amount
  from pg_temp.quote_validated_items;

  delete from public.quote_items
  where tenant_id = input_tenant_id
    and quote_id = input_quote_id;

  insert into public.quote_items (
    tenant_id,
    quote_id,
    product_id,
    product_sale_unit_id,
    sale_unit_name,
    quantity_in_base_unit,
    sku,
    name,
    quantity,
    unit_price,
    discount_amount,
    total
  )
  select
    input_tenant_id,
    input_quote_id,
    product_id,
    product_sale_unit_id,
    sale_unit_name,
    quantity_in_base_unit,
    sku,
    coalesce(description, name),
    quantity,
    unit_price,
    0,
    total
  from pg_temp.quote_validated_items
  order by line_number;

  update public.quotes
  set
    customer_id = final_customer_id,
    subtotal = subtotal_amount,
    discount_amount = 0,
    tax_amount = 0,
    total = subtotal_amount,
    notes = coalesce(clean_notes, notes),
    updated_at = now()
  where id = input_quote_id
    and tenant_id = input_tenant_id
  returning id, public.quotes.quote_number, public.quotes.total
    into quote_id, quote_number, total;

  return next;
end;
$$;

revoke execute on function public.update_quote_with_items(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) from public;
revoke execute on function public.update_quote_with_items(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) from anon;
revoke execute on function public.update_quote_with_items(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) from authenticated;
grant execute on function public.update_quote_with_items(uuid, uuid, uuid, text, text, text, text, jsonb, text, uuid) to service_role;
