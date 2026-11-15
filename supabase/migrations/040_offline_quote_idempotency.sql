-- B.2: PREPARED ONLY. Do not apply automatically. No frontend or sync activation.
-- Requires 036 + 037 and the existing tenant/customer/quote schema (039 unchanged).
-- Two independent barriers: application roles have NO EXECUTE; new creation also
-- raises OFFLINE_QUOTE_SYNC_NOT_ENABLED, even if EXECUTE is accidentally granted.
-- B.3 must add commercial comparison/approval IN THIS TRANSACTION before replacing
-- that barrier. Granting EXECUTE alone must never activate incomplete creation.
-- See docs/checklists/CHECKLIST_OFFLINE_B2.md for contract, rollout and test limits.
begin;

do $$
begin
  if pg_catalog.to_regprocedure('public.create_quote_with_current_product_names(uuid,uuid,text,text,text,text,jsonb,text,uuid)') is null then
    raise exception 'OFFLINE_QUOTE_CREATION_DEPENDENCY_MISSING';
  end if;
  perform qi.sort_order from public.quote_items as qi limit 0;
end;
$$;

-- Append-only receipts. IDs intentionally have NO foreign keys/cascades:
-- deleting a quote, account or tenant must not erase the deduplication evidence,
-- nor should this infrastructure change existing deletion behavior. The RPC
-- validates current membership/tenant before accessing any receipt.
-- No client/application DML is granted; only the trusted function owner inserts.
create table public.offline_quote_operations (
  tenant_id uuid not null,
  local_operation_id uuid not null,
  owner_user_id uuid not null,
  contract_version integer not null check (contract_version > 0),
  command_fingerprint text not null check (command_fingerprint ~ '^[0-9a-f]{64}$'),
  remote_quote_id uuid not null,
  quote_number bigint not null,
  total numeric(14,2) not null,
  confirmed_at timestamptz not null,
  constraint offline_quote_operations_pkey primary key (tenant_id, local_operation_id),
  constraint offline_quote_operations_remote_quote_key unique (remote_quote_id)
);

alter table public.offline_quote_operations enable row level security;
-- No policies. service_role bypasses RLS, so explicit ACL revocation is essential.
revoke all on table public.offline_quote_operations from public, anon, authenticated, service_role;

