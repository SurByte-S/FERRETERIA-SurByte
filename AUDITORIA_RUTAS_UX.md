# Auditoria de rutas y UX

Fecha: 2026-05-14

## Resumen ejecutivo

La app ya esta cerca del modelo deseado para mostrador: el sidebar destaca solo `Vender`, `Caja` y `Stock`, y deja `Administracion` como acceso secundario. La pantalla `/inicio` ya funciona como POS real y no como tablero de accesos.

El riesgo principal no esta hoy en el sidebar, sino en rutas secundarias que siguen pareciendo parte del flujo diario cuando se entra por enlaces internos: `/presupuestos/nuevo` duplica a `/inicio`, `/productos` duplica parte de `/stock`, y `/ajustes/configuracion` convive con `/configuracion`, lo que puede confundir a usuarios +65 o sin experiencia digital.

Recomendacion general: mantener las rutas existentes, pero declarar una arquitectura visual estricta: el vendedor solo debe vivir en `Vender`, `Caja` y `Stock`; todo lo demas debe quedar como historial, configuracion o detalle interno. No conviene borrar rutas porque varias son detalles, impresiones, conversiones o pantallas de soporte administrativo.

## Tabla completa de rutas

| Ruta | Archivo | Que hace | Usuario objetivo | Visible en menu | Recomendada |
|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | Redirige a `/inicio`. | todos | no | Mantener como entrada tecnica. |
| `/login` | `src/app/login/page.tsx` | Pantalla de ingreso. | todos | no | Mantener. Cambiar texto "Sistema de gestion" por "Ingresar al mostrador". |
| `/sin-ferreteria` | `src/app/sin-ferreteria/page.tsx` | Error cuando el usuario no tiene tenant asignado. | soporte/usuario bloqueado | no | Mantener oculta. |
| `/inicio` | `src/app/(dashboard)/inicio/page.tsx` | Carga clientes, estado de caja y muestra `QuickSale`. | vendedor | si, como `Vender` | Mantener como unica pantalla principal de venta. |
| `/caja` | `src/app/(dashboard)/caja/page.tsx` | Abrir/cerrar caja, efectivo esperado, ventas de sesion e historial de cierres. | vendedor/encargado | si | Mantener visible. Reducir historial si se quiere aun menos carga. |
| `/stock` | `src/app/(dashboard)/stock/page.tsx` | Buscar producto, ver stock/precio, ajustar stock, cambiar precio, ver sin stock. | vendedor/encargado | si | Mantener visible como Stock simple. Vigilar que "Cambiar precio" no sea demasiado permisivo para vendedor. |
| `/ajustes` | `src/app/(dashboard)/ajustes/page.tsx` | Entrada secundaria a Administracion con dos grupos: Historial y Configuracion. | encargado | si, secundario | Mantener como `Administracion`. |
| `/ajustes/historial` | `src/app/(dashboard)/ajustes/historial/page.tsx` | Accesos a clientes, ventas y presupuestos. | encargado | no, segundo nivel | Mantener. |
| `/ajustes/configuracion` | `src/app/(dashboard)/ajustes/configuracion/page.tsx` | Accesos a editar productos y datos de ferreteria. | encargado | no, segundo nivel | Mantener, pero evaluar nombre interno para no confundirse con `/configuracion`. |
| `/clientes` | `src/app/(dashboard)/clientes/page.tsx` | Lista clientes, saldos, crear/ver/editar. | encargado | no | Mantener oculto en Historial. |
| `/clientes/nuevo` | `src/app/(dashboard)/clientes/nuevo/page.tsx` | Alta de cliente. | encargado | no | Mantener como ruta de detalle. No poner en menu principal. |
| `/clientes/[id]` | `src/app/(dashboard)/clientes/[id]/page.tsx` | Ficha de cliente, deuda, pagos, ventas y presupuestos asociados. | encargado | no | Mantener oculta. Es densa para mostrador. |
| `/clientes/[id]/editar` | `src/app/(dashboard)/clientes/[id]/editar/page.tsx` | Editar datos del cliente. | encargado | no | Mantener oculta. |
| `/ventas` | `src/app/(dashboard)/ventas/page.tsx` | Historial de ventas, resumen del dia, ver/imprimir. | encargado | no | Mantener en Historial. No mover a principal. |
| `/ventas/[id]` | `src/app/(dashboard)/ventas/[id]/page.tsx` | Comprobante de venta, impresion y detalle. | encargado/vendedor al finalizar venta | no | Mantener como detalle post-venta. |
| `/presupuestos` | `src/app/(dashboard)/presupuestos/page.tsx` | Lista presupuestos, imprimir/ver, nuevo presupuesto. | encargado | no | Mantener en Historial. Revisar boton "Nuevo presupuesto" porque duplica Vender. |
| `/presupuestos/nuevo` | `src/app/(dashboard)/presupuestos/nuevo/page.tsx` | Reutiliza `QuickSale` para armar venta/presupuesto. | vendedor/encargado | no | Mantener por compatibilidad, pero redirigir o renombrar mentalmente como Vender si se simplifica. |
| `/presupuestos/[id]` | `src/app/(dashboard)/presupuestos/[id]/page.tsx` | Detalle, impresion y conversion de presupuesto a venta. | encargado/vendedor | no | Mantener oculto como detalle. |
| `/productos` | `src/app/(dashboard)/productos/page.tsx` | Buscador de catalogo con modo mostrador/administracion, editar, stock, historial. | encargado | no | Mantener como Productos/Editar productos dentro de Configuracion. No usar para vendedor comun. |
| `/productos/importar` | `src/app/(dashboard)/productos/importar/page.tsx` | Importar CSV de productos. | administrador/soporte | no | Mantener muy oculto; no debe estar en navegacion visible. |
| `/productos/[id]/stock` | `src/app/(dashboard)/productos/[id]/stock/page.tsx` | Historial auditable de movimientos de stock. | encargado/soporte | no | Mantener como detalle avanzado. |
| `/configuracion` | `src/app/(dashboard)/configuracion/page.tsx` | Placeholder de datos de negocio, sucursales, preferencias. | encargado/admin | no | Mantener en Configuracion. Cambiar titulo "Ajustes" a "Datos de la ferreteria" cuando se implemente. |

