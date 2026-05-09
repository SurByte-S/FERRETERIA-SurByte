# Supabase

Este proyecto usa Supabase/Postgres con multi-tenant real. No desactivar RLS para resolver problemas de acceso: si una consulta falla, revisar membresia, policies y `tenant_id`.

## Ejecutar migraciones

1. Instalar o usar la CLI:

```bash
npx supabase --version
```

2. Vincular el proyecto remoto:

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
```

3. Aplicar migraciones:

```bash
npx supabase db push
```

La migracion inicial esta en `supabase/migrations/001_initial_schema_supabase.sql`. El archivo `supabase/seed_categorias.sql` es un seed manual: reemplazar `TENANT_UUID` por el id real antes de ejecutarlo.

## Crear el primer tenant

Crear primero el usuario owner desde Supabase Auth. Luego ejecutar este bloque desde SQL Editor o con un cliente que use service role:

```sql
do $$
declare
  owner_email text := 'owner@ferreteria.com';
  owner_user_id uuid;
  new_tenant_id uuid;
begin
  select id into owner_user_id
  from auth.users
  where email = owner_email;

  if owner_user_id is null then
    raise exception 'No existe el usuario owner con email %', owner_email;
  end if;

  insert into public.tenants (name, slug, business_name, email)
  values ('Ferreteria Demo', 'ferreteria-demo', 'Ferreteria Demo SRL', owner_email)
  returning id into new_tenant_id;

  insert into public.tenant_members (tenant_id, user_id, role, display_name, active)
  values (new_tenant_id, owner_user_id, 'owner', 'Owner principal', true);

  raise notice 'Tenant creado: %', new_tenant_id;
end $$;
```

## Asociar un usuario owner

Si el tenant ya existe y solo falta asociar el owner:

```sql
insert into public.tenant_members (tenant_id, user_id, role, display_name, active)
select
  t.id,
  u.id,
  'owner',
  coalesce(u.email, 'Owner'),
  true
from public.tenants t
join auth.users u on u.email = 'owner@ferreteria.com'
where t.slug = 'ferreteria-demo'
on conflict (tenant_id, user_id)
do update set role = 'owner', active = true;
```

## Validar aislamiento entre tenants

Crear dos tenants y dos usuarios, cada uno con membresia en un tenant distinto. Luego simular el usuario A contra datos del tenant B:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);

-- Debe devolver 0 filas si USER_A_UUID no pertenece a TENANT_B_UUID.
select count(*) as productos_visibles_de_otro_tenant
from public.products
where tenant_id = 'TENANT_B_UUID';

-- Debe fallar por RLS si USER_A_UUID intenta escribir en TENANT_B_UUID.
insert into public.products (tenant_id, sku, name, normalized_name)
values ('TENANT_B_UUID', 'RLS-TEST', 'Producto prohibido', 'producto prohibido');

rollback;
```

Tambien se puede auditar que RLS este activo:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'tenants',
    'tenant_members',
    'categories',
    'brands',
    'suppliers',
    'import_batches',
    'products',
    'inventory_movements',
    'customers',
    'quotes',
    'quote_items',
    'sales',
    'sale_items'
  )
order by relname;
```
