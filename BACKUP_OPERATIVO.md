# Backup operativo

## Estado actual

El proyecto ya tiene documentadas las tablas criticas y el flujo minimo de restauracion. Falta definir y ejecutar una rutina real con responsable, ubicacion de archivos y prueba periodica de restauracion.

Antes de produccion, confirmar si el plan de Supabase incluye backups automaticos. Si el plan no los incluye, ejecutar backup manual semanal.

Advertencia: un backup no probado no cuenta como backup.

## Frecuencia

- Produccion con datos reales: semanal como minimo.
- Antes de cambios grandes o migraciones: backup manual adicional.
- Despues de importar productos masivamente: backup manual adicional.

## Procedimiento de backup manual semanal

1. Avisar que se inicia una ventana de backup.
2. Confirmar que no hay importaciones o cambios masivos en curso.
3. Exportar la base desde Supabase Dashboard o con `pg_dump`.
4. Guardar el archivo con el nombre recomendado.
5. Copiar el archivo fuera de Supabase.
6. Registrar el backup en la tabla de control.
7. Hacer una verificacion minima del archivo.

## Nombre de archivo

Usar este formato:

```text
ferreteria-backup-YYYY-MM-DD.sql
```

Ejemplo:

```text
ferreteria-backup-2026-05-13.sql
```

## Donde guardar el archivo

Guardar siempre fuera de Supabase.

Opciones aceptables:

- Carpeta cifrada en OneDrive, Google Drive o similar.
- Disco externo protegido.
- Bucket privado en S3 o equivalente.

Reglas:

- No guardar backups dentro del repositorio.
- No subir backups a GitHub.
- No compartir backups por canales publicos.
- Restringir acceso al owner o administrador responsable.

## Registro de backups

Mantener una planilla o documento con esta tabla:

| Fecha | Archivo | Responsable | Ubicacion | Metodo | Verificado | Observaciones |
| --- | --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | ferreteria-backup-YYYY-MM-DD.sql | Nombre | Drive/Disco/S3 | Dashboard/pg_dump | Si/No | Detalle |

## Tablas criticas

El backup debe incluir como minimo:

- `products`
- `customers`
- `quotes`
- `quote_items`
- `sales`
- `sale_items`
- `inventory_movements`
- `customer_account_movements`
- `cash_register_sessions`
- `tenants`
- `tenant_members`

Tambien conviene conservar datos de catalogo auxiliar:

- `categories`
- `brands`
- `suppliers`
- `import_batches`

## Restauracion minima en entorno temporal

1. Crear un proyecto/base temporal de Supabase.
2. Aplicar migraciones del repositorio en orden.
3. Importar el backup.
4. Configurar variables locales apuntando al entorno temporal.
5. Iniciar la app local contra esa base temporal.
6. Probar consultas y pantallas principales.
7. Registrar resultado de la prueba.
8. No restaurar produccion hasta validar en temporal.

## Checklist para confirmar que el backup sirve

- El archivo existe y tiene peso mayor a cero.
- El nombre respeta `ferreteria-backup-YYYY-MM-DD.sql`.
- El archivo esta fuera de Supabase y fuera del repositorio.
- Se puede abrir o listar su contenido.
- La restauracion en entorno temporal termina sin errores criticos.
- Se ven productos.
- Se ven clientes.
- Se ven ventas.
- Se ven movimientos de stock.
- Se ven movimientos de cuenta corriente.
- Se ven cierres de caja.
- El tenant y sus miembros existen.
- La app puede iniciar sesion y navegar con datos restaurados.

## Recomendacion final

No operar con datos reales si no existe al menos un backup reciente probado en un entorno temporal.
