# Fase 1 real - Diagnóstico de Excel

## Resultado de búsqueda en este repo
- No se encontró ningún archivo `.xlsm`, `.xlsx` ni `.xls` dentro de `/workspace/FERRETERIA-SurByte` al momento de esta ejecución.
- Nombre esperado: `LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm`.

## Ubicación recomendada
- Guardar el archivo en: `data/imports/LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm`.

## Estructura de análisis implementada
- Script creado: `scripts/analyze_excel.js`.
- Devuelve por hoja:
  - nombre de hoja
  - cantidad de filas
  - cantidad de columnas
  - primeras filas útiles
  - hojas candidatas catálogo/presupuesto por nombre
  - filas potencialmente basura
  - rangos combinados (`!merges`)

## Detección de columnas reales del catálogo
Se implementó detección real por encabezado, sin inventar columnas:
- codigo → `products.code`
- descripción/descripcion → `products.description`
- costo sin iva → `products.cost_without_tax`
- costo c/iva o costo con iva → `products.cost_with_tax`
- iva → `products.tax_rate`
- precio publico → `products.public_price`
- cantidad/stock → `products.stock_qty`
- descuento → `products.raw_discount`
- marca → `brands.name` + `products.brand_id`
- categoria/rubro → `categories.name` + `products.category_id`
- unidad → `products.unit`

Columnas necesarias no presentes se consideran pendientes/calculadas.

## Riesgos de importación
- Encabezados desplazados o múltiples títulos antes de datos.
- Códigos duplicados en archivo.
- Precios con formatos mixtos (`$ 1.234,56`, `1.234,56`, `1234.56`).
- Filas separadoras/títulos mezcladas con productos.

## Reglas de limpieza implementadas
- `trim` de strings y colapso de espacios.
- normalización de código (mayúsculas + sin espacios internos inválidos).
- parseo robusto de números argentinos.
- parseo de IVA en formato decimal o porcentaje.
- descarte de filas vacías o basura.

## Decisiones técnicas
- Fase 1 queda orientada a: Excel real → DB Supabase → catálogo simple.
- Se crea migración SQL multi-tenant con RLS obligatorio por `tenant_id`.
- Se registra cada error por fila en `import_job_errors`.
