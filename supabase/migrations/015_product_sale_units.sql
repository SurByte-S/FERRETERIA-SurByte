create table if not exists public.product_sale_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  quantity_in_base_unit numeric(14,3) not null default 1,
  sale_price numeric(14,2) not null default 0,
  barcode text null,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_sale_units_quantity_positive check (quantity_in_base_unit > 0),
  constraint product_sale_units_sale_price_non_negative check (sale_price >= 0),
  constraint product_sale_units_tenant_product_name_unique unique (tenant_id, product_id, name)
);

create index if not exists idx_product_sale_units_tenant_product
on public.product_sale_units (tenant_id, product_id);

create index if not exists idx_product_sale_units_tenant_barcode
on public.product_sale_units (tenant_id, barcode);

create unique index if not exists idx_product_sale_units_one_default
on public.product_sale_units (tenant_id, product_id)
where is_default = true and active = true;

drop trigger if exists trg_product_sale_units_updated_at on public.product_sale_units;
create trigger trg_product_sale_units_updated_at
before update on public.product_sale_units
for each row execute function public.set_updated_at();

alter table public.product_sale_units enable row level security;

grant select, insert, update, delete on public.product_sale_units to authenticated;

create policy "members read product_sale_units"
on public.product_sale_units for select
to authenticated
using (public.is_tenant_member(tenant_id));

create policy "admins manage product_sale_units"
on public.product_sale_units for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

insert into public.product_sale_units (
  tenant_id,
  product_id,
  name,
  quantity_in_base_unit,
  sale_price,
  barcode,
  is_default,
  active
)
select
  p.tenant_id,
  p.id,
  'Unidad',
  1,
  coalesce(p.sale_price, 0),
  null,
  true,
  true
from public.products p
where not exists (
  select 1
  from public.product_sale_units psu
  where psu.tenant_id = p.tenant_id
    and psu.product_id = p.id
);

alter table public.quote_items
  add column if not exists product_sale_unit_id uuid references public.product_sale_units(id) on delete set null,
  add column if not exists sale_unit_name text,
  add column if not exists quantity_in_base_unit numeric(14,3) not null default 1;

alter table public.sale_items
  add column if not exists product_sale_unit_id uuid references public.product_sale_units(id) on delete set null,
  add column if not exists sale_unit_name text,
  add column if not exists quantity_in_base_unit numeric(14,3) not null default 1;

create index if not exists idx_quote_items_tenant_sale_unit
on public.quote_items (tenant_id, product_sale_unit_id);

create index if not exists idx_sale_items_tenant_sale_unit
on public.sale_items (tenant_id, product_sale_unit_id);

drop function if exists public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text);

create function public.create_quote_with_items(
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

revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from public;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from anon;
revoke execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) from authenticated;
grant execute on function public.create_quote_with_items(uuid, uuid, text, text, text, text, jsonb, text) to service_role;

drop function if exists public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric);

create function public.convert_quote_to_sale(
  input_quote_id uuid,
  input_tenant_id uuid,
  input_customer_id uuid,
  input_payment_method text,
  input_paid_amount numeric
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
    quote_row.created_by
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

revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric) from public;
revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric) from anon;
revoke execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric) from authenticated;
grant execute on function public.convert_quote_to_sale(uuid, uuid, uuid, text, numeric) to service_role;

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
      lower(coalesce(p.sku, '')) as n_sku,
      lower(coalesce(p.barcode, '')) as n_barcode,
      lower(coalesce(p.normalized_name, p.name, '')) as n_name,
      lower(unaccent(coalesce(c.name, ''))) as n_category,
      lower(unaccent(coalesce(b.name, ''))) as n_brand,
      lower(coalesce(su.sale_unit_barcodes, '')) as n_sale_unit_barcodes,
      trim(
        lower(coalesce(p.sku, '')) || ' ' ||
        lower(coalesce(p.barcode, '')) || ' ' ||
        lower(coalesce(p.normalized_name, p.name, '')) || ' ' ||
        lower(unaccent(coalesce(c.name, ''))) || ' ' ||
        lower(unaccent(coalesce(b.name, ''))) || ' ' ||
        lower(coalesce(su.sale_unit_text, ''))
      ) as search_text
    from public.products p
    left join public.categories c on c.id = p.category_id and c.tenant_id = p.tenant_id
    left join public.brands b on b.id = p.brand_id and b.tenant_id = p.tenant_id
    left join lateral (
      select
        string_agg(coalesce(psu.barcode, ''), ' ') as sale_unit_barcodes,
        string_agg(coalesce(psu.name, '') || ' ' || coalesce(psu.barcode, ''), ' ') as sale_unit_text
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
        when base.n_sku = params.q or base.n_barcode = params.q or base.n_sale_unit_barcodes = params.q then 1
        when base.n_sale_unit_barcodes like '% ' || params.q || ' %'
          or base.n_sale_unit_barcodes like params.q || ' %'
          or base.n_sale_unit_barcodes like '% ' || params.q then 1
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
      end as score
    from base
    cross join params
    cross join terms
    where params.q is null
      or base.n_sku = params.q
      or base.n_barcode = params.q
      or base.n_sale_unit_barcodes = params.q
      or base.n_sale_unit_barcodes like '% ' || params.q || ' %'
      or base.n_sale_unit_barcodes like params.q || ' %'
      or base.n_sale_unit_barcodes like '% ' || params.q
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
