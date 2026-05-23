-- Diagnostico de soft delete para clientes y presupuestos.
-- Ejecutar manualmente en Supabase SQL Editor.

select
  count(*) as total,
  count(*) filter (where deleted_at is null) as visibles,
  count(*) filter (where deleted_at is not null) as ocultos
from public.customers;

select
  count(*) as total,
  count(*) filter (where deleted_at is null) as visibles,
  count(*) filter (where deleted_at is not null) as ocultos
from public.quotes;

-- Recuperacion opcional.
-- Usar SOLO si la migracion marco registros viejos como borrados
-- y todavia no hubo eliminaciones reales luego de implementar soft delete.

-- update public.customers
-- set deleted_at = null,
--     deleted_by = null
-- where deleted_at is not null;

-- update public.quotes
-- set deleted_at = null,
--     deleted_by = null
-- where deleted_at is not null;
