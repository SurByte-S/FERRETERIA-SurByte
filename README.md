# Ferreteria SaaS

Base multi-tenant para administrar ferreterias con Next.js App Router, TypeScript, Supabase, Tailwind y shadcn/ui.

## Estado actual

El proyecto esta listo para una prueba controlada con login, datos de demo y operador tecnico presente.

No usar en produccion sin roles en Server Actions. Las pantallas principales resuelven tenant por usuario autenticado y `tenant_members`; `NEXT_PUBLIC_DEFAULT_TENANT_ID` queda como fallback demo/local para importadores o flujos explicitamente locales.

Leer `SEGURIDAD_PRE_PRODUCCION.md` y `BACKUP_OPERATIVO.md` antes de operar con datos reales.

## Correr localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`.

Para entrar al dashboard, crear primero un usuario en Supabase Auth y usar `/login`.

## Variables

Completar `.env.local` con las claves del proyecto Supabase:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_DEFAULT_TENANT_ID`
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG`
- `NEXT_PUBLIC_DEFAULT_TENANT_NAME`

## Migraciones

Aplicar las migraciones en este orden:

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
20. `021_stock_barcode_unification.sql`

No existe migracion `002` por un salto historico de numeracion. No renombrar migraciones ya aplicadas.

## Checklist de prueba controlada

- Abrir caja.
- Crear cliente.
- Buscar producto.
- Ajustar stock inicial.
- Crear presupuesto con cliente.
- Guardar presupuesto.
- Convertir a venta en efectivo.
- Confirmar que descuenta stock.
- Confirmar `inventory_movements` tipo `sale`.
- Confirmar venta asociada a caja.
- Crear otro presupuesto con cuenta corriente.
- Convertir pagando menos que el total.
- Confirmar deuda en cliente.
- Registrar pago.
- Confirmar que baja saldo.
- Cerrar caja.
- Confirmar diferencia.

Tambien esta disponible el archivo `docs/checklists/CHECKLIST_PRUEBA_FERRETERIA.md` para ejecutar la prueba paso a paso.

## Estructura

- `src/app/(dashboard)`: rutas principales del panel.
- `src/components/shell`: layout, navegacion y estados base.
- `src/components/productos`: componentes del modulo productos.
- `src/components/presupuestos`: componentes del modulo presupuestos.
- `src/lib/supabase`: clientes Supabase con inicializacion lazy.
- `src/lib/tenant`: helpers para resolver tenant actual.
