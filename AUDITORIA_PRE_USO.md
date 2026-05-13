# Auditoria pre uso - FERRETERIA-SurByte

Fecha: 2026-05-13

## Resumen ejecutivo

El proyecto esta en buen estado para una prueba controlada con datos de demo y operador tecnico presente. La base funcional principal existe: catalogo, busqueda, presupuestos, conversion transaccional a venta, ventas, clientes, cuenta corriente, stock auditable y caja diaria.

No recomiendo usarlo todavia como sistema productivo sin corregir los riesgos criticos de seguridad/autenticacion y el guardado parcial de presupuestos. El flujo presupuesto -> venta esta correctamente concentrado en RPC y evita inserts parciales en la conversion, pero la creacion inicial de presupuesto todavia no es transaccional.

Resultado tecnico:

- `npm run lint`: OK.
- `npm run build`: OK despues de marcar el dashboard como renderizado por request con `connection()`.
- Migraciones esperadas: presentes, incluida `007_refine_low_stock_view.sql`.
- No falta migracion 007. El numero salteado es 002.

## Estado por modulo

### Estructura general

- `src/app/(dashboard)`: contiene rutas principales para inicio, productos, presupuestos, ventas, clientes, caja y configuracion.
- `src/components`: separado por dominio y shell. Hay componentes reutilizables razonables.
- `src/lib`: Supabase, tenant y utilidades CSV.
- `supabase/migrations`: orden logico 001, 003, 004, 005, 006, 007, 008. Falta numeracion 002, documentado como salto.
- `scripts`: importador CSV local usando service role desde `.env.local`.
- `package.json`: scripts basicos correctos.
- `README.md` y `.env.example`: utiles, pero README deberia advertir con mas fuerza que la app actual usa service role y tenant demo.

### Productos

Estado: funcional para prueba.

- Busqueda por codigo, nombre y categoria: implementada con RPC `search_products` y fallback.
- Paginacion: carga acumulativa de 100 en 100 con `page`.
- Stock visible y estados `Sin stock`, `Bajo stock`, `Stock OK`: implementados.
- Edicion de producto, precio, marca, categoria, foto: implementada.
- Ajuste de stock: implementado por RPC `adjust_product_stock`.
- Historial: implementado en `/productos/[id]/stock`.

Observaciones:

- La ruta `/productos/importar` existe, pero no hay acceso visible desde Productos. No es critico si la importacion es administrativa.
- Hay codigo muerto: `src/components/productos/productos-resumen.tsx` no tiene referencias.
- El bucket `product-images` se crea como publico desde una Server Action. Para uso real conviene provisionarlo por migracion/configuracion y definir politicas explicitas.

### Presupuestos

Estado: funcional con riesgo medio/alto de datos parciales.

- Crear presupuesto: implementado en `/presupuestos/nuevo`.
- Seleccionar cliente existente o crear cliente por datos ingresados: implementado.
- Guardar `quotes` y `quote_items`: implementado, pero en dos inserts separados desde la app.
- Detalle, imprimir y convertir a venta: implementados.
- Mensajes de error: existen, aunque algunos textos deben revisarse para claridad y acentos.

Riesgo:

- `src/app/(dashboard)/presupuestos/nuevo/actions.ts:197` crea el encabezado y `:219` inserta items. Si falla el segundo paso queda un presupuesto sin productos. El propio mensaje en `:241` confirma ese estado parcial.

### Ventas

Estado: funcional para ventas originadas desde presupuestos.

- Listado: implementado.
- Detalle e impresion: implementados.
- `payment_method`, `paid_amount` y cliente: visibles.
- Caja asociada: se guarda en la RPC si hay caja abierta, pero el detalle de venta no muestra `cash_session_id`.

Observacion UX/producto:

- No existe venta directa independiente. La venta se registra convirtiendo un presupuesto. Los accesos rapidos se ajustaron para llevar a nuevo presupuesto/venta.

