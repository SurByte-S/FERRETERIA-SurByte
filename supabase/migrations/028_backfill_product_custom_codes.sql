do $$
declare
  generated_code text;
  product_record record;
begin
  for product_record in
    select p.id, p.tenant_id
    from public.products p
    where p.stock_quantity > 0
      and nullif(trim(p.custom_code), '') is null
    order by p.tenant_id, p.created_at asc nulls last, p.id asc
  loop
    generated_code := public.next_product_custom_code(product_record.tenant_id);

    update public.products
    set custom_code = generated_code
    where id = product_record.id
      and tenant_id = product_record.tenant_id
      and stock_quantity > 0
      and nullif(trim(custom_code), '') is null;
  end loop;
end;
$$;
