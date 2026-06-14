drop function if exists public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text);

create function public.create_quote_with_items(
  input_tenant_id uuid,
  input_customer_id uuid,
  input_customer_name text,
  input_customer_phone text,
  input_customer_email text,
  input_customer_address text,
  input_items jsonb,
  input_notes text,
  input_created_by uuid default null
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

  insert into public.quotes (
    tenant_id,
    customer_id,
    status,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    notes,
    created_by
  )
  values (
    input_tenant_id,
    final_customer_id,
    'draft',
    subtotal_amount,
    0,
    0,
    subtotal_amount,
    coalesce(clean_notes, 'Presupuesto creado desde mostrador'),
    input_created_by
  )
  returning id into created_quote_id;

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
    created_quote_id,
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

  return created_quote_id;
end;
$$;

revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text, uuid) from public;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text, uuid) from anon;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text, uuid) from authenticated;
grant execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text, uuid) to service_role;

drop function if exists public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric);

create function public.convert_quote_to_sale(
  input_quote_id uuid,
  input_tenant_id uuid,
  input_customer_id uuid,
  input_payment_method text,
  input_paid_amount numeric,
  input_created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  quote_row public.quotes%rowtype;
  created_sale_id uuid;
  open_cash_session_id uuid;
  clean_payment_method text;
  clean_paid_amount numeric(14,2);
  final_customer_id uuid;
  pending_amount numeric(14,2);
  item_count integer;
begin
  clean_payment_method := trim(coalesce(input_payment_method, ''));
  clean_paid_amount := coalesce(input_paid_amount, 0);

  if clean_payment_method not in ('Efectivo', 'Transferencia', 'Debito', 'Credito', 'Cuenta corriente') then
    raise exception 'PAYMENT_METHOD_INVALID';
  end if;

  if clean_paid_amount < 0 then
    raise exception 'PAID_AMOUNT_INVALID';
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

  if quote_row.status = 'converted' then
    raise exception 'QUOTE_ALREADY_CONVERTED';
  end if;

  select count(*)
    into item_count
  from public.quote_items
  where tenant_id = input_tenant_id
    and quote_id = input_quote_id;

  if item_count = 0 then
    raise exception 'QUOTE_WITHOUT_ITEMS';
  end if;

  final_customer_id := coalesce(input_customer_id, quote_row.customer_id);
  pending_amount := greatest(quote_row.total - clean_paid_amount, 0);

  if final_customer_id is not null and not exists (
    select 1
    from public.customers
    where id = final_customer_id
      and tenant_id = input_tenant_id
  ) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if clean_payment_method <> 'Cuenta corriente' and clean_paid_amount < quote_row.total then
    raise exception 'PAID_AMOUNT_TOO_LOW';
  end if;

  if clean_payment_method = 'Cuenta corriente' and pending_amount > 0 and final_customer_id is null then
    raise exception 'CUSTOMER_REQUIRED_FOR_CREDIT';
  end if;

  select id
    into open_cash_session_id
  from public.cash_register_sessions
  where tenant_id = input_tenant_id
    and status = 'open'
  order by opened_at desc
  limit 1;

  if open_cash_session_id is null then
    raise exception 'CASH_REGISTER_CLOSED';
  end if;

  drop table if exists pg_temp.sale_stock_items;
  create temporary table sale_stock_items on commit drop as
  select
    product_id,
    sum(quantity * quantity_in_base_unit)::numeric(14,3) as quantity
  from public.quote_items
  where tenant_id = input_tenant_id
    and quote_id = input_quote_id
    and product_id is not null
  group by product_id;

  perform 1
  from public.products p
  join pg_temp.sale_stock_items sold
    on sold.product_id = p.id
  where p.tenant_id = input_tenant_id
  for update of p;

  if exists (
    select 1
    from pg_temp.sale_stock_items sold
    left join public.products p
      on p.tenant_id = input_tenant_id
      and p.id = sold.product_id
    where p.id is null
      or p.active = false
      or p.stock_quantity < sold.quantity
  ) then
    raise exception 'STOCK_NOT_ENOUGH';
  end if;

  insert into public.sales (
    tenant_id,
    customer_id,
    cash_session_id,
    subtotal,
    discount_amount,
    tax_amount,
    total,
    paid_amount,
    payment_method,
    created_by
  )
  values (
    input_tenant_id,
    final_customer_id,
    open_cash_session_id,
    quote_row.subtotal,
    quote_row.discount_amount,
    quote_row.tax_amount,
    quote_row.total,
    clean_paid_amount,
    clean_payment_method,
    coalesce(quote_row.created_by, input_created_by)
  )
  returning id into created_sale_id;

  insert into public.sale_items (
    tenant_id,
    sale_id,
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
    tenant_id,
    created_sale_id,
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
  from public.quote_items
  where tenant_id = input_tenant_id
    and quote_id = input_quote_id;

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
    qi.tenant_id,
    qi.product_id,
    'sale'::public.inventory_movement_type,
    -(qi.quantity * qi.quantity_in_base_unit),
    p.cost_with_tax,
    'Venta generada desde presupuesto',
    quote_row.created_by
  from public.quote_items qi
  left join public.products p
    on p.tenant_id = qi.tenant_id
    and p.id = qi.product_id
  where qi.tenant_id = input_tenant_id
    and qi.quote_id = input_quote_id
    and qi.product_id is not null;

  update public.products p
  set
    stock_quantity = p.stock_quantity - sold.quantity,
    updated_at = now()
  from pg_temp.sale_stock_items sold
  where p.tenant_id = input_tenant_id
    and p.id = sold.product_id;

  if clean_payment_method = 'Cuenta corriente' and pending_amount > 0 then
    insert into public.customer_account_movements (
      tenant_id,
      customer_id,
      sale_id,
      movement_type,
      amount,
      notes,
      created_by
    )
    values (
      input_tenant_id,
      final_customer_id,
      created_sale_id,
      'debit',
      pending_amount,
      'Saldo pendiente de venta',
      quote_row.created_by
    );
  end if;

  update public.quotes
  set status = 'converted'
  where id = input_quote_id
    and tenant_id = input_tenant_id;

  return created_sale_id;
end;
$$;

revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric, uuid) from public;
revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric, uuid) from anon;
revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric, uuid) from authenticated;
grant execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric, uuid) to service_role;
