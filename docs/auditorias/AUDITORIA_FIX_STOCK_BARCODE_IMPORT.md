# Auditoria fix stock, barcode e importacion

Fecha: 2026-06-11
Rama: `fix/stock-barcode-import-unification`
Alcance: `/stock`, lector de codigo de barras, alta de productos, importacion web y scripts relacionados.

## 1. Causas confirmadas

1. `/stock` abre por defecto en filtro `con-stock`. Si un producto se crea con `stock_quantity = 0`, queda guardado pero no aparece en el listado inicial.
   - Archivo: `src/app/(dashboard)/stock/page.tsx`.
   - Evidencia: `parseStockFilter` devuelve `con-stock` por defecto y `loadStockProducts` aplica `query.gt("stock_quantity", 0)`.

2. La busqueda principal de `/stock` no consulta `product_sale_units.barcode`.
   - Archivo: `src/app/(dashboard)/stock/page.tsx`.
   - Evidencia: busca en `products.sku`, `products.barcode`, `name`, `normalized_name` y `description`; las presentaciones se cargan despues, solo para productos ya encontrados.

3. El lector de codigo de barras tiene una experiencia paralela.
   - Archivo: `src/components/productos/barcode-stock-panel.tsx`.
   - Evidencia: usa `ProductFound`, busqueda por nombre, asociacion y `CreateProductBox`; no abre la misma gestion de stock que la tarjeta normal.

4. El alta rapida desde codigo de barras duplica logica de creacion.
   - Archivo: `src/app/(dashboard)/stock/actions.ts`.
   - Evidencia: `createBarcodeProductAction` inserta `products`, luego `product_sale_units`, luego `inventory_movements`.

5. El alta normal de productos no es atomica.
   - Archivo: `src/app/(dashboard)/productos/actions.ts`.
   - Evidencia: `createProductAction` inserta `products`, despues sincroniza `product_sale_units`, y despues inserta `inventory_movements` si hay stock inicial. Si falla una etapa posterior, puede quedar producto parcial.

6. La importacion web puede modificar stock sin historial.
   - Archivo: `src/app/(dashboard)/productos/importar/actions.ts`.
   - Evidencia: hace `upsert` en `products` con `stock_quantity` y `onConflict: "tenant_id,sku"` sin crear movimientos por producto.

7. Hay datos reales cargados en Demo que no estan en Principal.
   - Proyecto remoto local: host no sensible `nufdzannftjgobxixxhz.supabase.co`.
   - Tenants detectados por lectura controlada:
     - `ferreteria-demo`: 10.779 productos activos.
     - `ferreteria-principal`: 85 productos activos.
   - Hay 10.730 SKU activos presentes en Demo y no en tenants no-Demo.

## 2. Hipotesis descartadas o no confirmadas

1. Mezcla directa de Demo y Principal en `/stock` o POS: descartada por codigo. Las consultas auditadas usan `tenant.id` desde `requireTenant` o `requireTenantRole`.
2. Productos compartidos fisicamente entre tenants: descartado por esquema. `products` tiene `tenant_id` obligatorio y SKU unico solo por `(tenant_id, sku)`.
3. Inconsistencia actual entre `product_sale_units.tenant_id` y `products.tenant_id`: no confirmada. Lectura remota agregada detecto 0 presentaciones con tenant distinto al producto padre.
4. Uso productivo de `NEXT_PUBLIC_DEFAULT_TENANT_ID` en pantallas autenticadas: descartado por codigo para `/stock`, POS y acciones principales. Si se usa en scripts CLI.
5. Vercel enlazado localmente: no confirmado. No existe `.vercel/project.json` en este checkout.

## 3. Archivos implicados

- `src/app/(dashboard)/stock/page.tsx`
- `src/app/(dashboard)/stock/actions.ts`
- `src/app/(dashboard)/stock/new-product-form.tsx`
- `src/components/productos/barcode-stock-panel.tsx`
- `src/components/productos/stock-adjust-details.tsx`
- `src/components/productos/stock-adjust-form.tsx`
- `src/app/(dashboard)/productos/actions.ts`
- `src/app/(dashboard)/productos/importar/actions.ts`
- `src/components/productos/import-products-form.tsx`
- `src/lib/csv/productos.ts`
- `src/lib/csv/stock.ts`
- `src/lib/search-ranking.ts`
- `src/lib/tenant/*`
- `src/lib/supabase/*`
- `supabase/migrations/*`
- `scripts/import-products.mjs`
- `scripts/import-productos.mjs`
- `README.md`
- `.env.example`

## 4. Riesgos de datos

1. Riesgo de producto parcial por operaciones separadas al crear productos.
2. Riesgo de stock pisado sin historial por importacion web actual.
3. Riesgo de duplicados por productos inactivos si se tratan como inexistentes.
4. Riesgo de codigos duplicados entre `products.sku`, `products.barcode` y `product_sale_units.barcode`.
5. Riesgo operativo por catalogo mayoritario en Demo y catalogo reducido en Principal.
6. Riesgo de fuga multi-tenant si alguna Server Action con service role omite `.eq("tenant_id", tenant.id)`.