### Clientes

Estado: funcional.

- Listar, crear, editar y ficha: implementado.
- Ventas y presupuestos asociados: implementado.
- Saldo y movimientos de cuenta corriente: implementado.
- Registrar pago: implementado.

Observacion:

- Registrar pagos inserta directo en `customer_account_movements` desde Server Action. Es simple y aceptable para prueba, pero para produccion conviene una RPC con validaciones de saldo, auditoria de usuario y permisos.

### Cuenta corriente

Estado: funcional para prueba.

- Tabla `customer_account_movements`: presente.
- Vista `customer_account_balances`: presente.
- Tipos `debit`, `payment`, `adjustment`: definidos por check.
- Saldo: suma debitos y ajustes, resta pagos.

Observacion:

- `adjustment` siempre suma saldo. Si se necesita ajuste negativo, hace falta definir convencion o columna de signo.

### Stock

Estado: funcional para prueba.

- `inventory_movements`: presente.
- Descuento por venta: implementado en `convert_quote_to_sale`.
- Ajuste manual: implementado en `adjust_product_stock`.
- Historial y bajo stock: implementados.

Observaciones:

- `adjust_product_stock` exige motivo, bloquea producto con `FOR UPDATE`, crea movimiento, actualiza `products.stock_quantity`, usa `initial` si pasa de 0 a mayor que 0 y `adjustment` en otros casos.
- La conversion a venta descuenta stock y crea movimiento `sale`, pero no valida stock suficiente antes de vender. Puede dejar stock negativo.

### Caja

Estado: funcional para prueba.

- `/caja`: implementada.
- Abrir caja: implementado.
- Una sola caja abierta por tenant: reforzado por indice unico parcial.
- Ventas asociadas a caja abierta: implementado en RPC 008.
- Efectivo esperado, cierre con contado, diferencia e historial: implementados.

Observaciones:

- Abrir caja revisa si hay abierta desde la app y la base lo refuerza con indice unico.
- El cierre recalcula ventas en efectivo asociadas a esa caja.

## Supabase/RPC

### `search_products`

Presente en 003 y redefinida en 006 agregando `stock_quantity`. La app espera esta version nueva. Si Supabase solo tiene aplicada 003, Productos puede quedar desincronizado.

### `convert_quote_to_sale`

Presente en 005 y redefinida en 008 para asociar caja.

Verificado:

- Crea venta.
- Copia items.
- Descuenta stock.
- Crea `inventory_movements` tipo `sale`.
- Genera deuda si es `Cuenta corriente` y hay pendiente.
- Asocia `cash_session_id` si hay caja abierta.
- Marca quote como `converted`.
- La conversion no hace inserts parciales fuera de RPC.

Pendiente:

- Validar stock suficiente.
- Registrar `created_by` real de la operacion actual.

### `adjust_product_stock`

Presente en 006.

Verificado:

- Exige motivo.
- Bloquea producto con `FOR UPDATE`.
- Crea `inventory_movements`.
- Actualiza `products.stock_quantity`.
- Usa `initial` cuando stock previo era 0 y el nuevo es mayor a 0.
- Usa `adjustment` en otros casos.

## Seguridad

Riesgos criticos:

- No hay autenticacion/autorizacion real en la app antes de ejecutar Server Actions. Las Server Actions usan service role y confian en `NEXT_PUBLIC_DEFAULT_TENANT_ID`.
- `NEXT_PUBLIC_DEFAULT_TENANT_ID` es publico y mantiene la demo multi-tenant en un tenant fijo. Para produccion, cualquier endpoint server action debe resolver tenant por sesion/usuario, no por env publica.
- Service role esta solo en servidor/scripts, pero al usarse en acciones sin auth saltea RLS en la practica.

Riesgos medios:

