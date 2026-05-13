# Seguridad pre-produccion

Fecha: 2026-05-13

## Estado

El sistema queda apto para prueba controlada con login. Todavia no esta listo para produccion real hasta completar tenant por usuario, roles en Server Actions y politicas finales de Storage.

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
- Aplicar `requireTenantRole()` por accion critica.

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

Estado actual:

- El bucket se crea desde una Server Action si no existe.
- Se configura como publico.
- El path actual usa tenant y SKU: `{tenant_id}/{sku}/foto.{ext}`.

Politica recomendada antes de produccion:

- Definir explicitamente si las fotos de producto son publicas o privadas.
- Si son publicas: permitir lectura publica, pero upload/update/delete solo a usuarios autenticados del tenant.
- Si son privadas: servir imagenes con URLs firmadas.
- Cambiar path recomendado a:

```text
{tenant_id}/products/{product_id}/filename
```

- Evitar que un usuario de otro tenant pueda sobrescribir imagenes.

## Etapa 6 - Backup minimo

Configurar antes de produccion:

- Activar backups automaticos de Supabase si el plan lo permite.
- Si no hay backups automaticos, hacer export manual semanal.
- Guardar copia fuera de Supabase.
- Probar una restauracion parcial antes de operar con datos reales.

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

## Checklist antes de produccion

- Rotar `SUPABASE_SERVICE_ROLE_KEY`.
- Crear usuarios reales en Supabase Auth.
- Asociar usuarios a `tenant_members`.
- Resolver tenant por usuario en todas las consultas/acciones.
- Validar roles en Server Actions criticas.
- Revisar politicas de Storage.
- Definir backup y restauracion.
- Ejecutar prueba controlada completa con login.
