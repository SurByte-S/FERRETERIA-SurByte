# Fase 1 real - Diagnóstico de Excel

## Ejecución solicitada (03-05-2026 UTC)
Se ejecutaron exactamente los comandos pedidos:

1. `find . -iname "*.xlsm" -o -iname "*.xlsx" -o -iname "*.xls"`
   - Resultado: **sin coincidencias** en este checkout local (`/workspace/FERRETERIA-SurByte`).
2. `EXCEL_PATH="LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm" npm run excel:analyze`
   - Resultado: no pudo correr por dependencia faltante (`xlsx`) y bloqueo de instalación npm (`403 Forbidden` al descargar `dotenv`).

## Estado real verificado en este entorno
- **Path esperado informado por negocio:** `LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm` (raíz del repo).
- **Path encontrado en este entorno:** no aparece ningún `.xlsm/.xlsx/.xls`.
- **Conclusión:** en este workspace no está disponible el archivo de dataset ni su commit referenciado (`64dd680`), por lo que no es posible completar un diagnóstico hoja-por-hoja con cifras reales aquí.

## Qué queda listo para ejecutar apenas esté el archivo en este checkout
- Script de análisis: `scripts/analyze_excel.js`.
- Script de importación: `scripts/import_hardware_excel.js`.
- Normalizadores: `scripts/lib/normalizers.js`.

Comando listo para relanzar apenas se resuelva dataset + dependencias:

```bash
EXCEL_PATH="LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm" npm run excel:analyze
```

## Mapeo Excel → DB implementado (sin inventar columnas)
- `codigo` → `products.code`
- `descripcion` → `products.description`
- `costo sin iva` → `products.cost_without_tax`
- `costo c/iva` / `costo con iva` → `products.cost_with_tax`
- `iva` → `products.tax_rate`
- `precio publico` → `products.public_price`
- `cantidad` / `stock` → `products.stock_qty`
- `descuento` → `products.raw_discount`
- `marca` → `brands.name` + `products.brand_id`
- `categoria` / `rubro` → `categories.name` + `products.category_id`
- `unidad` → `products.unit`

## Problemas reales detectados en esta ejecución
1. **Dataset no visible en el filesystem actual** (búsqueda recursiva sin resultados para extensiones Excel).
2. **Dependencias no instalables por política de registry** (`npm install` devuelve 403).
3. En consecuencia, no se pudo producir aún:
   - hojas detectadas,
   - cantidad de filas/columnas por hoja,
   - primeras filas útiles,
   - hoja catálogo/presupuesto validadas por contenido.

## Decisión de alcance (se mantiene Fase 1)
Se mantiene estrictamente el alcance pedido:
- Excel real → análisis/importación → catálogo simple.
- **No** se avanzó con Fase 2, ventas, caja ni dashboard.
