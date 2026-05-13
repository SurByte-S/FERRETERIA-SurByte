# Seguridad pre-produccion

Fecha: 2026-05-13

## Estado

El sistema queda apto para prueba controlada con login, tenant por usuario y roles en Server Actions. Todavia no esta listo para produccion real hasta cerrar politicas finales de Storage, backup operativo y selector de tenant si hay multiples ferreterias.

## Etapa 1 - Seguridad inmediata

### Rotar `SUPABASE_SERVICE_ROLE_KEY`

1. Entrar al panel de Supabase.
2. Abrir el proyecto correcto.
3. Ir a `Project Settings` -> `API`.
4. Rotar/regenerar la `service_role key`.
5. Actualizar la clave nueva en `.env.local` o `.env` local:

```bash
SUPABASE_SERVICE_ROLE_KEY="nueva_service_role_key"
```

6. Si existe deploy, actualizar la misma variable en el proveedor:
   - Vercel: `Project Settings` -> `Environment Variables`.
   - Otro hosting: panel de variables secretas del entorno.
7. Reiniciar el servidor local o redeployar.
8. Probar login, productos, caja, clientes y presupuesto -> venta.

### Reglas obligatorias

- `.env.local` y `.env` no deben subirse al repositorio.
- `.env.example` no debe tener claves reales.
- `SUPABASE_SERVICE_ROLE_KEY` solo puede usarse server-side.
- Nunca exponer `service_role` al navegador.
- Nunca usar `NEXT_PUBLIC_` para secretos.

### Revision del repositorio

Verificado:

- `.gitignore` ignora `.env*` y permite solo `.env.example`.
- `.env.example` usa placeholders, no claves reales.
- No hay una `SUPABASE_SERVICE_ROLE_KEY` real hardcodeada en el repo.
- El uso de service role esta concentrado en cliente server-side, scripts locales y grants SQL.

## Etapa 2 - Auth minima

Implementado:

- Ruta `/login`.
- Login con Supabase Auth por email y contrasena.
- Cookies HTTP-only para guardar sesion server-side.
- Proteccion del dashboard desde `src/app/(dashboard)/layout.tsx`.
- Redireccion a `/login` si no hay sesion.
- Usuario actual visible en el layout.
- Boton `Cerrar sesion`.

Importante:

- Este login protege la navegacion del dashboard.
- Las Server Actions criticas todavia deben recibir validaciones de usuario/rol internamente antes de produccion.

## Etapa 3 - Tenant por usuario

Implementado para las pantallas y Server Actions principales.

- `requireTenant()` resuelve el usuario autenticado con `requireUser()`.
- Busca membresia activa en `tenant_members`.
- Hace join con `tenants`.
- Si el usuario tiene un tenant, usa ese tenant.
- Si tiene varios tenants, usa el primero por ahora.
- Si no tiene tenant, redirige a `/sin-ferreteria` con mensaje claro.
- `getCurrentTenant()` queda solo como fallback demo/local para importadores o flujos explicitamente locales.

Pendiente:

- Selector de tenant cuando un usuario tenga multiples ferreterias.

Helpers actuales:

- `requireUser()`
- `requireTenant()`

Helpers recomendados para la etapa de roles:

- `requireTenantRole(["owner", "admin"])`
- `requireTenantRole(["owner", "admin", "seller"])`

## Etapa 4 - Roles minimos

Implementado en Server Actions criticas con `requireTenantRole()`.

Roles actuales esperados en `tenant_members.role`:

- `owner`
- `admin`
- `seller`
- `viewer`

Permisos minimos sugeridos:

- `owner/admin`: todo.
- `seller`: ventas, presupuestos, clientes, caja y ajuste de stock limitado.
- `viewer`: solo lectura.

Matriz aplicada:

- Editar productos: `owner`, `admin`.
- Ajustar stock: `owner`, `admin`, `seller`.
- Abrir/cerrar caja: `owner`, `admin`, `seller`.
- Registrar pagos: `owner`, `admin`, `seller`.
- Convertir presupuestos en ventas: `owner`, `admin`, `seller`.
- Guardar presupuestos: `owner`, `admin`, `seller`.
- Crear clientes: `owner`, `admin`, `seller`.
- Editar clientes: `owner`, `admin`.
- Lectura de paginas/listados: permitida a usuarios autenticados con tenant, incluido `viewer`.

Si el usuario no tiene permiso, la UI muestra:
`No tenes permiso para hacer esta accion.`

