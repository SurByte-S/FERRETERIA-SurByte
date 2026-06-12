do $$
begin
  create type public.purchase_receipt_status as enum (
    'draft',
    'needs_review',
    'confirmed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.purchase_receipt_item_decision as enum (
    'match_existing',
    'create_new',
    'choose_other',
    'ignore'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_sku text,
  normalized_supplier_sku text,
  last_cost_without_tax numeric(14,2),
  last_cost_with_tax numeric(14,2),
  last_purchase_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, supplier_id)
);

alter table public.product_suppliers
  add column if not exists supplier_sku text,
  add column if not exists normalized_supplier_sku text,
  add column if not exists last_cost_without_tax numeric(14,2),
  add column if not exists last_cost_with_tax numeric(14,2),
  add column if not exists last_purchase_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.product_suppliers
set normalized_supplier_sku = nullif(public.normalize_product_code(supplier_sku), '')
where supplier_sku is not null
  and (normalized_supplier_sku is null or normalized_supplier_sku = '');

create unique index if not exists idx_product_suppliers_supplier_sku_unique
on public.product_suppliers (tenant_id, supplier_id, normalized_supplier_sku)
where normalized_supplier_sku is not null;

create index if not exists idx_product_suppliers_tenant_product
on public.product_suppliers (tenant_id, product_id);

create index if not exists idx_product_suppliers_tenant_supplier
on public.product_suppliers (tenant_id, supplier_id);

drop trigger if exists trg_product_suppliers_updated_at on public.product_suppliers;
create trigger trg_product_suppliers_updated_at
before update on public.product_suppliers
for each row execute function public.set_updated_at();

create table if not exists public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  document_number text not null,
  status public.purchase_receipt_status not null default 'draft',
  source_name text,
  total_quantity numeric(14,3) not null default 0,
  subtotal numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, supplier_id, document_number),
  constraint purchase_receipts_document_not_blank check (btrim(document_number) <> '')
);

alter table public.purchase_receipts
  add column if not exists source_name text,
  add column if not exists total_quantity numeric(14,3) not null default 0,
  add column if not exists subtotal numeric(14,2) not null default 0,
  add column if not exists total_amount numeric(14,2) not null default 0,
  add column if not exists notes text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_by uuid references auth.users(id) on delete set null,
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_purchase_receipts_tenant_created
on public.purchase_receipts (tenant_id, created_at desc);

create index if not exists idx_purchase_receipts_tenant_status
on public.purchase_receipts (tenant_id, status, created_at desc);

create index if not exists idx_purchase_receipts_tenant_supplier
on public.purchase_receipts (tenant_id, supplier_id, created_at desc);

drop trigger if exists trg_purchase_receipts_updated_at on public.purchase_receipts;
create trigger trg_purchase_receipts_updated_at
before update on public.purchase_receipts
for each row execute function public.set_updated_at();

create table if not exists public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  line_number int not null,
  product_id uuid references public.products(id) on delete set null,
  supplier_sku text,
  barcode text,
  sku text,
  description text not null,
  normalized_name text,
  quantity numeric(14,3) not null,
  unit_cost_without_tax numeric(14,2),
  unit_cost_with_tax numeric(14,2),
  line_total numeric(14,2),
  decision public.purchase_receipt_item_decision not null default 'match_existing',
  match_method text,
  match_confidence numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, receipt_id, line_number),
  constraint purchase_receipt_items_quantity_positive check (quantity > 0),
  constraint purchase_receipt_items_cost_non_negative check (
    coalesce(unit_cost_without_tax, 0) >= 0
    and coalesce(unit_cost_with_tax, 0) >= 0
    and coalesce(line_total, 0) >= 0
  )
);

alter table public.purchase_receipt_items
  add column if not exists supplier_sku text,
  add column if not exists barcode text,
  add column if not exists sku text,
  add column if not exists normalized_name text,
  add column if not exists unit_cost_without_tax numeric(14,2),
  add column if not exists unit_cost_with_tax numeric(14,2),
  add column if not exists line_total numeric(14,2),
  add column if not exists decision public.purchase_receipt_item_decision not null default 'match_existing',
  add column if not exists match_method text,
  add column if not exists match_confidence numeric(5,2),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_purchase_receipt_items_tenant_receipt
