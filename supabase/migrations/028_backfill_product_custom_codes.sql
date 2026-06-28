do $$
declare
  generated_code text;
  product_record record;
begin
  for product_record in
    select id, tenant_id
    from public.products
    where nullif(public.normalize_product_code(custom_code), '') is null
    order by tenant_id, created_at asc nulls last, id asc
  loop
    generated_code := public.next_product_custom_code(product_record.tenant_id);

    update public.products
    set custom_code = generated_code
    where id = product_record.id
      and tenant_id = product_record.tenant_id
      and nullif(public.normalize_product_code(custom_code), '') is null;
  end loop;
end;
$$;