## Etapa 5 - Storage `product-images`

Auditado y migracion de policies preparada en `011_storage_product_images_policies.sql`.

Hallazgos actuales:

- El bucket se crea en `src/app/(dashboard)/productos/actions.ts`, dentro de `uploadProductImage()`.
- Se crea como bucket publico con `public: true`.
- Solo se suben JPG, PNG y WebP.
- La subida ocurre al editar producto desde `ProductEditForm`.
- La Server Action exige rol `owner` o `admin` antes de subir o actualizar producto.
- El path actual fue ajustado a:

```text
{tenant_id}/products/{product_id}/foto.{ext}
```

- El path incluye `tenant_id`.
- El path incluye `product_id`, no SKU. Esto evita que un cambio de SKU deje la foto en una ruta vieja basada en codigo.
- El nombre fijo `foto.{ext}` usa `upsert: true`, por lo que reemplaza la foto del mismo producto y extension.
- Riesgo residual: si se cambia de extension, por ejemplo de `foto.jpg` a `foto.webp`, puede quedar el archivo anterior sin uso.
- Riesgo residual: el bucket publico permite lectura anonima de cualquier imagen si se conoce la URL.
- La escritura principal de la app sigue pasando por Server Action con service role y `requireTenantRole(["owner", "admin"])`.

Colisiones y aislamiento:

- Entre tenants: baja probabilidad de colision porque el primer segmento es `tenant_id`.
- Dentro del mismo tenant: baja probabilidad de colision porque el segundo segmento es `product_id`.
- Un usuario de otro tenant no deberia poder sobrescribir por UI porque `updateProductAction` exige tenant/rol y actualiza por `tenant_id` + `product_id`.
- Si alguien obtiene service role o una policy de Storage demasiado amplia, podria sobrescribir objetos. Por eso service role y policies siguen siendo controles criticos.

Politica aplicada/recomendada:

- Se mantiene lectura publica porque la UI guarda `publicUrl` en `products.image_url`.
- La policy `product images public read` permite lectura publica del bucket `product-images`.
- Las policies de insert/update/delete para clientes autenticados exigen:
  - bucket `product-images`;
  - path con forma `{tenant_id}/products/{product_id}/...`;
  - primer segmento del path casteable a `tenant_id`;
  - tercer segmento casteable a `product_id`;
  - producto existente en ese tenant;
  - usuario autenticado con rol `owner` o `admin` en ese tenant.
- Si se requiere privacidad, convertir el bucket a privado y servir con URLs firmadas.
- No se agregan policies amplias de escritura para cliente.
- No usar delete desde UI hasta tener auditoria clara.
- La migracion tambien asegura que el bucket permita solo JPG, PNG y WebP.

## Etapa 6 - Backup minimo

Configurar antes de produccion.

Procedimiento operativo completo: ver `BACKUP_OPERATIVO.md`.

Estrategia operativa:

- Activar backups automaticos de Supabase si el plan lo permite.
- Si no hay backups automaticos, hacer export manual semanal.
- Guardar copia fuera de Supabase, por ejemplo almacenamiento cifrado en Drive/OneDrive/S3.
- Probar una restauracion parcial antes de operar con datos reales.
- Documentar responsable, frecuencia y ubicacion del backup.

Tablas criticas:

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

Procedimiento minimo de export manual:

1. Avisar que se inicia ventana de backup.
2. Exportar base desde Supabase Dashboard o `pg_dump`.
3. Guardar archivo con fecha: `ferreteria-backup-YYYY-MM-DD.sql`.
4. Copiar el archivo fuera de Supabase.
5. Verificar que el archivo no pese cero y pueda abrirse.
6. Registrar en una planilla: fecha, responsable, ubicacion y observaciones.

Procedimiento minimo de restauracion:

1. Crear proyecto/base temporal de restauracion.
2. Importar el backup.
3. Verificar tablas criticas y conteos basicos.
4. Probar consultas de productos, clientes, ventas, stock y caja.
5. Solo restaurar produccion luego de validar en entorno temporal.

## Checklist antes de produccion

- Rotar `SUPABASE_SERVICE_ROLE_KEY`.
- Crear usuarios reales en Supabase Auth.
- Asociar usuarios a `tenant_members`.
- Resolver tenant por usuario en todas las consultas/acciones.
- Validar roles en Server Actions criticas.
- Revisar politicas de Storage.
- Definir backup y restauracion segun `BACKUP_OPERATIVO.md`.
- Ejecutar prueba controlada completa con login.
