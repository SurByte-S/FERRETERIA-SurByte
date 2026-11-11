-- Phase 038A: PREPARED ONLY. Do not apply independently of phase 038B.
-- Replaces only the update RPC from 037; 036 and creation/conversion stay intact.
-- JSON contract: existing lines send quote_item_id; new lines OMIT that key.
-- Explicit null/empty/malformed IDs are errors. Browser-supplied names are ignored.
--
-- REQUIRED COORDINATED ROLLOUT:
-- Disable quote editing server-side and drain in-flight edits on ALL app instances.
-- Apply this migration manually only when 038B is tested and ready; deploy 038B,
-- retire old server instances/endpoints, invalidate old editor sessions, and require
-- a fresh editor load before re-enabling editing. Do not use a rolling mixed rollout.
-- 038B must reject legacy edit requests before syncSelectedSaleUnitPrices writes.
-- No-ID legacy requests are indistinguishable here from legitimate all-new lines.
-- This RPC therefore does NOT provide a legacy-client gate by itself.
--
-- CONCURRENCY:
-- The existing quote FOR UPDATE lock serializes cooperating quote writers.
-- Delete/reinsert changes item IDs: a subsequent edit referencing old IDs fails.
-- All-new requests (or external writers that retain IDs) cannot detect every stale
-- edit with this contract. No general version check is introduced in this phase.
-- Reload item IDs after every successful update; never retry stale IDs as new.
--
-- 038B must prevalidate identity/duplicates/ownership/product before its existing
-- price synchronization. This cannot replace the locked validation in this RPC:
-- a race can still fail here after that separate price write has committed.
-- The RPC rolls back on exceptions (including customer inserts), but the entire
-- server action is NOT atomic. No exception handler swallows validation failures.
--
-- Keep signature, return, SECURITY DEFINER, search_path, ACLs and commercial logic.
-- No backfill, schema change, sale write or historical bulk-name update.
begin;

create or replace function public.update_quote_with_items(
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

  -- Absence means NEW. Explicit null, empty or non-string IDs are invalid.
  if exists (
    select 1
    from jsonb_array_elements(input_items) as item
    where item ? 'quote_item_id'
      and (
        jsonb_typeof(item -> 'quote_item_id') is distinct from 'string'
        or not (coalesce(item ->> 'quote_item_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      )
  ) then
    raise exception 'QUOTE_ITEM_ID_INVALID';
  end if;

  drop table if exists pg_temp.quote_input_items;
  create temporary table quote_input_items on commit drop as
  select
    input_row.ordinality::integer as line_number,
    (item ->> 'quote_item_id')::uuid as quote_item_id,
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
  from jsonb_array_elements(input_items) with ordinality as input_row(item, ordinality);

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

  if exists (
    select 1
    from pg_temp.quote_input_items
    where quote_item_id is not null
    group by quote_item_id
    having count(*) > 1
  ) then
    raise exception 'QUOTE_ITEM_ID_DUPLICATE';
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
    qi.quote_item_id,
    historical.id as matched_quote_item_id,
    case
      when qi.quote_item_id is null then p.name
      else historical.name
    end as item_name,
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
  -- Match only within the locked document and resolved product (ID or SKU).
  -- A changed presentation does not change the historical product name.
  left join public.quote_items historical
    on historical.id = qi.quote_item_id
    and historical.tenant_id = input_tenant_id
    and historical.quote_id = input_quote_id
    and historical.product_id = p.id
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

  -- Names are snapshotted before DELETE. Reject stale/foreign/wrong-product IDs.
  if exists (
    select 1
    from pg_temp.quote_validated_items
    where quote_item_id is not null
      and matched_quote_item_id is null
  ) then
    raise exception 'QUOTE_ITEM_ID_MISMATCH';
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
    total,
    sort_order
  )
  select
    input_tenant_id,
    input_quote_id,
    product_id,
    product_sale_unit_id,
    sale_unit_name,
    quantity_in_base_unit,
    sku,
    item_name,
    quantity,
    unit_price,
    0,
    total,
    line_number
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

commit;
