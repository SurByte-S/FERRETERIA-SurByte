# Checklist Importacion Productos CSV/XLSX

## Preparacion

- Usar usuario `owner` o `admin`.
- Aplicar migraciones hasta `021_stock_barcode_unification.sql`.
- Tener backup o snapshot antes de probar con catalogo real.

## Vista Previa

- Abrir `/productos/importar`.
- Subir un CSV valido.
- Confirmar que no se escribe en base antes de `Confirmar importacion`.
- Subir un XLSX con las mismas columnas.
- Confirmar que muestra `Crear`, `Actualizar` u `Omitir`.
- Probar SKU repetido dentro del archivo.
- Probar codigo repetido dentro del archivo.
- Probar codigo que ya pertenece a otro producto.
- Confirmar que los errores bloquean la confirmacion.

## Stock

- En modo default, `Preservar stock actual`, importar un SKU existente con `stock_inicial` distinto.
- Confirmar que no cambia `products.stock_quantity` del existente.
- Crear un producto nuevo con `stock_inicial > 0`.
- Confirmar que se crea movimiento `inventory_movements.movement_type = initial`.
- Repetir con modo `Ajustar stock de existentes`.
- Confirmar que el stock del existente cambia al valor del archivo.
- Confirmar que se crea movimiento por la diferencia.

## Resultado

- Confirmar que se crea `import_batches`.
- Confirmar que productos nuevos tienen presentacion `Unidad` en `product_sale_units`.
- Confirmar que `/stock` y `/productos` muestran los cambios.
- Confirmar que no se mezclan tenants: todos los registros escritos tienen el tenant del usuario autenticado.
