# Auditoria integral del proyecto

Fecha: 2026-05-15

Alcance: auditoria read-only de rutas, pantallas, componentes visibles, formularios, Server Actions, RPCs, migraciones, permisos, Supabase, duplicaciones, riesgos UX/UI y riesgos tecnicos.

Restriccion aplicada: no se modifico codigo de la app, base de datos, migraciones, RPCs, rutas ni logica. Este archivo es el unico entregable esperado.

## Resumen ejecutivo

La aplicacion ya esta alineada en su navegacion principal con el modelo deseado para una ferreteria de usuario +65/cero tecnologia: `Vender`, `Caja`, `Stock` y `Administracion` secundaria. La ruta `/inicio` es hoy la entrada mental correcta para vender o guardar presupuesto, y `/presupuestos/nuevo` ya no compite visualmente porque redirige a `/inicio` conservando query params.

El mayor riesgo UX no esta en el sidebar, sino en pantallas secundarias que siguen siendo densas: `/productos`, `/clientes/[id]`, `/ventas`, `/presupuestos` e importacion. Deben seguir existiendo, pero no deben sentirse como flujo diario de mostrador. Para el vendedor comun, el sistema debe reducirse a tres decisiones: vender, manejar caja, consultar stock.

El mayor riesgo tecnico esta en las acciones administrativas que usan `service_role` desde el servidor. Es correcto que no se exponga al cliente, pero la seguridad depende de que cada Server Action tenga `requireTenantRole` adecuado. La mayoria lo tiene. La excepcion mas sensible a revisar antes de produccion es importacion de productos: usa una resolucion de tenant fallback y debe quedar reservada a owner/admin.

Riesgos criticos priorizados:

| Prioridad | Riesgo | Impacto | Recomendacion |
|---|---|---|---|
| Alta | `/productos/importar` es una tarea sensible y densa. | Puede permitir cambios masivos o confundir a usuarios no tecnicos. | Mantener oculta, agregar control explicito owner/admin antes de produccion. |
| Alta | `/stock` permite abrir `Cambiar precio` con un formulario de producto completo. | El vendedor puede ver campos avanzados o tocar datos no esperados. | En etapa futura separar `Cambiar precio` simple de `Editar producto` completo. |
| Alta | Duplicacion conceptual `Stock` vs `Productos`. | El usuario puede no saber donde cambiar stock/precio. | `Stock` para mostrador; `/productos` solo encargado. |
| Media | `/configuracion` es placeholder. | El encargado entra y no puede cambiar datos reales. | Mantener oculta hasta implementarla o dejar texto claro de "pendiente". |
| Media | Algunas pantallas administrativas tienen muchas cards/tablas/botones. | Carga mental alta para +65. | Usar listas de acciones simples y ocultar opciones avanzadas. |
| Media | Multi-tenant selector no existe. | Si un usuario pertenece a mas de una ferreteria, se usa la primera. | Implementar selector antes de multi-tenant real. |

## 1. Auditoria de rutas

| Ruta | Archivo | Tipo | Que hace | Usuario objetivo | Visible en menu | Debe ser visible | Riesgo UX | Recomendacion |
|---|---|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | redireccion | Redirige a `/inicio`. | todos | no | no | bajo | Mantener como entrada tecnica. |
| `/login` | `src/app/login/page.tsx` | publica | Ingreso con email/password. | todos | no | no | bajo | Mantener. Texto actual `Mostrador de ventas` es correcto. |
| `/sin-ferreteria` | `src/app/sin-ferreteria/page.tsx` | publica/error | Usuario autenticado sin ferreteria asignada. | usuario bloqueado/soporte | no | no | medio | Mantener oculta; texto debe evitar terminos tecnicos. |
| `/inicio` | `src/app/(dashboard)/inicio/page.tsx` | protegida | POS principal con `QuickSale`. | vendedor | si, como `Vender` | si | bajo | Mantener como unica entrada mental de operacion nueva. |
| `/caja` | `src/app/(dashboard)/caja/page.tsx` | protegida | Abrir/cerrar caja, efectivo esperado, ventas de sesion. | vendedor/encargado | si | si | bajo/medio | Mantener simple. Evitar sumar analiticas. |
| `/stock` | `src/app/(dashboard)/stock/page.tsx` | protegida | Buscar producto, stock, precio, ajuste, faltantes. | vendedor/encargado | si | si | medio | Mantener. Simplificar cambio de precio en etapa futura. |
| `/ajustes` | `src/app/(dashboard)/ajustes/page.tsx` | protegida/admin UX | Entrada a Administracion con dos grupos. | encargado | si, secundaria | si, secundaria | bajo | Mantener como `Administracion`. |
| `/ajustes/historial` | `src/app/(dashboard)/ajustes/historial/page.tsx` | protegida/admin UX | Accesos a ventas, presupuestos, clientes. | encargado | no | no principal | bajo | Mantener segundo nivel. |
| `/ajustes/configuracion` | `src/app/(dashboard)/ajustes/configuracion/page.tsx` | protegida/admin UX | Accesos a editar productos y datos de ferreteria. | encargado | no | no principal | medio | Mantener segundo nivel; evitar duplicar texto con `/configuracion`. |
| `/configuracion` | `src/app/(dashboard)/configuracion/page.tsx` | protegida/admin | Placeholder de datos del negocio. | owner/admin | no | no principal | medio | Mantener oculta hasta que sea funcional. |
| `/productos` | `src/app/(dashboard)/productos/page.tsx` | protegida/admin | Catalogo completo, busqueda, edicion, stock, historial, usar en venta. | encargado | no | no principal | alto | Mantener como `Editar productos`. No mostrar a vendedor comun. |
| `/productos/importar` | `src/app/(dashboard)/productos/importar/page.tsx` | protegida/admin/tecnica | Importa CSV de productos. | owner/admin/soporte | no | no | alto | Mantener muy oculta y reforzar permisos. |
| `/productos/[id]/stock` | `src/app/(dashboard)/productos/[id]/stock/page.tsx` | protegida/detalle | Historial auditable de movimientos de stock. | encargado/soporte | no | no | medio | Mantener como detalle avanzado. |
| `/clientes` | `src/app/(dashboard)/clientes/page.tsx` | protegida/admin | Lista, busqueda, saldos, acciones de cliente. | encargado | no | no principal | medio | Mantener dentro de Historial. |
| `/clientes/nuevo` | `src/app/(dashboard)/clientes/nuevo/page.tsx` | protegida/form | Alta de cliente. | vendedor/encargado | no | no principal | medio | Mantener como accion interna. |
| `/clientes/[id]` | `src/app/(dashboard)/clientes/[id]/page.tsx` | protegida/detalle | Cuenta corriente, pagos, ventas y presupuestos de cliente. | encargado | no | no | alto | Mantener oculta; pantalla densa. |
| `/clientes/[id]/editar` | `src/app/(dashboard)/clientes/[id]/editar/page.tsx` | protegida/form | Editar cliente. | encargado | no | no | medio | Mantener interna. |
| `/ventas` | `src/app/(dashboard)/ventas/page.tsx` | protegida/historial | Historial de ventas y resumen del dia. | encargado | no | no principal | medio | Mantener en Historial. |
| `/ventas/[id]` | `src/app/(dashboard)/ventas/[id]/page.tsx` | protegida/detalle/impresion | Comprobante de venta. | vendedor/encargado post-venta | no | no principal | bajo | Mantener. |
| `/presupuestos` | `src/app/(dashboard)/presupuestos/page.tsx` | protegida/historial | Lista presupuestos, ver/imprimir, ir a vender. | encargado | no | no principal | medio | Mantener en Historial. |
| `/presupuestos/nuevo` | `src/app/(dashboard)/presupuestos/nuevo/page.tsx` | compatibilidad/redireccion | Redirige a `/inicio`, preserva query params. | enlaces antiguos | no | no | bajo | Mantener por compatibilidad. |
| `/presupuestos/[id]` | `src/app/(dashboard)/presupuestos/[id]/page.tsx` | protegida/detalle/impresion | Detalle, impresion y conversion a venta. | vendedor/encargado | no | no principal | medio | Mantener como detalle. |