on public.purchase_receipt_items (tenant_id, receipt_id, line_number);

create index if not exists idx_purchase_receipt_items_tenant_product
on public.purchase_receipt_items (tenant_id, product_id);

drop trigger if exists trg_purchase_receipt_items_updated_at on public.purchase_receipt_items;
create trigger trg_purchase_receipt_items_updated_at
before update on public.purchase_receipt_items
for each row execute function public.set_updated_at();

alter table public.product_suppliers enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

grant select, insert, update, delete on
  public.product_suppliers,
  public.purchase_receipts,
  public.purchase_receipt_items
to authenticated;

grant select, insert, update, delete on
  public.product_suppliers,
  public.purchase_receipts,
  public.purchase_receipt_items
to service_role;

drop policy if exists "members read product_suppliers" on public.product_suppliers;
create policy "members read product_suppliers"
on public.product_suppliers for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage product_suppliers" on public.product_suppliers;
create policy "admins manage product_suppliers"
on public.product_suppliers for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

drop policy if exists "members read purchase_receipts" on public.purchase_receipts;
create policy "members read purchase_receipts"
on public.purchase_receipts for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage purchase_receipts" on public.purchase_receipts;
create policy "admins manage purchase_receipts"
on public.purchase_receipts for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

drop policy if exists "members read purchase_receipt_items" on public.purchase_receipt_items;
create policy "members read purchase_receipt_items"
on public.purchase_receipt_items for select
to authenticated
using (public.is_tenant_member(tenant_id));

drop policy if exists "admins manage purchase_receipt_items" on public.purchase_receipt_items;
create policy "admins manage purchase_receipt_items"
on public.purchase_receipt_items for all
to authenticated
using (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]))
with check (public.has_tenant_role(tenant_id, array['owner','admin']::public.tenant_role[]));

drop function if exists public.confirm_reviewed_purchase_import(uuid, uuid, text, text, text, jsonb);

