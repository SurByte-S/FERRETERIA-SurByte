# Checklist Stock / Codigo de Barras

## Preparacion

- Aplicar migraciones hasta `021_stock_barcode_unification.sql`.
- Iniciar sesion con usuario `owner` o `admin`.
- Confirmar que el usuario pertenece a un solo tenant activo en `tenant_members`.
- Abrir `/api/diagnostico/stock-barcode` y confirmar `ok: true`.

## Busqueda en Stock

- Ir a `/stock`.
- Buscar un SKU de un producto con stock.
- Buscar un SKU de un producto con stock 0.
- Confirmar que una busqueda sin filtro explicito usa todos los productos.
- Buscar un codigo de `product_sale_units.barcode`.
- Confirmar que el producto aparece aunque el codigo no este en `products.barcode`.
- Activar filtro `Con stock` y buscar un producto sin stock.
- Confirmar aviso: el filtro oculta el match exacto y ofrece `Mostrar producto`.

## Scanner / Codigo de Barras

- Abrir `Codigo de barras`.
- Escanear o escribir SKU existente.
- Confirmar que abre la gestion completa del producto.
- Cargar stock y confirmar que se registra el movimiento.
- Escanear un codigo de presentacion.
- Confirmar que abre el mismo producto.
- Escanear un codigo inexistente.
- Buscar por nombre y asociar el codigo a un producto existente.
- Confirmar que no permite asociar un codigo usado por otro producto o presentacion.

## Alta De Producto

- Desde el scanner, buscar un codigo inexistente.
- Buscar por nombre y confirmar que no hay coincidencias.
- Crear producto usando `Crear producto nuevo`.
- Confirmar que se usa el formulario completo de producto.
- Crear con stock inicial 0.
- Confirmar mensaje de stock 0 y usar `Cargar stock ahora`.
- Crear otro producto con stock inicial mayor a 0.
- Confirmar que se crea un movimiento `initial`.

## Diagnostico SQL

- Ejecutar `scripts/diagnostico-stock-barcode.sql` reemplazando `REEMPLAZAR_TENANT_ID`.
- Reemplazar `REEMPLAZAR_CODIGO_OPCIONAL` por un codigo real y revisar fuentes.
- Confirmar que no aparecen codigos con `product_count > 1` antes de operar ventas reales.