create function public.confirm_offline_quote_operation(
  input_tenant_id uuid,
  input_local_operation_id uuid,
  input_owner_user_id uuid,
  input_authenticated_user_id uuid,
  input_contract_version integer,
  input_command jsonb
)
returns table (
  local_operation_id uuid,
  remote_quote_id uuid,
  quote_number bigint,
  total numeric,
  confirmed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  receipt public.offline_quote_operations%rowtype;
  customer_data jsonb;
  customer_key text;
  customer_id_value uuid;
  line_data jsonb;
  line_product_id uuid;
  line_sale_unit_id uuid;
  line_quantity numeric;
  normalized_items jsonb := '[]'::jsonb;
  normalized_customer jsonb;
  normalized_notes text;
  normalized_command jsonb;
  fingerprint text;
  created_quote_id uuid;
  uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  -- The authenticated actor MUST come from server-side token verification, never
  -- from a browser form. A service_role assertion is not itself user auth.
  -- No role argument is accepted; no auth.uid() assumption under service_role.
  if input_tenant_id is null or input_local_operation_id is null
    or input_owner_user_id is null or input_authenticated_user_id is null
    or input_owner_user_id <> input_authenticated_user_id then
    raise exception 'OFFLINE_QUOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Lock the membership against concurrent revocation/deletion until this
  -- transaction finishes. FOR SHARE also conflicts with non-key role updates.
  perform tm.id
  from public.tenant_members as tm
  join public.tenants as t on t.id = tm.tenant_id
  where tm.tenant_id = input_tenant_id
    and tm.user_id = input_authenticated_user_id
    and tm.active = true
    and tm.role = any(array['owner', 'admin', 'seller']::public.tenant_role[])
  for share of tm, t;
  if not found then
    raise exception 'OFFLINE_QUOTE_FORBIDDEN' using errcode = '42501';
  end if;

  -- Version 1 is a DISABLED structural prototype, not a priced/approved command.
  -- Reject unknown keys (including browser prices/names/roles). B.3 must define
  -- a new contract version containing the commercial approval before activation.
  if input_contract_version is distinct from 1 then
    raise exception 'OFFLINE_QUOTE_CONTRACT_UNSUPPORTED';
  end if;
  if pg_catalog.jsonb_typeof(input_command) is distinct from 'object' then
    raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
  end if;
  if (input_command - array['customer', 'items', 'notes']::text[]) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(input_command -> 'customer') is distinct from 'object'
    or pg_catalog.jsonb_typeof(input_command -> 'items') is distinct from 'array' then
    raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
  end if;
  if pg_catalog.jsonb_array_length(input_command -> 'items') = 0 then
    raise exception 'QUOTE_WITHOUT_ITEMS';
  end if;
  customer_data := input_command -> 'customer';
  if (customer_data - array['id', 'name', 'phone', 'email', 'address']::text[]) <> '{}'::jsonb then
    raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
  end if;
  foreach customer_key in array array['id', 'name', 'phone', 'email', 'address']::text[] loop
    if coalesce(pg_catalog.jsonb_typeof(customer_data -> customer_key), 'null') not in ('string', 'null') then
      raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
    end if;
  end loop;
  if coalesce(pg_catalog.jsonb_typeof(input_command -> 'notes'), 'null') not in ('string', 'null') then
    raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
  end if;

  if nullif(pg_catalog.btrim(customer_data ->> 'id'), '') is not null
    and not (pg_catalog.btrim(customer_data ->> 'id') ~* uuid_pattern) then
    raise exception 'OFFLINE_QUOTE_COMMAND_INVALID';
  end if;
  customer_id_value := nullif(pg_catalog.btrim(customer_data ->> 'id'), '')::uuid;
  normalized_customer := pg_catalog.jsonb_build_object(
    'id', customer_id_value,
    'name', pg_catalog.btrim(coalesce(customer_data ->> 'name', '')),
    'phone', nullif(pg_catalog.btrim(customer_data ->> 'phone'), ''),
    'email', nullif(pg_catalog.btrim(customer_data ->> 'email'), ''),
    'address', nullif(pg_catalog.btrim(customer_data ->> 'address'), '')
  );
  normalized_notes := coalesce(nullif(pg_catalog.btrim(input_command ->> 'notes'), ''), 'Presupuesto creado desde mostrador');

  -- Explicit ordinality; repeated products/presentations are NOT compacted.
  for line_data in
    select entry.item
    from pg_catalog.jsonb_array_elements(input_command -> 'items') with ordinality as entry(item, position)
    order by entry.position
  loop
    if pg_catalog.jsonb_typeof(line_data) is distinct from 'object' then
      raise exception 'QUOTE_ITEMS_INVALID';
    end if;
    if (line_data - array['product_id', 'sale_unit_id', 'quantity']::text[]) <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(line_data -> 'product_id') is distinct from 'string'
      or not (coalesce(pg_catalog.btrim(line_data ->> 'product_id'), '') ~* uuid_pattern)
      or coalesce(pg_catalog.jsonb_typeof(line_data -> 'sale_unit_id'), 'null') not in ('string', 'null')
      or pg_catalog.jsonb_typeof(line_data -> 'quantity') is distinct from 'number' then
      raise exception 'QUOTE_ITEMS_INVALID';
    end if;
    if nullif(pg_catalog.btrim(line_data ->> 'sale_unit_id'), '') is not null
      and not (pg_catalog.btrim(line_data ->> 'sale_unit_id') ~* uuid_pattern) then
      raise exception 'QUOTE_ITEMS_INVALID';
    end if;
    line_product_id := pg_catalog.btrim(line_data ->> 'product_id')::uuid;
    line_sale_unit_id := nullif(pg_catalog.btrim(line_data ->> 'sale_unit_id'), '')::uuid;
    line_quantity := (line_data ->> 'quantity')::numeric;
    -- Match quote_items numeric(14,3) WITHOUT silently rounding input quantities.
    if line_quantity <= 0 or line_quantity > 99999999999.999
      or line_quantity <> pg_catalog.round(line_quantity, 3) then
      raise exception 'QUOTE_ITEMS_INVALID';
    end if;
    normalized_items := normalized_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id', line_product_id,
      'sale_unit_id', line_sale_unit_id,
      'quantity', line_quantity::numeric(14,3)
    ));
  end loop;

  -- Canonical JSONB object order, UUID text and fixed quantity scale. Hash only
  -- normalized identity/version/customer/ordered items/notes, not timestamps,
  -- attempts, browser hashes or current catalog data. Extra fields are rejected.
  normalized_command := pg_catalog.jsonb_build_object(
    'contract_version', input_contract_version,
    'tenant_id', input_tenant_id,
    'owner_user_id', input_owner_user_id,
    'customer', normalized_customer,
    'items', normalized_items,
    'notes', normalized_notes
  );
  fingerprint := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(normalized_command::text, 'UTF8')), 'hex');

  -- Transaction-level lock, not a SELECT/INSERT race or a browser lock. Hash
  -- collisions only serialize unrelated keys; the exact PK remains authoritative.
  -- READ COMMITTED/VOLATILE: the following SELECT gets a fresh snapshot after wait.
  -- At stronger isolation levels a stale snapshot may produce 23505/40001; the
  -- entire attempt rolls back. Retry the SAME command/key in a NEW transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'offline_quote:' || input_tenant_id::text || ':' || input_local_operation_id::text, 0
  ));
  select op.* into receipt
  from public.offline_quote_operations as op
  where op.tenant_id = input_tenant_id
    and op.local_operation_id = input_local_operation_id;
  if found then
    if receipt.owner_user_id <> input_authenticated_user_id then
      raise exception 'OFFLINE_QUOTE_FORBIDDEN' using errcode = '42501';
    end if;
    if receipt.contract_version <> input_contract_version or receipt.command_fingerprint <> fingerprint then
      raise exception 'OFFLINE_QUOTE_COMMAND_MISMATCH';
    end if;
    -- Frozen result: do not reprice, recreate a deleted quote or expose it to a
    -- different user. No join to the live quote is required for recovery.
    return query select receipt.local_operation_id, receipt.remote_quote_id,
      receipt.quote_number, receipt.total, receipt.confirmed_at;
    return;
  end if;

  -- B2_CREATION_GATE: unconditional and NOT controlled by a request parameter,
  -- GUC, environment variable or frontend flag. Only a future reviewed migration
  -- may replace it AFTER adding transactional B.3 approval/price validation.
  raise exception 'OFFLINE_QUOTE_SYNC_NOT_ENABLED' using errcode = '55000';

  -- Prepared atomic core, intentionally unreachable in B.2. NEVER just remove
  -- the gate to deploy: v1 omits approval and this core alone is insufficient.
  if customer_id_value is not null then
    perform c.id from public.customers as c
    where c.id = customer_id_value and c.tenant_id = input_tenant_id and c.deleted_at is null
    for share;
    if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  end if;
  created_quote_id := public.create_quote_with_current_product_names(
    input_tenant_id => input_tenant_id,
    input_customer_id => customer_id_value,
    input_customer_name => normalized_customer ->> 'name',
    input_customer_phone => normalized_customer ->> 'phone',
    input_customer_email => normalized_customer ->> 'email',
    input_customer_address => normalized_customer ->> 'address',
    input_items => normalized_items,
    input_notes => normalized_notes,
    input_created_by => input_authenticated_user_id
  );

  insert into public.offline_quote_operations as op (
    tenant_id, local_operation_id, owner_user_id, contract_version, command_fingerprint,
    remote_quote_id, quote_number, total, confirmed_at
  )
  select input_tenant_id, input_local_operation_id, input_owner_user_id, input_contract_version, fingerprint,
    q.id, q.quote_number, q.total, pg_catalog.clock_timestamp()
  from public.quotes as q
  where q.id = created_quote_id and q.tenant_id = input_tenant_id
  returning op.* into receipt;
  if not found then raise exception 'OFFLINE_QUOTE_RESULT_MISSING'; end if;
  -- No exception handler: any failure rolls back quote, items, new customer and
  -- receipt together. Sequence-number gaps after rollback are normal PostgreSQL.
  return query select receipt.local_operation_id, receipt.remote_quote_id,
    receipt.quote_number, receipt.total, receipt.confirmed_at;
end;
$$;

-- Default PUBLIC EXECUTE and Supabase default grants must not open this RPC.
revoke all on function public.confirm_offline_quote_operation(uuid, uuid, uuid, uuid, integer, jsonb)
  from public, anon, authenticated, service_role;

commit;
