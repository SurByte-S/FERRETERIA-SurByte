create table if not exists public.cash_register_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid references auth.users(id),
  closed_by uuid references auth.users(id),
  opening_amount numeric(14,2) not null default 0,
  expected_cash_amount numeric(14,2) not null default 0,
  counted_cash_amount numeric(14,2),
  difference_amount numeric(14,2),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  notes text
);

alter table public.sales
  add column if not exists cash_session_id uuid references public.cash_register_sessions(id) on delete set null;

create index if not exists idx_cash_register_sessions_tenant_status
  on public.cash_register_sessions (tenant_id, status);

create index if not exists idx_cash_register_sessions_tenant_opened
  on public.cash_register_sessions (tenant_id, opened_at desc);

create unique index if not exists idx_cash_register_sessions_one_open
  on public.cash_register_sessions (tenant_id)
  where status = 'open';

create index if not exists idx_sales_tenant_cash_session
  on public.sales (tenant_id, cash_session_id);

alter table public.cash_register_sessions enable row level security;

drop policy if exists "members read cash register sessions" on public.cash_register_sessions;
create policy "members read cash register sessions"
  on public.cash_register_sessions
  for select
  to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists "seller creates cash register sessions" on public.cash_register_sessions;
create policy "seller creates cash register sessions"
  on public.cash_register_sessions
  for insert
  to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

drop policy if exists "seller updates cash register sessions" on public.cash_register_sessions;
create policy "seller updates cash register sessions"
  on public.cash_register_sessions
  for update
  to authenticated
  using (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]))
  with check (public.has_tenant_role(tenant_id, array['owner','admin','seller']::public.tenant_role[]));

create or replace function public.convert_quote_to_sale(
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
    -qi.quantity,
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
  from (
    select
      product_id,
      sum(quantity) as quantity
    from public.quote_items
    where tenant_id = input_tenant_id
      and quote_id = input_quote_id
      and product_id is not null
    group by product_id
  ) sold
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