## 5. Diferencias entre busquedas actuales

Busqueda normal `/stock`:
- Tabla base: `products`.
- Campos: `sku`, `barcode`, `name`, `normalized_name`, `description`.
- No incluye `product_sale_units.barcode`.
- Aplica filtro de stock por defecto.

Lector de codigo:
- Primero consulta `product_sale_units.barcode`.
- Luego consulta `products.sku` y `products.barcode`.
- Si no encuentra, abre flujo paralelo para buscar por nombre, asociar o crear.

Alta manual:
- Usa `NewProductForm` y `createProductAction`.
- Permite datos comerciales y presentaciones.
- No es atomica actualmente.

Alta desde lector:
- Usa formulario reducido.
- Crea producto con datos minimos.
- No comparte el mismo formulario ni la misma experiencia de stock.

## 6. Tablas reales utilizadas

- `tenants`
- `tenant_members`
- `products`
- `product_sale_units`
- `inventory_movements`
- `categories`
- `brands`
- `suppliers`
- `import_batches`
- `quotes`
- `quote_items`
- `sales`
- `sale_items`

## 7. Resolucion de tenant

- `requireTenant()` valida usuario autenticado con cookie de acceso y busca membresia activa en `tenant_members`.
- Si no hay membresia, redirige a `/sin-ferreteria`.
- Si hay mas de una membresia activa, redirige a `/sin-ferreteria?reason=multiple-tenants`.
- `requireTenantRole()` reutiliza `requireTenant()` y valida rol localmente.
- Las acciones de Stock/POS auditadas usan `tenant.id`; los scripts CLI usan `NEXT_PUBLIC_DEFAULT_TENANT_ID`.

## 8. Migraciones aplicadas o pendientes

Migraciones locales existentes:

1. `001_initial_schema_supabase.sql`
2. `003_search_products_rpc.sql`
3. `004_customer_account_movements.sql`
4. `005_convert_quote_to_sale_rpc.sql`
5. `006_stock_rpc_and_search.sql`
6. `007_refine_low_stock_view.sql`
7. `008_cash_register_sessions.sql`
8. `009_create_quote_rpc.sql`
9. `010_seed_demo_tenant.sql`
10. `011_storage_product_images_policies.sql`
11. `012_harden_sale_conversion_cash_and_stock.sql`
12. `013_bulk_add_stock_csv.sql`
13. `014_pos_product_search.sql`
14. `015_product_sale_units.sql`
15. `016_soft_delete_customers_quotes.sql`
16. `017_fix_soft_delete_columns.sql`
17. `018_product_profit_margin.sql`
18. `019_fix_bulk_add_stock_csv_uuid_match.sql`
19. `020_normalize_bulk_add_stock_csv_matching.sql`

Verificacion remota no destructiva:
- `search_pos_products` esta disponible en el proyecto configurado.
- No se pudo confirmar desde el checkout una lista oficial de `supabase_migrations.schema_migrations` porque no hay enlace local de Supabase/Vercel disponible y no se imprimieron credenciales.

Pendientes propuestos:
- Nueva migracion idempotente para normalizacion de codigo, RPC unica de busqueda por codigo, diagnostico stock/barcode y creacion atomica de producto.
- No crear indices unique hasta documentar conflictos actuales.

## 9. Estado de documentacion

- `README.md` enumera migraciones solo hasta `012`; esta desactualizado.
- No existen checklists especificos para Stock/Barcode ni importacion inteligente.
- `.env.example` no contiene secretos, pero mantiene `NEXT_PUBLIC_DEFAULT_TENANT_ID` demo para fallback/scripts.

## 10. Plan de correccion

### P0 urgente

1. Crear helper compartido de normalizacion de codigos en TypeScript.
2. Agregar migracion idempotente con:
   - funcion SQL de normalizacion de codigo;
   - RPC de busqueda exacta por `products.sku`, `products.barcode`, `product_sale_units.barcode`;
   - RPC de diagnostico owner/admin;
   - RPC de creacion atomica de productos.
3. Cambiar `/stock` para que una busqueda con `q` no quede ocultada por `con-stock` por defecto.
4. Incluir `product_sale_units.barcode` en busqueda normal.
5. Detectar conflictos e inactivos sin crear duplicados.
6. Reemplazar el alta reducida del lector por apertura del `NewProductForm` normal con SKU/barcode precargados.
7. Reutilizar `StockAdjustDetails` y `StockAdjustForm` cuando el lector encuentra un producto.
8. Agregar script de diagnostico solo lectura.
9. Agregar checklist corto para visita al cliente.
10. Ejecutar `npm install`, `npm run lint`, `npm run build`.

### P1 mejora integral

1. Reemplazar importacion web directa por asistente con vista previa y confirmacion.
2. Aceptar `.csv` y preparar soporte `.xlsx` con dependencia explicita si se aprueba.
3. Clasificar filas antes de modificar datos.
4. No modificar `stock_quantity` por upsert.
5. Aplicar importacion con movimientos de inventario y lote.
6. Unificar scripts CLI y flujo web sobre helpers reutilizables.
7. Agregar documentacion y checklist de importacion inteligente.