Layouts y rutas tecnicas:

| Archivo | Tipo | Funcion | Riesgo | Recomendacion |
|---|---|---|---|---|
| `src/app/layout.tsx` | root layout | Estructura HTML global. | bajo | Mantener. |
| `src/app/(dashboard)/layout.tsx` | layout protegido | Requiere usuario y tenant, envuelve con `DashboardShell`. | medio | Correcto. Revisar multi-tenant selector si crece. |
| `src/components/shell/dashboard-shell.tsx` | shell | Sidebar, header, marca, usuario, logout. | bajo | Correcto para simplicidad actual. |
| `src/app/globals.css` | estilos globales | Tema, print CSS, `no-print`. | medio | Print esta trabajado; validar fisicamente A4. |

## 2. Auditoria de navegacion

| Texto visible | Ruta destino | Archivo | Usuario objetivo | Correcto/Sobra/Confunde | Recomendacion |
|---|---|---|---|---|---|
| Vender | `/inicio` | `nav-items.ts` | vendedor | Correcto | Mantener como primera opcion. |
| Caja | `/caja` | `nav-items.ts` | vendedor | Correcto | Mantener. |
| Stock | `/stock` | `nav-items.ts` | vendedor/encargado | Correcto | Mantener. |
| Administracion | `/ajustes` | `nav-items.ts` | encargado | Correcto secundario | Mantener con menor jerarquia. |
| Historial | `/ajustes/historial` | `nav-items.ts` | encargado | Correcto | Mantener segundo nivel. |
| Configuracion | `/ajustes/configuracion` | `nav-items.ts` | encargado | Leve confusion con `/configuracion` | Considerar `Sistema` o `Datos` si persiste confusion. |
| Clientes | `/clientes` | `nav-items.ts` | encargado | Correcto oculto | No subir al menu principal. |
| Historial de ventas | `/ventas` | `nav-items.ts` | encargado | Correcto oculto | Mantener. |
| Presupuestos | `/presupuestos` | `nav-items.ts` | encargado | Correcto oculto | Mantener. |
| Editar productos | `/productos` | `nav-items.ts` | encargado | Correcto oculto | Mantener. |
| Datos de la ferreteria | `/configuracion` | `nav-items.ts` | owner/admin | Correcto oculto | Implementar contenido real o aclarar pendiente. |
| Ir a vender | `/inicio` | `/presupuestos` | vendedor/encargado | Correcto | Evita duplicar `/presupuestos/nuevo`. |
| Usar en venta | `/inicio?sku=...` | `ProductsBrowser` | encargado/vendedor | Correcto | Mantener; evita `Agregar al presupuesto`. |
| Caja | `/caja` | `QuickSale` | vendedor | Correcto | Acceso contextual util. |
| Ver historial | `/productos/[id]/stock` | `ProductsBrowser` | encargado | Administrativo | Mantener solo en `/productos`. |
| Ver / Imprimir | detalle ventas/presupuestos | listados | encargado | Correcto | Mantener en historial. |

Diagnostico de navegacion:

- El sidebar principal esta bien: solo destacan `Vender`, `Caja`, `Stock`.
- `Administracion` esta bien como acceso secundario.
- Las rutas densas no aparecen en menu principal.
- La navegacion confusa restante aparece dentro de pantallas administrativas, especialmente `/productos`.

## 3. Auditoria pantalla por pantalla

### `/login`

| Campo | Detalle |
|---|---|
| Objetivo | Ingresar al sistema. |
| Que ve el usuario | Marca, texto `Mostrador de ventas`, campos email/password, boton de ingreso. |
| Botones | Entrar / Ingresar segun formulario. |
| Formularios | Email, password. |
| Estados | Error de credenciales en action. |
| Acciones | `loginAction`. |
| Datos consulta/modifica | Supabase Auth; guarda cookies httpOnly. |
| Rol requerido | ninguno. |
| Riesgo UX | Bajo. |
| Riesgo tecnico | Medio si variables Supabase faltan. |
| Recomendacion | Mantener texto simple. |

### `/sin-ferreteria`

| Campo | Detalle |
|---|---|
| Objetivo | Bloquear usuario sin tenant activo. |
| Que ve el usuario | Mensaje de que no tiene ferreteria asignada y boton para salir. |
| Botones | Cerrar sesion / volver al login. |
| Formularios | Form de logout. |
| Acciones | `logoutWithoutTenantAction`. |
| Datos consulta/modifica | Limpia cookies. |
| Rol requerido | usuario autenticado sin tenant. |
| Riesgo UX | Medio: es pantalla de soporte. |
| Recomendacion | Evitar palabra `tenant`; usar `ferreteria`. |

