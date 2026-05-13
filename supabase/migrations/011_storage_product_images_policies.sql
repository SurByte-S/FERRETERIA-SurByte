insert into storage.buckets (
  id,
  name,
  public,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_product_image(object_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  path_parts text[];
  path_tenant_id uuid;
  path_product_id uuid;
begin
  path_parts := storage.foldername(object_name);

  if array_length(path_parts, 1) < 3 then
    return false;
  end if;

  if path_parts[2] <> 'products' then
    return false;
  end if;

  if path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or path_parts[3] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  path_tenant_id := path_parts[1]::uuid;
  path_product_id := path_parts[3]::uuid;

  return public.has_tenant_role(
      path_tenant_id,
      array['owner','admin']::public.tenant_role[]
    )
    and exists (
      select 1
      from public.products p
      where p.tenant_id = path_tenant_id
        and p.id = path_product_id
    );
end;
$$;

revoke execute on function public.can_manage_product_image(text) from public;
revoke execute on function public.can_manage_product_image(text) from anon;
grant execute on function public.can_manage_product_image(text) to authenticated;
grant execute on function public.can_manage_product_image(text) to service_role;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'product-images');

drop policy if exists "tenant owners manage product images insert" on storage.objects;
create policy "tenant owners manage product images insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.can_manage_product_image(name)
  );

drop policy if exists "tenant owners manage product images update" on storage.objects;
create policy "tenant owners manage product images update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.can_manage_product_image(name)
  )
  with check (
    bucket_id = 'product-images'
    and public.can_manage_product_image(name)
  );

drop policy if exists "tenant owners manage product images delete" on storage.objects;
create policy "tenant owners manage product images delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'product-images'
    and public.can_manage_product_image(name)
  );
