# Diagnóstico inicial — Ferretería SaaS

Archivo fuente: `LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm`
Fecha de lista dentro del Excel: 17/04/2026

## Hallazgos del Excel

- Hoja principal: `CATALOGO`.
- Hoja secundaria: `PRESUPUESTO`.
- Productos detectados: 10673.
- SKUs únicos: 10673.
- SKUs duplicados: 0.
- Productos con precio o costo faltante: 235.
- Precio público mínimo: ARS 7.33.
- Precio público mediano: ARS 13,550.81.
- Precio público máximo: ARS 19,863,671.89.
- IVA inferido mediano: 21.0%.

## Problema del Excel original

El Excel tiene fórmulas con referencias externas a una hoja/libro llamado `BASES`. Al importarlo fuera de su contexto aparecen errores como `#NAME?` y `#N/A`. Para la SaaS conviene usar el CSV normalizado como fuente inicial y no depender de esas fórmulas.

## Archivos generados

- `productos_normalizados.csv`: catálogo listo para importar.
- `productos_incompletos_revision.csv`: productos que necesitan revisión por precio/costo faltante.
- `001_initial_schema_supabase.sql`: esquema multi-tenant inicial.
- `002_seed_categorias.sql`: categorías base sugeridas.
- `PROMPTS_CODEX.md`: prompts iniciales para construir el proyecto.