create function public.confirm_reviewed_purchase_import(
  input_tenant_id uuid,
  input_user_id uuid,
  input_supplier_name text,
  input_document_number text,
  input_source_name text,
  input_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_supplier_name text;
  clean_document_number text;
  v_receipt_id uuid;
  v_supplier_id uuid;
  item record;
  v_product_id uuid;
  item_sku text;
  item_barcode text;
  item_supplier_sku text;
  item_quantity numeric(14,3);
  item_cost numeric(14,2);
  item_total numeric(14,2);
begin
  clean_supplier_name := nullif(btrim(coalesce(input_supplier_name, '')), '');
  clean_document_number := nullif(btrim(coalesce(input_document_number, '')), '');

  if input_tenant_id is null
    or input_user_id is null
    or clean_supplier_name is null
    or clean_document_number is null
    or input_items is null
    or jsonb_typeof(input_items) <> 'array'
    or jsonb_array_length(input_items) = 0 then
    raise exception 'PURCHASE_IMPORT_INVALID';
  end if;

  if not exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = input_tenant_id
      and tm.user_id = input_user_id
      and tm.active = true
      and tm.role = any(array['owner', 'admin']::public.tenant_role[])
  ) then
    raise exception 'TENANT_FORBIDDEN';
  end if;

  insert into public.suppliers (tenant_id, name)
  values (input_tenant_id, clean_supplier_name)
  on conflict (tenant_id, name) do update set name = excluded.name
  returning id into v_supplier_id;

  if exists (
    select 1
    from public.purchase_receipts pr
    where pr.tenant_id = input_tenant_id
      and pr.supplier_id = v_supplier_id
      and pr.document_number = clean_document_number
      and pr.status = 'confirmed'::public.purchase_receipt_status
  ) then
    raise exception 'PURCHASE_RECEIPT_ALREADY_CONFIRMED';
  end if;

  insert into public.purchase_receipts (
    tenant_id,
    supplier_id,
    document_number,
    status,
    source_name,
    created_by,
    reviewed_by,
    confirmed_by,
    confirmed_at
  )
  values (
    input_tenant_id,
    v_supplier_id,
    clean_document_number,
    'confirmed'::public.purchase_receipt_status,
    nullif(btrim(coalesce(input_source_name, '')), ''),
    input_user_id,
    input_user_id,
    input_user_id,
    now()
  )
  on conflict (tenant_id, supplier_id, document_number) do update set
    status = case
      when public.purchase_receipts.status = 'confirmed'::public.purchase_receipt_status
        then public.purchase_receipts.status
      else excluded.status
    end,
    source_name = excluded.source_name,
    reviewed_by = excluded.reviewed_by,
    confirmed_by = excluded.confirmed_by,
    confirmed_at = excluded.confirmed_at
  returning id into v_receipt_id;

  delete from public.purchase_receipt_items
  where tenant_id = input_tenant_id
    and receipt_id = v_receipt_id;

  for item in
    select *
    from jsonb_to_recordset(input_items) as row(
      line_number int,
      decision text,
      product_id uuid,
      sku text,
      barcode text,
      supplier_sku text,
      description text,
      normalized_name text,
      quantity numeric,
      unit_cost_without_tax numeric,
      unit_cost_with_tax numeric,
      line_total numeric
    )
  loop
    if item.decision = 'ignore' then
      continue;
    end if;

    item_quantity := coalesce(item.quantity, 0);
    item_cost := coalesce(item.unit_cost_with_tax, item.unit_cost_without_tax, 0);
    item_total := coalesce(item.line_total, item_quantity * item_cost);
    item_sku := public.normalize_product_code(coalesce(item.sku, item.supplier_sku, ''));
    item_barcode := nullif(public.normalize_product_code(item.barcode), '');
    item_supplier_sku := nullif(public.normalize_product_code(item.supplier_sku), '');

    if item_quantity <= 0 or item_cost < 0 or nullif(btrim(coalesce(item.description, '')), '') is null then
      raise exception 'PURCHASE_ITEM_INVALID';
    end if;

    if item.decision in ('match_existing', 'choose_other') then
      if item.product_id is null then
        raise exception 'PURCHASE_ITEM_PRODUCT_REQUIRED';
      end if;

      select p.id
        into v_product_id
      from public.products p
      where p.tenant_id = input_tenant_id
        and p.id = item.product_id
        and p.active = true
      for update;

      if not found then
        raise exception 'PURCHASE_ITEM_PRODUCT_NOT_FOUND';
      end if;
    elsif item.decision = 'create_new' then
      if item_sku = '' then
        raise exception 'PURCHASE_ITEM_SKU_REQUIRED';
      end if;

      if exists (
        select 1
        from public.products p
        where p.tenant_id = input_tenant_id
          and (
            public.normalize_product_code(p.sku) = item_sku
            or public.normalize_product_code(p.barcode) = item_sku
            or (item_barcode is not null and public.normalize_product_code(p.sku) = item_barcode)
            or (item_barcode is not null and public.normalize_product_code(p.barcode) = item_barcode)
          )
      ) or exists (
        select 1
        from public.product_sale_units psu
        where psu.tenant_id = input_tenant_id
          and item_barcode is not null
          and public.normalize_product_code(psu.barcode) = item_barcode
      ) then
        raise exception 'PURCHASE_ITEM_CODE_CONFLICT';
      end if;

      insert into public.products (
        tenant_id,
        sku,
        barcode,
        name,
        normalized_name,
        description,
        supplier_id,
        unit,
        cost_without_tax,
        cost_with_tax,
        sale_price,
        tax_rate,
        stock_quantity,
        min_stock,
        active
      )
      values (
        input_tenant_id,
        item_sku,
        item_barcode,
        btrim(item.description),
        coalesce(nullif(btrim(item.normalized_name), ''), lower(btrim(item.description))),
        btrim(item.description),
        supplier_id,
        'unidad',
        item.unit_cost_without_tax,
        item.unit_cost_with_tax,
        null,
        21,
        0,
        0,
        true
      )
      returning id into v_product_id;

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
      values (
        input_tenant_id,
        v_product_id,
        'Unidad',
        1,
        0,
        null,
        true,
        true
      );
    else
      raise exception 'PURCHASE_ITEM_DECISION_INVALID';
    end if;

    insert into public.purchase_receipt_items (
      tenant_id,
      receipt_id,
      line_number,
      product_id,
      supplier_sku,
      barcode,
      sku,
      description,
      normalized_name,
      quantity,
      unit_cost_without_tax,
      unit_cost_with_tax,
      line_total,
      decision
    )
    values (
      input_tenant_id,
      v_receipt_id,
      item.line_number,
      v_product_id,
      item_supplier_sku,
      item_barcode,
      item_sku,
      btrim(item.description),
      coalesce(nullif(btrim(item.normalized_name), ''), lower(btrim(item.description))),
      item_quantity,
      item.unit_cost_without_tax,
      item.unit_cost_with_tax,
      item_total,
      item.decision::public.purchase_receipt_item_decision
    );

    update public.products
    set
      supplier_id = coalesce(v_supplier_id, public.products.supplier_id),
      cost_without_tax = coalesce(item.unit_cost_without_tax, public.products.cost_without_tax),
      cost_with_tax = coalesce(item.unit_cost_with_tax, public.products.cost_with_tax),
      stock_quantity = public.products.stock_quantity + item_quantity,
      updated_at = now()
    where tenant_id = input_tenant_id
      and id = v_product_id;

    insert into public.inventory_movements (
      tenant_id,
      product_id,
      movement_type,
      quantity,
      unit_cost,
      notes,
      created_by
    )
    values (
      input_tenant_id,
      v_product_id,
      'purchase'::public.inventory_movement_type,
      item_quantity,
      item_cost,
      'Compra ' || clean_supplier_name || ' ' || clean_document_number,
      input_user_id
    );

    insert into public.product_suppliers (
      tenant_id,
      product_id,
      supplier_id,
      supplier_sku,
      normalized_supplier_sku,
      last_cost_without_tax,
      last_cost_with_tax,
      last_purchase_at
    )
    values (
      input_tenant_id,
      v_product_id,
      v_supplier_id,
      item_supplier_sku,
      item_supplier_sku,
      item.unit_cost_without_tax,
      item.unit_cost_with_tax,
      now()
    )
    on conflict (tenant_id, product_id, supplier_id) do update set
      supplier_sku = coalesce(excluded.supplier_sku, public.product_suppliers.supplier_sku),
      normalized_supplier_sku = coalesce(excluded.normalized_supplier_sku, public.product_suppliers.normalized_supplier_sku),
      last_cost_without_tax = excluded.last_cost_without_tax,
      last_cost_with_tax = excluded.last_cost_with_tax,
      last_purchase_at = excluded.last_purchase_at,
      updated_at = now();
  end loop;

  update public.purchase_receipts pr
  set
    total_quantity = coalesce((
      select sum(i.quantity)
      from public.purchase_receipt_items i
      where i.tenant_id = input_tenant_id
        and i.receipt_id = pr.id
    ), 0),
    subtotal = coalesce((
      select sum(i.quantity * coalesce(i.unit_cost_without_tax, i.unit_cost_with_tax, 0))
      from public.purchase_receipt_items i
      where i.tenant_id = input_tenant_id
        and i.receipt_id = pr.id
    ), 0),
    total_amount = coalesce((
      select sum(coalesce(i.line_total, i.quantity * coalesce(i.unit_cost_with_tax, i.unit_cost_without_tax, 0)))
      from public.purchase_receipt_items i
      where i.tenant_id = input_tenant_id
        and i.receipt_id = pr.id
    ), 0),
    updated_at = now()
  where pr.tenant_id = input_tenant_id
    and pr.id = v_receipt_id;

  return v_receipt_id;
end;
$$;

revoke execute on function public.confirm_reviewed_purchase_import(uuid, uuid, text, text, text, jsonb) from public;
revoke execute on function public.confirm_reviewed_purchase_import(uuid, uuid, text, text, text, jsonb) from anon;
revoke execute on function public.confirm_reviewed_purchase_import(uuid, uuid, text, text, text, jsonb) from authenticated;
grant execute on function public.confirm_reviewed_purchase_import(uuid, uuid, text, text, text, jsonb) to service_role;
