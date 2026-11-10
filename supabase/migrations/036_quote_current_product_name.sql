-- Apply manually after review, before deploying the caller in saveQuoteAction.
-- Based on 024_trace_created_by_quotes_sales.sql (9-argument creation RPC).
-- The existing RPC and its sales callers keep their original behavior.
begin;

create function public.create_quote_with_current_product_names(
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
  created_quote_id uuid;
begin
  created_quote_id := public.create_quote_with_items(
    input_tenant_id => input_tenant_id,
    input_customer_id => input_customer_id,
    input_customer_name => input_customer_name,
    input_customer_phone => input_customer_phone,
    input_customer_email => input_customer_email,
    input_customer_address => input_customer_address,
    input_items => input_items,
    input_notes => input_notes,
    input_created_by => input_created_by
  );

  -- Only rows created by the call above are changed. Existing quotes, product
  -- descriptions, quantities, prices and sale units are never updated here.
  update public.quote_items as qi
  set name = p.name
  from public.products as p
  where qi.tenant_id = input_tenant_id
    and qi.quote_id = created_quote_id
    and p.tenant_id = input_tenant_id
    and p.id = qi.product_id;

  return created_quote_id;
end;
$$;

revoke execute on function public.create_quote_with_current_product_names(uuid, uuid, text, text, text, text, jsonb, text, uuid) from public;
revoke execute on function public.create_quote_with_current_product_names(uuid, uuid, text, text, text, text, jsonb, text, uuid) from anon;
revoke execute on function public.create_quote_with_current_product_names(uuid, uuid, text, text, text, text, jsonb, text, uuid) from authenticated;
grant execute on function public.create_quote_with_current_product_names(uuid, uuid, text, text, text, text, jsonb, text, uuid) to service_role;

commit;

-- Rollback, only AFTER reverting the application caller to create_quote_with_items:
-- drop function public.create_quote_with_current_product_names(uuid, uuid, text, text, text, text, jsonb, text, uuid);
-- No data rollback: names in already-created quotes remain their saved snapshot.
