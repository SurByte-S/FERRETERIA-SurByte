insert into public.tenants (
  id,
  name,
  slug,
  business_name
)
select
  '00000000-0000-4000-8000-000000000000',
  'Ferreteria Demo',
  'ferreteria-demo',
  'Ferreteria Demo'
where not exists (
  select 1
  from public.tenants
  where id = '00000000-0000-4000-8000-000000000000'
    or slug = 'ferreteria-demo'
)
on conflict (id) do update
set
  name = excluded.name,
  slug = excluded.slug,
  business_name = excluded.business_name;