- RPC criticas estan restringidas a `service_role`, correcto para el diseno actual, pero eso aumenta la responsabilidad de validar permisos en servidor.
- `product-images` publico: adecuado para catalogo publico, riesgoso si se suben fotos privadas o si no se controlan rutas por tenant.
- README no incluye checklist de aplicacion de todas las migraciones ni advertencia fuerte de no usar tenant demo en produccion.

Verificado:

- `.env.local` no esta trackeado.
- `.env.example` no contiene claves reales.
- RLS esta habilitado en tablas base y en tablas nuevas `customer_account_movements` y `cash_register_sessions`.

## UX

Fortalezas:

- Botones grandes y textos mayormente claros.
- Estados vacios utiles en productos, presupuestos, ventas, clientes y caja.
- Flujos principales son simples y orientados a mostrador.

Problemas:

- Hay varios textos sin acentos o con encoding a revisar en pantalla segun navegador/consola. Conviene una pasada de copy antes de capacitar usuarios mayores.
- La venta se inicia como presupuesto. Para adultos poco tecnicos, el texto debe reforzar "crear comprobante y convertir a venta".
- El detalle de venta no muestra caja asociada, aunque existe el dato.
- Los confirm dialogs del navegador son funcionales pero poco didacticos.

## Riesgos criticos

1. Falta autenticacion/autorizacion real en Server Actions con service role.
2. Uso productivo de `NEXT_PUBLIC_DEFAULT_TENANT_ID` puede mezclar o exponer datos si se habilita mas de un tenant.
3. Creacion de presupuesto no transaccional puede dejar encabezados sin items.

## Riesgos medios

1. Stock puede quedar negativo al convertir ventas.
2. Detalle de venta no muestra `cash_session_id`, dificultando auditoria de caja.
3. Importacion de productos existe pero no esta enlazada desde UI principal.
4. Codigo muerto: `ProductosResumen` y `PresupuestoSimple`.
5. Registro de pagos no esta encapsulado en RPC auditable.

## Riesgos bajos

1. Salto de migracion 002 documentable.
2. Textos con acentos/copy para pulir.
3. README incompleto para operacion real.

## Migraciones pendientes en Supabase

Antes de probar contra una base real, confirmar que estan aplicadas:

- `001_initial_schema_supabase.sql`
- `003_search_products_rpc.sql`
- `004_customer_account_movements.sql`
- `005_convert_quote_to_sale_rpc.sql`
- `006_stock_rpc_and_search.sql`
- `007_refine_low_stock_view.sql`
- `008_cash_register_sessions.sql`

No falta migracion 007. Existe. El salto real es 002 y no requiere renombrar migraciones ya aplicadas.

## Checklist para probar en la ferreteria

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

## Fixes recomendados antes de usar

Imprescindibles antes de produccion:

- Agregar autenticacion y autorizacion en todas las Server Actions.
- Resolver tenant por sesion/membresia y eliminar dependencia operativa de `NEXT_PUBLIC_DEFAULT_TENANT_ID`.
- Crear RPC transaccional para guardar presupuesto + items.
- Validar stock disponible en `convert_quote_to_sale`.

Recomendados antes de prueba con usuarios no tecnicos:

- Mostrar caja asociada en detalle de venta.
- Agregar acceso visible a importacion si se va a usar.
- Limpiar codigo muerto.
- Revisar copy y acentos en toda la UI.
- Documentar en README el orden completo de migraciones y el flujo real de venta.

## Proximos pasos sugeridos

1. Correr checklist con una base Supabase limpia y datos de demo.
2. Revisar tablas despues de cada operacion con SQL.
3. Implementar auth/tenant real antes de cargar datos productivos.
4. Encapsular presupuesto inicial y pagos en RPC.
5. Hacer prueba guiada con la persona que va a usar caja y mostrador.

## Resultado final

Recomendacion: listo para prueba controlada, no usar todavia en produccion hasta corregir autenticacion/tenant real y guardado transaccional de presupuestos.