### `/inicio` como Vender

| Campo | Detalle |
|---|---|
| Objetivo | Vender o guardar presupuesto desde un solo POS. |
| Que ve el usuario | Titulo `Vender`, buscador, resultados con stock, carrito/lista, caja, total, pago, botones `Venta` y `Presupuesto`. |
| Botones | Buscar/agregar producto, quitar linea, `Venta`, `Presupuesto`, `Caja`. |
| Formularios | Busqueda, cantidad, cliente opcional, pago, monto pagado, notas. |
| Estados | Sin resultados, carrito vacio, error de stock, error de caja/pago, pendiente. |
| Acciones | `searchQuoteProductsAction`, `getQuoteProductBySkuAction`, `saveQuoteAction`, `saveQuoteAndConvertToSaleAction`. |
| Datos consulta | products, customers, cash_register_sessions. |
| Datos modifica | quotes, quote_items; al vender tambien sales, sale_items, products stock, inventory_movements, cash session association, cuenta corriente si aplica. |
| Rol requerido | owner/admin/seller para acciones criticas. |
| Riesgo UX | Medio: pago y monto pueden agregar decision antes de vender. |
| Riesgo tecnico | Alto por ser flujo critico; logica correcta concentrada en RPCs. |
| Recomendacion | Mantener. Mejorar sticky total/botones en pantallas chicas. |

### `/caja`

| Campo | Detalle |
|---|---|
| Objetivo | Abrir/cerrar caja y ver efectivo esperado. |
| Que ve el usuario | Estado caja abierta/cerrada, efectivo esperado, ventas de sesion, historial de cierres. |
| Botones | Abrir caja, Cerrar caja. |
| Formularios | Monto inicial, efectivo contado, notas. |
| Acciones | `openCashSessionAction`, `closeCashSessionAction`. |
| Datos consulta | cash_register_sessions, sales. |
| Datos modifica | cash_register_sessions. |
| Rol requerido | owner/admin/seller. |
| Riesgo UX | Bajo/medio: cierre de caja es sensible. |
| Riesgo tecnico | Medio: depende de `cash_session_id` en ventas via RPC. |
| Recomendacion | Mantener simple. Confirmacion antes de cerrar es correcta. |

### `/stock`

| Campo | Detalle |
|---|---|
| Objetivo | Consultar stock/precio y hacer ajustes simples. |
| Que ve el usuario | Buscador, filtro `Solo con stock`, accesos `Ver todos` y `Ver faltantes`, contador, productos, acciones. |
| Botones | Buscar, Ver todos, Ver faltantes, Ajustar stock, Cambiar precio. |
| Formularios | Busqueda, ajuste de stock, edicion de producto. |
| Acciones | `adjustProductStockAction`, `updateProductAction`. |
| Datos consulta | products. |
| Datos modifica | products, inventory_movements via RPC. |
| Rol requerido | lectura por tenant; ajuste owner/admin/seller; edicion owner/admin. |
| Riesgo UX | Medio: `Cambiar precio` abre formulario avanzado. |
| Riesgo tecnico | Medio: mostrar edicion a seller puede terminar en error de permisos. |
| Recomendacion | Separar precio simple de edicion completa; ocultar edicion si rol no corresponde. |

### `/ajustes` Administracion

| Campo | Detalle |
|---|---|
| Objetivo | Entrada secundaria para encargado. |
| Que ve el usuario | Texto orientador y dos tarjetas: Historial, Configuracion. |
| Botones | Abrir Historial, Abrir Configuracion. |
| Datos | no modifica. |
| Rol requerido | tenant member. |
| Riesgo UX | Bajo. |
| Recomendacion | Mantener. |

### `/ajustes/historial`

| Campo | Detalle |
|---|---|
| Objetivo | Agrupar rutas de revision. |
| Que ve el usuario | Ventas, Presupuestos, Clientes. |
| Botones | Abrir cada seccion. |
| Riesgo UX | Bajo. |
| Recomendacion | Mantener un nivel adentro. |

### `/ajustes/configuracion`

| Campo | Detalle |
|---|---|
| Objetivo | Agrupar configuracion administrativa. |
| Que ve el usuario | Editar productos, Datos de la ferreteria. |
| Botones | Abrir cada seccion. |
| Riesgo UX | Medio por palabra configuracion duplicada. |
| Recomendacion | Mantener oculto y simple. |

### `/configuracion`

| Campo | Detalle |
|---|---|
| Objetivo | Futuro manejo de datos de ferreteria. |
| Que ve el usuario | Titulo `Datos de la ferreteria`, estado vacio `Datos del negocio`. |
| Botones | ninguno critico. |
| Acciones | ninguna de negocio. |
| Riesgo UX | Medio: placeholder. |
| Riesgo tecnico | Bajo. |
| Recomendacion | Implementar datos reales antes de dejarlo visible a encargado final. |

### `/productos`

| Campo | Detalle |
|---|---|
| Objetivo | Catalogo avanzado. |
| Que ve el usuario | Buscadores, filtros, modo `Vista simple`/`Editar productos`, cards densas, acciones. |
| Botones | Buscar, Limpiar, Ver todos, Editar, Ajustar stock, Usar en venta, Ver historial, Ver mas productos. |
| Formularios | Busqueda, edicion producto, ajuste stock. |
| Acciones | `search_products` RPC en page, `updateProductAction`, `adjustProductStockAction`. |
| Datos consulta | products, categories, brands. |
| Datos modifica | products, inventory_movements. |
| Rol requerido | lectura tenant; edicion owner/admin; ajuste owner/admin/seller. |
| Riesgo UX | Alto para mostrador. |
| Riesgo tecnico | Medio. |
| Recomendacion | Mantener solo como `Editar productos` dentro de Administracion. |

### `/productos/importar`

| Campo | Detalle |
|---|---|
| Objetivo | Carga masiva CSV. |
| Que ve el usuario | Selector de archivo, preview de 20 filas, resumen de importacion. |
| Botones | Importar productos. |
| Formularios | Archivo CSV. |
| Acciones | `importProductsAction`. |
| Datos consulta/modifica | products, categories, brands, import_batches probablemente. |
| Rol requerido | debe ser owner/admin, pero revisar action. |
| Riesgo UX | Alto: tarea tecnica. |
| Riesgo tecnico | Alto: cambios masivos y tenant fallback. |
| Recomendacion | Mantener muy oculto; reforzar permisos. |