## Navegacion actual

Archivos revisados:

- `src/components/shell/nav-items.ts`
- `src/components/shell/sidebar-nav.tsx`
- `src/components/shell/dashboard-shell.tsx`

Hoy el usuario ve en el sidebar:

- `Vender`
- `Caja`
- `Stock`
- `Administracion`, separado, mas chico y con menor jerarquia

Esto coincide con el modelo deseado. No hay `Clientes`, `Ventas`, `Presupuestos`, `Productos` ni `Configuracion` en el menu principal.

Lo que deberia ver el usuario comun:

- `Vender`
- `Caja`
- `Stock`

Lo que debe quedar oculto en Administracion:

- `Clientes`
- `Ventas`
- `Presupuestos`
- `Editar productos`
- `Datos de la ferreteria`
- `Importar productos`
- `Historial de stock`

Accesos repetidos o confusos:

- `Administracion > Configuracion` y ruta `/configuracion` usan nombres parecidos pero no son lo mismo.
- `Stock` y `Editar productos` comparten acciones de stock/precio.
- `/presupuestos/nuevo` y `/inicio` renderizan el mismo POS (`QuickSale`).
- `/productos` tiene "Modo mostrador" y "Modo administracion", que reintroduce complejidad dentro de una pantalla que ya deberia ser avanzada.

## Auditoria de Inicio

Ruta revisada:

- `/inicio`
- `src/app/(dashboard)/inicio/page.tsx`
- `src/components/pos/quick-sale.tsx`

Estado actual:

- `/inicio` ya es realmente `Vender`.
- No muestra tarjetas de acceso tipo dashboard.
- Carga `QuickSale` directamente.
- La venta se arma con buscador, resultados, lista, total, pago, monto pagado, `Venta` y `Presupuesto`.
- El cliente esta en `details` como `Cliente opcional`, lo cual reduce carga visual.

Riesgos UX:

- En desktop, el carrito esta a la derecha y puede verse bien. En pantallas chicas, el usuario probablemente deba bajar para ver total y botones finales.
- Los campos `Pago` y `Monto pagado` aparecen antes de los botones; para cero tecnologia, esto puede ser correcto si cobran siempre, pero agrega decisiones. Se podria defaultar aun mas.
- El boton `Presupuesto` puede no ser autoexplicativo para un cajero nuevo. "Guardar presupuesto" es mas claro aunque mas largo.

Veredicto:

- Mantener `/inicio` como flujo principal.
- No agregar accesos ni tarjetas.
- Optimizar mobile/scroll en una etapa posterior si el mostrador usa notebooks o pantallas chicas.

## Auditoria de venta rapida y presupuestos

Rutas y componentes:

- `/presupuestos/nuevo`
- `src/components/presupuestos/new-quote-form.tsx`
- `src/components/pos/quick-sale.tsx`
- `src/app/(dashboard)/presupuestos/nuevo/actions.ts`

Hallazgos:

- `NewQuoteForm` solo envuelve `QuickSale`, por lo tanto `/presupuestos/nuevo` y `/inicio` son practicamente la misma experiencia.
- La busqueda POS busca por `sku`, `barcode`, `name`, `normalized_name` y `description`.
- Filtra `active = true` y `stock_quantity > 0`, por lo tanto no ofrece productos sin stock para vender.
- Permite agregar productos rapido y armar lista/carrito.
- Cliente esta secundario como opcion desplegable.
- `Venta` crea presupuesto y convierte internamente via RPC; visualmente se mantiene simple.
- `Presupuesto` guarda sin vender.

Riesgo UX:

- La existencia de `/presupuestos/nuevo` como ruta directa genera una segunda puerta para vender/presupuestar.
- Desde `/presupuestos`, el boton `Nuevo presupuesto` puede llevar a una persona a otro POS y parecer un flujo distinto de `Vender`.

Recomendacion:

- Mantener `/presupuestos/nuevo` por compatibilidad.
- Desde UI, preferir llevar a `/inicio` para crear operaciones nuevas.
- En Historial de presupuestos, cambiar `Nuevo presupuesto` por `Ir a vender` o quitarlo si no es necesario.

## Auditoria de Stock y Productos

Rutas y componentes:

- `/stock`
- `/productos`
- `/productos/[id]/stock`
- `ProductEditForm`
- `StockAdjustForm`
- `ProductsBrowser`

Stock simple (`/stock`):

- Es la pantalla correcta para usuario comun.
- Tiene busqueda simple, checkbox `Ver sin stock`, cards de producto, stock, precio.
- Permite `Ajustar stock` y `Cambiar precio` en detalles desplegables.

Productos (`/productos`):

- Es demasiado complejo para usuario comun.
- Tiene modo `mostrador` y `administracion`.
- Tiene busqueda por codigo, nombre, categoria, filtros activos, limpiar, ver todos, bajo stock, cards, agregar al presupuesto, editar, ajustar stock, historial.
- Debe quedar como herramienta de encargado.

Productos detalle/historial:

- `/productos/[id]/stock` es util para auditoria, pero no para flujo principal.
- `/productos/importar` es tarea de configuracion/soporte.

Recomendacion:

- `Stock` visible = buscar, ver stock, ajustar stock, cambiar precio.
- `Editar productos` oculto = catalogo completo, fotos, categorias, marcas, importar, historial.
- Evaluar mover `Cambiar precio` en `/stock` a un detalle desplegable aun mas explicito: "Mas del producto", para evitar ediciones accidentales.

## Auditoria de Administracion / Ajustes

