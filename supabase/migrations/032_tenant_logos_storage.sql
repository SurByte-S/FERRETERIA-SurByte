insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'tenant-logos',
  'tenant-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_manage_tenant_logo(object_name text)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  path_parts text[];
  path_tenant_id uuid;
begin
  path_parts := storage.foldername(object_name);

  if array_length(path_parts, 1) < 1 then
    return false;
  end if;

  if path_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  begin
    path_tenant_id := path_parts[1]::uuid;
  exception
    when invalid_text_representation then
      return false;
  end;

  return exists (
    select 1
    from public.tenant_members tm
    where tm.tenant_id = path_tenant_id
      and tm.user_id = auth.uid()
      and tm.active = true
      and tm.role in ('owner', 'admin')
  );
end;
$$;

revoke execute on function public.can_manage_tenant_logo(text) from public;
revoke execute on function public.can_manage_tenant_logo(text) from anon;
grant execute on function public.can_manage_tenant_logo(text) to authenticated;
grant execute on function public.can_manage_tenant_logo(text) to service_role;

drop policy if exists "tenant logos public read" on storage.objects;
create policy "tenant logos public read"
  on storage.objects
  for select
  to public
  using (bucket_id = 'tenant-logos');

drop policy if exists "tenant owners manage logos insert" on storage.objects;
create policy "tenant owners manage logos insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tenant-logos'
    and public.can_manage_tenant_logo(name)
  );

drop policy if exists "tenant owners manage logos update" on storage.objects;
create policy "tenant owners manage logos update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tenant-logos'
    and public.can_manage_tenant_logo(name)
  )
  with check (
    bucket_id = 'tenant-logos'
    and public.can_manage_tenant_logo(name)
  );

drop policy if exists "tenant owners manage logos delete" on storage.objects;
create policy "tenant owners manage logos delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tenant-logos'
    and public.can_manage_tenant_logo(name)
  );