### `/productos/[id]/stock`

| Campo | Detalle |
|---|---|
| Objetivo | Ver movimientos historicos de stock. |
| Que ve el usuario | Tabla/lista de movimientos. |
| Botones | Volver / navegacion contextual. |
| Datos consulta | inventory_movements, product. |
| Riesgo UX | Medio: administrativo. |
| Recomendacion | Mantener como detalle para encargado. |

### `/clientes`

| Campo | Detalle |
|---|---|
| Objetivo | Buscar clientes y ver saldos. |
| Que ve el usuario | Buscador, lista de clientes, saldo, botones nuevo/ver/editar. |
| Botones | Nuevo cliente, Ver, Editar. |
| Formularios | Busqueda. |
| Datos consulta | customers, customer_account_balances. |
| Riesgo UX | Medio. |
| Recomendacion | Mantener dentro de Historial. |

### `/clientes/nuevo` y `/clientes/[id]/editar`

| Campo | Detalle |
|---|---|
| Objetivo | Alta/edicion de cliente. |
| Que ve el usuario | Form con nombre, telefono, email, direccion, notas. |
| Botones | Guardar cliente. |
| Acciones | `createCustomerAction`, `updateCustomerAction`. |
| Rol requerido | create owner/admin/seller; update owner/admin. |
| Riesgo UX | Bajo/medio. |
| Recomendacion | Correcto; mantener campos simples. |

### `/clientes/[id]`

| Campo | Detalle |
|---|---|
| Objetivo | Ficha y cuenta corriente. |
| Que ve el usuario | Datos cliente, saldo, registrar pago, ventas, presupuestos. |
| Botones | Editar cliente, Registrar pago, Ver venta, Ver presupuesto. |
| Formularios | Pago de cuenta corriente. |
| Acciones | `registerCustomerPaymentAction`. |
| Datos consulta/modifica | customers, sales, quotes, customer_account_movements. |
| Riesgo UX | Alto para mostrador. |
| Recomendacion | Mantener para encargado. |

### `/ventas` y `/ventas/[id]`

| Campo | Detalle |
|---|---|
| Objetivo | Historial y comprobante de ventas. |
| Que ve el usuario | Resumen, lista, detalle imprimible. |
| Botones | Ver, Imprimir. |
| Datos consulta | sales, sale_items, customers. |
| Riesgo UX | Medio. |
| Recomendacion | Mantener dentro de Historial. |

### `/presupuestos`, `/presupuestos/nuevo`, `/presupuestos/[id]`

| Campo | Detalle |
|---|---|
| Objetivo | Historial, compatibilidad de nuevo, detalle/impresion/conversion. |
| Que ve el usuario | Lista, `Ir a vender`, Ver, Imprimir, Convertir en venta. |
| Botones | Ir a vender, Ver, Imprimir, Convertir en venta. |
| Acciones | redirect a `/inicio`; `convertQuoteToSaleAction`. |
| Datos consulta/modifica | quotes, quote_items, sales, stock por RPC. |
| Riesgo UX | Medio: `Convertir en venta` es accion critica. |
| Recomendacion | Mantener. Confirmacion antes de convertir es necesaria. |

## 4. Inventario de botones visibles

| Pantalla | Boton | Que hace | Archivo | Accion/Link | Riesgo | Recomendacion |
|---|---|---|---|---|---|---|
| Login | Ingresar | Autentica usuario. | `login-form.tsx` | `loginAction` | seguro | Mantener. |
| Sin ferreteria | Cerrar sesion | Limpia cookies y vuelve a login. | `sin-ferreteria/page.tsx` | `logoutWithoutTenantAction` | seguro | Mantener. |
| Shell | Salir | Logout. | `dashboard-shell.tsx` | `logoutAction` | seguro | Mantener. |
| Sidebar | Vender | Navega al POS. | `sidebar-nav.tsx` | `/inicio` | seguro | Destacar. |
| Sidebar | Caja | Navega caja. | `sidebar-nav.tsx` | `/caja` | seguro | Destacar. |
| Sidebar | Stock | Navega stock. | `sidebar-nav.tsx` | `/stock` | seguro | Destacar. |
| Sidebar | Administracion | Navega admin. | `sidebar-nav.tsx` | `/ajustes` | administrativo | Menor jerarquia. |
| Vender | Agregar | Agrega producto al carrito. | `quick-sale.tsx` | estado local | seguro | Mantener grande. |
| Vender | Quitar | Quita linea del carrito. | `quick-sale.tsx` | estado local + confirm | seguro | Mantener confirmacion. |
| Vender | Venta | Guarda presupuesto y convierte a venta. | `quick-sale.tsx` | `saveQuoteAndConvertToSaleAction` | peligroso/critico | Mantener claro; requiere pago valido. |
| Vender | Presupuesto | Guarda presupuesto. | `quick-sale.tsx` | `saveQuoteAction` | seguro | Considerar `Guardar presupuesto`. |
| Vender | Caja | Va a caja. | `quick-sale.tsx` | `/caja` | seguro | Mantener contextual. |
| Caja | Abrir caja | Crea sesion abierta. | `cash-forms.tsx` | `openCashSessionAction` | critico | Mantener simple. |
| Caja | Cerrar caja | Cierra sesion. | `cash-forms.tsx` | `closeCashSessionAction` | peligroso | Confirmacion correcta. |
| Stock | Buscar | Filtra productos. | `stock/page.tsx` | query params | seguro | Mantener. |
| Stock | Ver todos | Incluye sin stock. | `stock/page.tsx` | query params | seguro | Correcto. |
| Stock | Ver faltantes | Muestra sin stock. | `stock/page.tsx` | query params | seguro | Correcto para revisar faltantes. |
| Stock | Ajustar stock | Abre form de ajuste. | `stock/page.tsx` | UI + `adjustProductStockAction` | administrativo | Mantener con motivo. |
| Stock | Cambiar precio | Abre formulario de producto. | `stock/page.tsx` | UI + `updateProductAction` | confuso | Separar precio simple de producto completo. |
| Productos | Vista simple | Cambia modo. | `ProductsBrowser` | query mode | confuso | Ocultar en etapa futura. |
| Productos | Editar productos | Cambia modo. | `ProductsBrowser` | query mode | administrativo | Mantener solo encargado. |
| Productos | Editar | Abre edicion de producto. | `ProductsBrowser` | UI | administrativo | Correcto oculto. |
| Productos | Ajustar stock | Abre ajuste. | `ProductsBrowser` | UI | administrativo | Correcto oculto. |
| Productos | Usar en venta | Va a `/inicio?sku=`. | `ProductsBrowser` | link | seguro | Correcto. |
| Productos | Ver historial | Va a movimientos. | `ProductsBrowser` | link | administrativo | Correcto oculto. |
| Importar | Importar productos | Carga CSV. | `ImportProductsForm` | `importProductsAction` | peligroso | Reforzar permisos y ocultar. |
| Clientes | Nuevo cliente | Alta cliente. | `clientes/page.tsx` | `/clientes/nuevo` | administrativo | Mantener en Historial. |
| Clientes | Ver | Detalle cliente. | `clientes/page.tsx` | `/clientes/[id]` | administrativo | Mantener. |
| Clientes | Editar | Edicion cliente. | `clientes/page.tsx` | `/clientes/[id]/editar` | administrativo | Mantener. |
| Cliente detalle | Registrar pago | Agrega movimiento credito. | `payment-form.tsx` | `registerCustomerPaymentAction` | peligroso | Mantener para encargado/vendedor capacitado. |
| Ventas | Ver | Abre comprobante. | `ventas/page.tsx` | `/ventas/[id]` | seguro | Mantener. |
| Ventas | Imprimir | Abre detalle con print. | `ventas/page.tsx` | `/ventas/[id]?print=1` | seguro | Mantener. |
| Presupuestos | Ir a vender | Va al POS. | `presupuestos/page.tsx` | `/inicio` | seguro | Correcto. |
| Presupuesto detalle | Convertir en venta | Convierte y descuenta stock. | `quote-actions.tsx` | `convertQuoteToSaleAction` | peligroso | Mantener confirmacion. |