Rutas:

- `/ajustes`
- `/ajustes/historial`
- `/ajustes/configuracion`
- `/configuracion`

Estado actual:

- `/ajustes` ya muestra solo dos tarjetas: `Historial` y `Configuracion`.
- `Historial` contiene `Clientes`, `Historial de ventas`, `Presupuestos`.
- `Configuracion` contiene `Editar productos` y `Datos de la ferreteria`.

Veredicto:

- La estructura actual esta bien para reducir carga mental.
- El mayor punto confuso es el nombre duplicado `Configuracion`: una tarjeta/ruta intermedia y una ruta final `/configuracion`.
- `/configuracion` todavia muestra titulo `Ajustes` y texto tecnico de tenant/sucursales/preferencias.

Recomendacion:

- Mantener `/ajustes` como `Administracion`.
- Mantener `/ajustes/historial`.
- Mantener `/ajustes/configuracion`, pero considerar titularlo `Sistema` o `Datos` si se quiere evitar duplicacion.
- Cambiar `/configuracion` a titulo `Datos de la ferreteria`.

## Rutas que no deberian estar en menu principal

Deben seguir existiendo pero no ser visibles para vendedor:

- `/clientes`
- `/clientes/nuevo`
- `/clientes/[id]`
- `/clientes/[id]/editar`
- `/ventas`
- `/ventas/[id]`
- `/presupuestos`
- `/presupuestos/nuevo`
- `/presupuestos/[id]`
- `/productos`
- `/productos/importar`
- `/productos/[id]/stock`
- `/configuracion`
- `/ajustes/historial`
- `/ajustes/configuracion`

## Propuesta de arquitectura final

Menu principal:

- `Vender` -> `/inicio`
- `Caja` -> `/caja`
- `Stock` -> `/stock`

Secundario:

- `Administracion` -> `/ajustes`

Administracion:

- `Historial` -> `/ajustes/historial`
  - `Ventas` -> `/ventas`
  - `Presupuestos` -> `/presupuestos`
  - `Clientes` -> `/clientes`
- `Configuracion` -> `/ajustes/configuracion`
  - `Editar productos` -> `/productos`
  - `Datos de la ferreteria` -> `/configuracion`

Alternativa aun mas simple:

- En `/ajustes`, mostrar solo dos botones grandes sin cards descriptivas:
  - `Historial`
  - `Configuracion`
- En cada subpantalla, usar lista vertical de botones, no cards.

## Rutas duplicadas o confusas

| Duplicacion | Riesgo | Recomendacion |
|---|---|---|
| `/inicio` vs `/presupuestos/nuevo` | Dos entradas al mismo POS. | Mantener ruta, pero desde UI enviar nuevas operaciones a `/inicio`. |
| `/stock` vs `/productos` | Dos lugares para buscar y tocar stock/precio. | `/stock` para mostrador; `/productos` solo encargado. |
| `/ajustes/configuracion` vs `/configuracion` | Dos niveles con nombre parecido. | Mantener estructura, renombrar textos: `Configuracion` -> `Datos del sistema`; `/configuracion` -> `Datos de la ferreteria`. |
| `/presupuestos` vs `Venta` en POS | El usuario puede pensar que vender exige ir a presupuestos. | Explicar visualmente que `Vender` es la entrada unica. |
| `Modo mostrador` en `/productos` vs `Stock` | Reintroduce un modo paralelo al Stock simple. | En Productos, default a administracion o eliminar visualmente el switch en etapa futura. |

## Problemas de lenguaje detectados