## 5. Auditoria de formularios

| Pantalla | Formulario | Campos | Obligatorios | Validaciones | Accion | Riesgo UX | Riesgo tecnico |
|---|---|---|---|---|---|---|---|
| Login | Ingreso | email, password | ambos | Supabase Auth | `loginAction` | bajo | medio |
| Vender | Busqueda POS | texto, cantidad | texto para buscar; cantidad > 0 | productos activos con stock | `searchQuoteProductsAction` | bajo | medio |
| Vender | Cliente opcional | cliente existente o nombre/telefono/email/direccion | no | cliente requerido si cuenta corriente pendiente | RPC conversion | medio | alto |
| Vender | Pago | metodo, monto pagado | para venta | pago no negativo; contado cubre total | `saveQuoteAndConvertToSaleAction` | medio | alto |
| Vender | Guardar presupuesto | items, cliente opcional, notas | items | productos encontrados | `saveQuoteAction` | bajo | alto |
| Caja | Abrir caja | monto inicial, notas | monto valido | monto >= 0 | `openCashSessionAction` | bajo | medio |
| Caja | Cerrar caja | efectivo contado, notas | efectivo contado | caja abierta, monto >= 0 | `closeCashSessionAction` | medio | medio |
| Stock | Ajustar stock | stock final, motivo | ambos | numero >= 0, motivo no vacio | `adjustProductStockAction` | medio | medio |
| Stock/Productos | Editar producto | sku, nombre, descripcion, precio, stock, categoria, marca, activo, imagen | varios | action normaliza y valida | `updateProductAction` | alto | medio |
| Clientes | Crear cliente | nombre, telefono, email, direccion, notas | nombre | email type client-side | `createCustomerAction` | bajo | medio |
| Clientes | Editar cliente | idem | nombre | rol owner/admin | `updateCustomerAction` | medio | medio |
| Cliente detalle | Registrar pago | monto, notas | monto | monto > 0 | `registerCustomerPaymentAction` | medio | medio |
| Importar | CSV productos | archivo CSV | archivo | preview local + parse CSV | `importProductsAction` | alto | alto |
| Presupuesto detalle | Convertir venta | pago, monto, cliente si aplica | depende metodo | RPC valida | `convertQuoteToSaleAction` | medio | alto |

## 6. Auditoria de textos visibles

| Texto actual | Donde aparece | Problema | Texto sugerido |
|---|---|---|---|
| Presupuesto | POS y listados | Puede ser termino comercial valido, pero no todos lo entienden. | `Guardar presupuesto` para boton final. |
| Convertir en venta | Detalle presupuesto | Correcto pero accion critica. | Mantener con confirmacion: `Confirmar venta`. |
| Vista simple | `/productos` | Indica modos, puede confundir. | Evitar modos; usar una sola vista por pantalla. |
| Editar productos | `/productos`, Administracion | Correcto para encargado. | Mantener. |
| Configuracion | `/ajustes/configuracion` | Puede confundirse con `/configuracion`. | `Datos y productos` o mantener si usuario no ve rutas. |
| Datos de la ferreteria | `/configuracion` | Correcto. | Mantener. |
| Necesitan revision | importacion | Correcto para admin, no para vendedor. | Mantener oculto. |
| Motivo obligatorio | ajuste stock | Puede sonar duro. | `Motivo del ajuste`. |
| Error tecnico/RPC/tenant/service role | docs/errores internos | No debe aparecer al usuario final. | Traducir a mensajes humanos si aparece en UI. |
| Comprobante | ventas/impresion | Comprensible en Argentina. | Mantener. |

Nota de encoding: algunos comandos en PowerShell pueden mostrar mojibake en textos con acentos. Validar render real en navegador antes de corregir masivamente; no hacer cambios mecanicos sin confirmar el archivo en UTF-8.

## 7. Flujos completos

### A. Vender producto

| Item | Detalle |
|---|---|
| Pasos actuales | `/inicio` -> buscar producto -> agregar -> elegir pago/monto -> `Venta` -> `/ventas/[id]`. |
| Rutas | `/inicio`, `/ventas/[id]`. |
| Botones | Agregar, Venta. |
| Simple/Complejo | Aceptable. |
| Traba +65 | Metodo de pago y monto pueden generar duda. |
| Recomendacion | Dejar pago por defecto en efectivo y total precargado; botones finales siempre visibles. |

### B. Armar presupuesto

| Item | Detalle |
|---|---|
| Pasos actuales | `/inicio` -> buscar/agregar -> opcional cliente -> `Presupuesto` -> `/presupuestos/[id]`. |
| Simple/Complejo | Aceptable. |
| Traba +65 | Palabra `Presupuesto` puede requerir explicacion. |
| Recomendacion | Boton `Guardar presupuesto`. |

### C. Convertir presupuesto en venta

| Item | Detalle |
|---|---|
| Pasos actuales | `/presupuestos` -> Ver -> Convertir en venta -> confirmar -> `/ventas/[id]`. |
| Simple/Complejo | Aceptable para encargado. |
| Traba +65 | Accion irreversible/descuenta stock. |
| Recomendacion | Mantener confirmacion y mostrar total antes de confirmar. |

### D. Abrir caja

| Item | Detalle |
|---|---|
| Pasos actuales | `/caja` -> monto inicial -> Abrir caja. |
| Simple/Complejo | Muy simple. |
| Recomendacion | Mantener. |

### E. Cerrar caja

| Item | Detalle |
|---|---|
| Pasos actuales | `/caja` -> efectivo contado -> Cerrar caja -> confirmacion. |
| Simple/Complejo | Aceptable. |
| Traba +65 | Diferencia de caja puede asustar si no se explica. |
| Recomendacion | Texto simple: `Efectivo contado` y `Diferencia`. |

### F. Ajustar stock

| Item | Detalle |
|---|---|
| Pasos actuales | `/stock` o `/productos` -> Ajustar stock -> stock final + motivo -> guardar. |
| Simple/Complejo | Aceptable. |
| Traba +65 | "Motivo obligatorio" y stock final vs suma/resta. |
| Recomendacion | Mantener en Stock, texto `Motivo del ajuste`; considerar botones +1/-1 para mostrador. |

### G. Cambiar precio

| Item | Detalle |
|---|---|
| Pasos actuales | `/stock` -> Cambiar precio -> formulario completo de producto -> guardar. |
| Simple/Complejo | Confusa. |
| Traba +65 | Ve demasiados campos para solo precio. |
| Recomendacion | Crear formulario simple solo precio en etapa futura; dejar edicion completa en `/productos`. |

### H. Crear cliente

| Item | Detalle |
|---|---|
| Pasos actuales | `/clientes` -> Nuevo cliente -> completar -> guardar. |
| Simple/Complejo | Aceptable. |
| Traba +65 | No deberia ser flujo principal de venta. |
| Recomendacion | Cliente opcional desde POS; clientes completo en Historial. |

### I. Registrar pago de cuenta corriente

| Item | Detalle |
|---|---|
| Pasos actuales | `/clientes/[id]` -> monto -> registrar pago. |
| Simple/Complejo | Administrativo. |
| Traba +65 | Riesgo de monto incorrecto. |
| Recomendacion | Mantener para encargado/seller capacitado; confirmar si monto alto. |

### J. Imprimir comprobante

| Item | Detalle |
|---|---|
| Pasos actuales | venta/presupuesto detalle -> Imprimir o `?print=1`. |
| Simple/Complejo | Aceptable. |
| Traba +65 | Impresion depende del navegador. |
| Recomendacion | Validar fisicamente con impresora real. |

### K. Importar productos

| Item | Detalle |
|---|---|
| Pasos actuales | `/productos/importar` -> elegir CSV -> preview -> importar. |
| Simple/Complejo | Demasiado compleja para usuario comun. |
| Recomendacion | Solo owner/admin/soporte; no mostrar en flujo diario. |

### L. Revisar historial

| Item | Detalle |
|---|---|
| Pasos actuales | Administracion -> Historial -> ventas/presupuestos/clientes. |
| Simple/Complejo | Aceptable para encargado. |
| Recomendacion | Mantener en segundo nivel. |

## 8. Permisos y roles

Matriz de acciones criticas:

| Accion | owner | admin | seller | viewer | Archivo | Helper usado | Correcto |
|---|---:|---:|---:|---:|---|---|---|
| Ver dashboard | si | si | si | si | `(dashboard)/layout.tsx` | `requireUser`, `requireTenant` | si |
| Vender | si | si | si | no | `presupuestos/nuevo/actions.ts` | `requireTenantRole` | si |
| Guardar presupuesto | si | si | si | no | `presupuestos/nuevo/actions.ts` | `requireTenantRole` | si |
| Buscar productos POS | si | si | si | no | `presupuestos/nuevo/actions.ts` | `requireTenantRole` | si |
| Convertir presupuesto | si | si | si | no | `presupuestos/[id]/actions.ts` | `requireTenantRole` | si |
| Abrir caja | si | si | si | no | `caja/actions.ts` | `requireTenantRole` | si |
| Cerrar caja | si | si | si | no | `caja/actions.ts` | `requireTenantRole` | si |
| Crear cliente | si | si | si | no | `clientes/actions.ts` | `requireTenantRole` | si |
| Editar cliente | si | si | no | no | `clientes/actions.ts` | `requireTenantRole` | si |
| Registrar pago | si | si | si | no | `clientes/actions.ts` | `requireTenantRole` | si |
| Editar producto | si | si | no | no | `productos/actions.ts` | `requireTenantRole` | si |
| Ajustar stock | si | si | si | no | `productos/actions.ts` | `requireTenantRole` | si |
| Importar productos | revisar | revisar | revisar | revisar | `productos/importar/actions.ts` | `getCurrentTenant`/service role | no confirmado |

Observaciones:

- `requireTenant()` selecciona el primer tenant activo. Es suficiente para una ferreteria, no para multi-tenant real.
- Las Server Actions criticas principales usan `requireTenantRole`.
- Las paginas de lectura usan service role server-side despues de `requireTenant`; esto evita RLS client-side, pero exige disciplina de tenant filter en cada query.
- Importacion requiere auditoria puntual de permisos antes de produccion.

## 9. Auditoria Supabase