| Texto actual | Donde aparece | Riesgo | Reemplazo sugerido |
|---|---|---|---|
| `Sistema de gestion` | `/login` | Suena administrativo. | `Ingresar al mostrador` |
| `Ajustes` | `/configuracion` | Duplica `Administracion/Configuracion`. | `Datos de la ferreteria` |
| `Ajustes iniciales` | `/configuracion` empty state | Suena tecnico/incompleto. | `Datos del negocio` |
| `tenant` | `/configuracion` empty state | Palabra tecnica. | `ferreteria` o `sistema` |
| `Modo mostrador` | `/productos` | Introduce modos. | Evitar o cambiar por `Vista simple` |
| `Modo administracion` | `/productos` | Tecnico. | `Editar productos` |
| `Agregar al presupuesto` | `/productos` | Lleva a flujo duplicado. | `Usar en venta` o ocultar en Productos avanzado |
| `Nuevo presupuesto` | `/presupuestos` | Puede competir con Vender. | `Ir a vender` o `Crear desde Vender` |
| `Productos, fotos e historial` | `/ajustes/configuracion` | Puede sonar amplio. | `Editar productos` |
| `Motivo obligatorio` | ajuste de stock | Correcto para auditoria, pero duro para usuario comun. | `Motivo del ajuste` |

## Riesgos si se eliminan rutas

- Eliminar `/presupuestos/nuevo` puede romper enlaces desde `/productos` y `/presupuestos`.
- Eliminar `/productos` puede bloquear importacion, edicion completa, fotos, categorias y auditoria de stock.
- Eliminar `/ventas/[id]` o `/presupuestos/[id]` rompe impresion y comprobantes.
- Eliminar `/clientes/[id]` rompe cuenta corriente, pagos y seguimiento.
- Eliminar `/configuracion` deja sin destino la tarjeta `Datos de la ferreteria`.
- Eliminar rutas dinamicas afecta enlaces ya guardados, historial del navegador y flujos post-venta.

Por eso la recomendacion es ocultar, renombrar y redirigir visualmente, no borrar.

## Plan de implementacion por etapas

### Etapa 1: lenguaje y enlaces visibles

- Cambiar `/configuracion` de `Ajustes` a `Datos de la ferreteria`.
- Cambiar login `Sistema de gestion` a `Mostrador de ventas`.
- En `/presupuestos`, reemplazar `Nuevo presupuesto` por un enlace a `/inicio` con texto `Ir a vender`.
- En `/productos`, cambiar `Modo administracion` por `Editar productos` y evaluar ocultar `Modo mostrador`.

### Etapa 2: consolidar flujos duplicados

- Mantener `/presupuestos/nuevo`, pero convertirlo en redirect interno a `/inicio` si no hay dependencia fuerte de `sku`.
- Si hay `sku`, decidir si `/inicio?sku=` debe soportarlo para eliminar la duplicacion visual.
- Quitar enlaces a `/presupuestos/nuevo` desde pantallas no esenciales.

### Etapa 3: simplificar Productos avanzado

- Dejar `/stock` como unica pantalla de stock para usuario comun.
- En `/productos`, asumir que entra encargado: quitar switch de modo o default a edicion completa.
- Mover importar productos a un enlace pequeno dentro de Configuracion, no dentro del flujo de busqueda.

### Etapa 4: revisar mobile/mostrador real

- Verificar si en `/inicio` los botones `Venta` y `Presupuesto` quedan visibles sin scroll en la pantalla fisica del local.
- Si no, fijar total y botones al pie del carrito en mobile/tablet.
- Validar con usuario real: buscar por codigo, agregar, cobrar, imprimir/ver comprobante.

## Recomendacion final

La arquitectura visible final deberia quedar asi:

- Principal:
  - `Vender`
  - `Caja`
  - `Stock`
- Secundario:
  - `Administracion`
    - `Historial`
      - `Ventas`
      - `Presupuestos`
      - `Clientes`
    - `Configuracion`
      - `Editar productos`
      - `Datos de la ferreteria`

No tocar:

- Base de datos
- Migraciones
- RPCs
- Auth/tenant/roles
- Rutas dinamicas de detalle e impresion

Ocultar o bajar jerarquia:

- Clientes
- Ventas
- Presupuestos guardados
- Productos completo
- Importacion
- Historial de stock
- Datos de configuracion