| Objeto Supabase | Tipo | Usado por | Archivo | Riesgo | Recomendacion |
|---|---|---|---|---|---|
| `tenants` | tabla | tenant actual, datos negocio | `require-tenant.ts`, paginas | medio | Mantener; agregar selector si hay multiples. |
| `tenant_members` | tabla | auth/roles | `require-tenant.ts` | medio | Mantener. |
| `products` | tabla | POS, stock, productos, ventas | multiples | alto | Proteger edicion; no tocar sin migracion planificada. |
| `categories` | tabla | productos/importacion | productos | bajo | Mantener. |
| `brands` | tabla | productos/importacion | productos | bajo | Mantener. |
| `customers` | tabla | POS, clientes, ventas | clientes/POS | medio | Mantener. |
| `quotes` | tabla | presupuestos/POS | presupuestos | alto | Mantener. |
| `quote_items` | tabla | presupuestos/venta | presupuestos | alto | Mantener. |
| `sales` | tabla | ventas/caja | ventas/caja/RPC | alto | Mantener. |
| `sale_items` | tabla | detalle venta | ventas | alto | Mantener. |
| `inventory_movements` | tabla | stock, ventas, auditoria | stock/productos/RPC | alto | Mantener. |
| `customer_account_movements` | tabla | cuenta corriente | clientes/RPC | alto | Mantener. |
| `customer_account_balances` | vista | clientes | clientes | medio | Mantener. |
| `cash_register_sessions` | tabla | caja, ventas | caja/RPC | alto | Mantener. |
| `low_stock_products` | vista | bajo stock | productos/stock potencial | bajo | Mantener. |
| `import_batches` | tabla | importacion | importar | medio | Mantener. |
| `search_products` | RPC | buscador productos | `/productos` | medio | Mantener. |
| `create_quote_with_items` | RPC | guardar presupuesto/POS | POS actions | alto | Mantener. |
| `convert_quote_to_sale` | RPC | venta, conversion, stock, caja | POS y presupuesto detalle | critico | No mover logica a TypeScript. |
| `adjust_product_stock` | RPC | ajuste stock | productos actions | alto | Mantener. |
| `product-images` | Storage bucket | imagenes productos | product edit/import | medio | Revisar politicas en prod. |

Migraciones:

| Migracion | Contenido principal | Riesgo | Recomendacion |
|---|---|---|---|
| `001_initial_schema_supabase.sql` | tablas base, tipos, RLS inicial | alto | No tocar sin plan. |
| `003_search_products_rpc.sql` | busqueda productos | medio | Mantener. |
| `004_customer_account_movements.sql` | cuenta corriente | alto | Mantener. |
| `005_convert_quote_to_sale_rpc.sql` | conversion presupuesto a venta | critico | Mantener historico; la version actual fue refinada despues. |
| `006_stock_rpc_and_search.sql` | ajuste stock, search refinado, bajo stock | alto | Mantener. |
| `007_refine_low_stock_view.sql` | vista bajo stock | bajo | Mantener. |
| `008_cash_register_sessions.sql` | sesiones caja y RPC convert con caja | critico | Mantener. |
| `009_create_quote_rpc.sql` | creacion transaccional presupuesto/items | critico | Mantener. |
| `010_seed_demo_tenant.sql` | demo seed | medio | No usar como verdad productiva. |
| `011_storage_product_images_policies.sql` | bucket/policies imagenes | medio | Validar en Supabase real. |

## 10. Duplicaciones y rutas confusas

| Duplicacion | Riesgo | Mantener | Ocultar | Redirigir | Recomendacion |
|---|---|---|---|---|---|
| `/inicio` vs `/presupuestos/nuevo` | bajo ahora | si | si | ya redirige | Mantener compatibilidad. |
| `/stock` vs `/productos` | alto | si | `/productos` | no | `Stock` vendedor; `Editar productos` encargado. |
| `/ajustes/configuracion` vs `/configuracion` | medio | si | ambas salvo admin | no | Cambiar copy si confunde. |
| `Venta` vs `Presupuesto` | medio | si | no | no | Botones finales claros: `Venta` y `Guardar presupuesto`. |
| Productos simple vs avanzado | alto | si | avanzado | no | Evitar modos en etapa futura. |
| `/ventas` vs ventas en `/caja` | bajo | si | historial admin | no | Caja muestra sesion; Ventas muestra historial. |
| Clientes modulo vs clientes en Historial | bajo | si | no principal | no | Mantener en Historial. |
| Historial stock `/productos/[id]/stock` vs Stock | medio | si | historial | no | Historial solo encargado. |

## 11. Evaluacion UX +65/cero tecnologia

| Zona | Nivel | Problema | Recomendacion |
|---|---|---|---|
| Sidebar | Muy simple | Ninguno relevante. | Mantener 3 principales + Administracion secundaria. |
| Vender/POS | Aceptable | Pago, cliente opcional y total pueden quedar con scroll. | Sticky total/botones, menos decisiones por defecto. |
| Caja | Muy simple | Cierre es sensible. | Mantener confirmacion. |
| Stock | Aceptable | Cambiar precio abre edicion completa. | Separar precio simple. |
| Administracion | Muy simple | Solo dos tarjetas. | Mantener. |
| Historial | Aceptable | Tres opciones. | Mantener segundo nivel. |
| Productos | Demasiado compleja | Modos, filtros, varias acciones por producto. | Solo encargado. |
| Clientes detalle | Confusa | Muchas secciones y cuenta corriente. | Solo encargado. |
| Importacion | Demasiado compleja | CSV, preview, errores. | Solo owner/admin/soporte. |
| Impresion | Aceptable | Depende navegador/impresora. | Probar en local real. |

## 12. Layout y renderizado

Desktop:

- Sidebar compacto y correcto.
- `Vender` usa dos columnas; carrito a la derecha funciona bien en pantallas amplias.
- `Productos`, `Clientes`, `Ventas` y `Presupuestos` usan cards/tablas con mucha informacion. Esto es aceptable para encargado, no para mostrador.

Notebook 1366x768:

- Riesgo de scroll en `/inicio` para llegar a total y botones si hay resultados/carrito largo.
- `/productos` y `/clientes/[id]` pueden exigir scroll y lectura fina.
- Botones grandes ayudan, pero la densidad de cards reduce foco.

Mobile/tablet:

- La app parece usable por layout responsive, pero el POS puede poner carrito/botones debajo de resultados.
- Para mostrador real, validar el dispositivo principal antes de invertir en mobile.

Impresion:

- `globals.css` tiene reglas `@media print`, `.no-print`, A4 portrait, tabla con headers repetibles y estilos de comprobante.
- Riesgo: comprobar con impresora real termica/A4. Si la ferreteria usa ticketera, el layout A4 no alcanza.

Recomendaciones de layout:

- POS: total y botones finales siempre visibles.
- Stock: mantener lista simple; ocultar edicion avanzada.
- Administracion: listas verticales antes que cards grandes si el cliente sigue sintiendo complejidad.
- No agregar dashboards, metricas ni accesos rapidos al flujo principal.

## 13. Auditoria impresion/comprobantes

| Elemento | Estado | Riesgo | Recomendacion |
|---|---|---|---|
| Logo/marca | Presente en `PrintDocument`/CSS. | bajo | Validar tamano impreso. |
| Datos ferreteria | Presentes via brand/business info. | medio | Cuando `/configuracion` sea real, conectar datos editables. |
| Datos cliente | Presentes si existe cliente. | bajo | Mantener opcional. |
| Productos | Tabla con codigo, descripcion, cantidad, precio, total. | bajo | Mantener. |
| Total | Destacado. | bajo | Mantener. |
| Forma de pago | Presente en venta. | bajo | Mantener. |
| Cuenta corriente | RPC registra saldo pendiente. | medio | Mostrar claro cuando queda deuda. |
| Pie de pagina | Presente. | bajo | Mantener. |
| `.no-print` | Implementado. | bajo | Mantener. |
| `?print=1` | Usado para abrir detalle imprimible. | bajo | Mantener. |

## 14. Plan de simplificacion por etapas

### Etapa 1: cambios de texto sin riesgo

| Item | Detalle |
|---|---|
| Objetivo | Reducir terminos tecnicos. |
| Archivos | login, configuracion, presupuestos, productos, ajustes. |
| Riesgo | bajo. |
| Validacion | lint/build; revisar textos. |
| Rollback | revert de cambios de copy. |
| Estado | Implementada segun auditoria previa. |

### Etapa 2: ocultar navegacion duplicada

| Item | Detalle |
|---|---|
| Objetivo | Que solo `/inicio` sea entrada mental para operaciones nuevas. |
| Archivos | `/presupuestos`, `/productos`, `/presupuestos/nuevo`. |
| Riesgo | bajo/medio. |
| Validacion | probar `/presupuestos/nuevo?sku=...`. |
| Rollback | restaurar links anteriores. |
| Estado | Implementada: `/presupuestos/nuevo` redirige a `/inicio`. |

### Etapa 3: consolidar rutas duplicadas

| Item | Detalle |
|---|---|
| Objetivo | Mantener rutas pero reducir identidades paralelas. |
| Archivos | `/productos`, `/stock`, `/configuracion`. |
| Riesgo | medio. |
| Validacion | recorrida manual de Administracion. |
| Rollback | restaurar etiquetas/links. |

### Etapa 4: simplificar Stock

| Item | Detalle |
|---|---|
| Objetivo | Stock como pantalla de consulta y ajustes basicos. |
| Archivos | `/stock`, `ProductEditForm` o nuevo form simple. |
| Riesgo | medio. |
| Validacion | buscar con stock, sin stock, ajustar, cambiar precio. |
| Rollback | volver a formulario anterior. |
| Estado | Filtro `Solo con stock` ya mejorado. Pendiente separar precio simple. |

### Etapa 5: mejorar POS

| Item | Detalle |
|---|---|
| Objetivo | Vender sin scroll ni dudas. |
| Archivos | `QuickSale`. |
| Riesgo | alto por flujo critico. |
| Validacion | venta, presupuesto, cuenta corriente, caja abierta/cerrada. |
| Rollback | revert componente POS. |

### Etapa 6: limpiar impresion

| Item | Detalle |
|---|---|
| Objetivo | Comprobantes claros y reales para impresora del local. |
| Archivos | `PrintDocument`, `globals.css`, detalle venta/presupuesto. |
| Riesgo | medio. |
| Validacion | imprimir A4/ticket real. |
| Rollback | revert estilos print. |

### Etapa 7: documentacion final

| Item | Detalle |
|---|---|
| Objetivo | Manual minimo para encargado y checklist tecnico. |
| Archivos | README/operativo. |
| Riesgo | bajo. |
| Validacion | lectura con usuario real. |
| Rollback | revert docs. |

## 15. Recomendaciones priorizadas

1. No tocar RPCs de venta, presupuesto, stock ni caja si no hay bug probado.
2. Mantener `Vender`, `Caja`, `Stock` como unico menu principal.
3. Mantener `/productos`, `/clientes`, `/ventas`, `/presupuestos`, `/configuracion` fuera del menu principal.
4. Revisar permisos de `/productos/importar` antes de produccion.
5. Separar `Cambiar precio` simple en `/stock` de `Editar productos` completo.
6. Cambiar boton `Presupuesto` del POS a `Guardar presupuesto` si el cliente lo aprueba.
7. Validar `/inicio` en la pantalla fisica del mostrador para confirmar que total y botones se ven sin scroll.
8. Validar impresion real antes de entregar.

## 16. Cosas que no conviene tocar ahora

- No borrar rutas existentes.
- No borrar `/presupuestos/nuevo`; ya sirve como compatibilidad.
- No mover logica de `convert_quote_to_sale` a TypeScript.
- No cambiar esquema de tablas sin necesidad.
- No crear migraciones para cambios de UX.
- No tocar auth, cookies, tenant ni roles salvo auditoria puntual.
- No convertir `/productos` en pantalla principal.
- No agregar dashboards, metricas o accesos rapidos al flujo de vendedor.
- No exponer importacion CSV en navegacion principal.
- No cambiar RLS/policies sin plan de seguridad y prueba en Supabase.

## 17. Validacion de esta auditoria

- Se revisaron rutas bajo `src/app`.
- Se revisaron componentes principales bajo `src/components`.
- Se revisaron helpers relevantes bajo `src/lib`.
- Se revisaron migraciones bajo `supabase/migrations`.
- Se revisaron documentos operativos principales.
- No se ejecuto `npm run lint` ni `npm run build` porque el pedido fue documentar sin modificar codigo.
- No se hizo commit.

