# Auditoria de redistribucion de funciones

Fecha: 2026-05-15

Producto: Ferreteria Guemes

Objetivo: definir que funciones utiles de rutas ocultas conviene llevar a `Vender`, `Caja` y `Stock`, sin volver a mostrar una administracion completa al usuario de mostrador.

## Resumen ejecutivo

La navegacion visible debe quedar solo en:

- `Vender`
- `Caja`
- `Stock`

Las rutas ocultas no deben eliminarse. Varias siguen siendo necesarias para soporte, detalles, impresion, historial completo, edicion avanzada o compatibilidad de enlaces. La decision correcta no es mover todo al menu principal, sino llevar solo las acciones frecuentes, simples y de bajo riesgo a las tres pantallas visibles.

Estado actual favorable:

- `Vender` ya concentra venta y presupuesto desde el POS.
- `Caja` ya concentra apertura, cierre, efectivo esperado y ventas asociadas a la caja.
- `Stock` ya concentra busqueda, faltantes, ajuste de stock y cambio de precio simple.
- `Encargado/Administracion` ya no aparece en el sidebar visible.

Riesgo principal:

- Si se mueven demasiadas funciones ocultas a `Vender`, `Caja` y `Stock`, la app vuelve a sentirse como un panel administrativo. La regla debe ser: si una accion no se usa todos los dias en mostrador, queda oculta por URL directa o soporte.

## Tabla de redistribucion

| Funcion actual | Ruta actual | Sirve al cliente | Donde deberia vivir | Como simplificarla | Riesgo | Recomendacion |
|---|---|---|---|---|---|---|
| Buscar producto para vender | `/productos`, `/inicio` | Si | `Vender` | Mantener busqueda grande por codigo/nombre. En venta, solo con stock. En presupuesto, catalogo completo. | Bajo | Mantener en `Vender`; no usar `/productos` como entrada diaria. |
| Agregar producto a operacion | `/productos`, `/inicio` | Si | `Vender` | Usar boton `Agregar` dentro del POS. | Bajo | Mantener en `Vender`; enlaces desde `/productos` deben seguir apuntando a `/inicio?sku=...`. |
| Guardar presupuesto | `/presupuestos`, `/presupuestos/nuevo`, `/inicio` | Si | `Vender` | Boton claro `Guardar presupuesto`, especialmente en modo presupuesto. | Bajo | Mantener en `Vender`; `/presupuestos` queda como historial oculto. |
| Convertir presupuesto en venta | `/presupuestos/[id]` | Si, pero no siempre | `Vender` o ruta directa de presupuesto | Si se usa mucho, agregar en `Vender` una busqueda secundaria de presupuesto guardado. | Medio | No mover todavia. Mantener en detalle `/presupuestos/[id]` hasta validar frecuencia real. |
| Imprimir presupuesto | `/presupuestos`, `/presupuestos/[id]` | Si | Despues de guardar en `Vender` | Redirigir al comprobante y mostrar `Imprimir presupuesto`. | Bajo | Mantener en detalle imprimible. No agregar historial completo al POS. |
| Ver presupuestos guardados | `/presupuestos` | A veces | Oculto por URL directa | Si hace falta, mostrar solo `Buscar presupuesto` como accion secundaria en `Vender`. | Medio | Mantener oculto. Evaluar mini buscador solo si el local convierte presupuestos a diario. |
| Venta real | `/inicio`, `/ventas` | Si | `Vender` | Boton principal `Venta`; caja visible solo cuando corresponde. | Bajo | Mantener en `Vender`. |
| Ver comprobante de venta | `/ventas/[id]` | Si | Despues de vender y desde `Caja` para ventas recientes | Mostrar `Ver` o `Imprimir` en ventas recientes, no historial completo. | Bajo | Mantener detalle; sumar accesos recientes en `Caja` si hace falta. |
| Imprimir venta reciente | `/ventas`, `/ventas/[id]` | Si | `Caja` | Lista corta: ultimas ventas de la caja abierta/cerrada reciente con boton `Imprimir`. | Bajo | Conviene mover una version resumida a `Caja`. |
| Historial completo de ventas | `/ventas` | No para mostrador diario | Oculto | Filtros, listados y resumen completo quedan fuera del flujo principal. | Medio | Mantener por URL directa para encargado/soporte. |
| Resumen por forma de pago | `/ventas`, `/caja` | Si | `Caja` | Totales simples por efectivo, transferencia, debito, credito y cuenta corriente. | Bajo | Mantener en `Caja`; evitar tabla larga. |
| Ventas de hoy | `/ventas`, `/caja` | Si | `Caja` | Mostrar solo ventas de la sesion o del dia con total y cantidad. | Bajo | Mantener en `Caja`; no llevar a `Vender`. |
| Abrir caja | `/caja` | Si | `Caja` | Boton grande y monto inicial. | Bajo | Mantener visible. |
| Cerrar caja | `/caja` | Si | `Caja` | Boton grande, efectivo contado, diferencia clara. | Medio | Mantener visible; usar texto muy simple. |
| Cliente opcional en venta | `/clientes`, `/inicio` | Si | `Vender` | Mantener como bloque secundario desplegable. | Bajo | Mantener dentro de `Vender`, sin convertirlo en modulo de clientes. |
| Crear cliente rapido | `/clientes/nuevo`, `/inicio` | A veces | `Vender` | Si hace falta, crear cliente minimo desde `Cliente opcional`: nombre y telefono. | Medio | No mover todavia salvo que el local lo necesite seguido. |
| Cuenta corriente en venta | `/clientes`, `/inicio` | Si para algunos clientes | `Vender` | Mantener forma de pago `Cuenta corriente`, exigir cliente. | Medio | Mantener. No mostrar historial de cuenta en el POS. |
| Registrar pago de cliente | `/clientes/[id]` | Si, pero es cobranza | `Caja` o ruta oculta de cliente | Si se mueve, crear accion simple `Cobrar cuenta corriente`: cliente, importe, nota. | Medio | No mover a `Vender`. Evaluar en `Caja` si cobran deudas en mostrador. |
| Historial de cliente | `/clientes/[id]` | No para vendedor comun | Oculto | Mantener ficha completa fuera del flujo principal. | Alto | Mantener por URL directa. |
| Lista de clientes | `/clientes` | No para mostrador diario | Oculto | No mostrar en navegacion. | Medio | Mantener oculta. |
| Ajustar stock | `/productos`, `/stock` | Si | `Stock` | Formulario corto: stock nuevo y motivo. | Medio | Mantener en `Stock`; seller si ya esta permitido. |
| Cambiar precio | `/productos`, `/stock` | Si, solo encargado | `Stock` | Formulario minimo: nombre, codigo, precio actual, nuevo precio. | Medio | Mantener en `Stock`, solo owner/admin. |
| Editar producto completo | `/productos` | No para usuario comun | Oculto | Nombre, SKU, categoria, marca, foto, activo, stock minimo quedan fuera de `Stock`. | Alto | Mantener en `/productos` por URL directa. |
| Ver faltantes | `/stock`, `/productos` | Si | `Stock` | Boton simple `Ver faltantes`. | Bajo | Mantener en `Stock`. |
| Historial de movimientos de stock | `/productos/[id]/stock` | A veces | Oculto o detalle secundario desde `Stock` | Si se expone, usar `Ver movimientos` discreto por producto y solo para encargado. | Medio | Mantener oculto por ahora. No cargar `Stock` con auditoria completa. |
| Importar productos por CSV | `/productos/importar` | No para usuario comun | Soporte/admin oculto | Mantener advertencia y permisos owner/admin. | Alto | No mover a `Stock` tal como esta. Es importacion de catalogo, no carga segura de mercaderia. |
| Crear categorias/marcas desde importacion | `/productos/importar` | No | Soporte/admin oculto | No exponer al mostrador. | Alto | Mantener oculto. |
| Fotos de productos | `/productos` | No para mostrador diario | Oculto | Editar solo en administracion avanzada. | Medio | Mantener oculto. |
| Datos de la ferreteria | `/configuracion` | No para vendedor | Oculto | Acceso manual o soporte. | Alto | Mantener por URL directa. |
| Indice de ajustes | `/ajustes` | No para usuario comun | Oculto | No mostrar en sidebar. | Bajo | Mantener ruta por compatibilidad, sin acceso visible. |

## Propuesta por pantalla visible

### 1. Vender

Debe resolver:

- Vender productos con stock.
- Armar presupuestos con productos del catalogo, incluso sin stock.
- Asociar cliente de manera opcional.
- Elegir forma de pago cuando es venta.
- Guardar presupuesto.
- Ir al comprobante para ver o imprimir.

Funciones que conviene mantener dentro de `Vender`:

- Busqueda por codigo, codigo de barras, nombre y descripcion.
- Selector simple `Venta` / `Presupuesto`.
- Cliente opcional como bloque secundario.
- `Venta` como accion principal en modo venta.
- `Guardar presupuesto` como accion principal en modo presupuesto.
- Redireccion al comprobante correspondiente.

Funciones que no conviene mover a `Vender`:

- Lista completa de clientes.
- Historial de cliente.
- Registro de pagos de cuenta corriente.
- Historial completo de presupuestos.
- Historial completo de ventas.
- Edicion de productos.

Posible mejora futura:

- Agregar un buscador secundario muy discreto: `Buscar presupuesto guardado`, solo si en la ferreteria convierten presupuestos viejos en ventas todos los dias. Si no, mantener `/presupuestos` oculto.

## 2. Caja

Debe resolver:

- Abrir caja.
- Ver si la caja esta abierta o cerrada.
- Ver efectivo esperado.
- Ver ventas de la sesion.
- Cerrar caja.
- Revisar o reimprimir ventas recientes.

Funciones de `/ventas` que si sirven en `Caja`:

- Ventas de hoy o de la caja abierta.
- Totales por forma de pago.
- Boton `Ver` o `Imprimir` para una venta reciente.

Funciones de `/ventas` que deben quedar ocultas:

- Historial completo.
- Reportes largos.
- Filtros administrativos.
- Navegacion hacia presupuestos o clientes.

Recomendacion:

- Si se necesita mas autonomia sin entrar a `/ventas`, agregar en `Caja` una lista corta: `Ultimas ventas`, con numero, hora, total, forma de pago y boton `Imprimir`.
- No mover todo el historial de ventas a `Caja`, porque haria la pantalla demasiado pesada.

## 3. Stock

Debe resolver:

- Buscar producto.
- Ver cuanto hay.
- Ver faltantes.
- Ajustar stock.
- Cambiar precio simple si el rol lo permite.

Funciones de `/productos` que si sirven en `Stock`:

- Buscar producto.
- Ver stock actual.
- Ver precio.
- Ajustar stock.
- Cambiar precio.
- Ver faltantes.

Funciones de `/productos` que deben quedar ocultas:

- Editar nombre/SKU/codigo.
- Categoria.
- Marca.
- Foto.
- Activo/inactivo.
- Stock minimo.
- Importar productos.
- Historial auditable completo.

Recomendacion:

- Mantener `Stock` como pantalla operativa.
- Mantener `/productos` como ruta avanzada por URL directa.
- No agregar enlaces visibles a `/productos` desde `Stock`.

## Caso especial: transformar importacion en "Cargar stock"

La ruta actual `/productos/importar` no es una carga simple de mercaderia. Hoy importa catalogo por CSV, crea o actualiza productos, categorias y marcas, y puede escribir `stock_quantity` como dato del producto.

Eso no deberia exponerse como herramienta comun.

Si se quiere una funcion de mostrador llamada `Cargar stock`, debe ser otro flujo, mucho mas seguro:

- Ubicacion: `Stock`.
- Nombre visible: `Cargar mercaderia`.
- Usuarios: owner/admin; seller solo si el negocio lo permite explicitamente.
- CSV minimo: `sku`, `cantidad_recibida`, `motivo` o `remito`.
- Vista previa obligatoria antes de guardar.
- Mostrar producto encontrado, stock actual, cantidad a sumar y stock final.
- No crear productos nuevos automaticamente.
- No crear categorias ni marcas.
- No pisar stock absoluto sin confirmacion explicita.
- Registrar movimientos de stock.
- Usar `adjust_product_stock` por producto o crear una RPC batch nueva si se necesita atomicidad.

Riesgo tecnico:

- Alto si se reutiliza `/productos/importar`, porque su semantica actual es de catalogo completo.
- Medio/alto si se implementa por lote con muchas filas, porque requiere manejo de errores, vista previa y consistencia.
- Si se necesita que todo el CSV se aplique o nada se aplique, probablemente haga falta una RPC batch nueva o migracion futura. Eso queda fuera de esta auditoria.

Recomendacion:

- No renombrar `/productos/importar` como `Cargar stock`.
- Mantener `/productos/importar` oculto y reservado para owner/admin/soporte.
- Planificar `Cargar mercaderia` como mejora separada dentro de `Stock`.

## Que queda oculto para soporte o administracion

| Ruta | Motivo para mantenerla oculta |
|---|---|
| `/productos` | Edicion completa de catalogo, fotos, categorias, marcas, acciones avanzadas. |
| `/productos/importar` | Cambios masivos de catalogo por CSV. Riesgo alto. |
| `/productos/[id]/stock` | Auditoria detallada de movimientos. Util, pero no diaria. |
| `/clientes` | Gestion completa de clientes. |
| `/clientes/[id]` | Cuenta corriente, pagos, ventas y presupuestos asociados. |
| `/ventas` | Historial completo y reportes. |
| `/ventas/[id]` | Detalle e impresion post-venta. Debe seguir por redireccion o enlace directo. |
| `/presupuestos` | Historial completo de presupuestos. |
| `/presupuestos/[id]` | Detalle, impresion y conversion. Debe seguir existiendo. |
| `/configuracion` | Datos de la ferreteria. No es tarea diaria. |
| `/ajustes` | Indice oculto de funciones administrativas. |

## Riesgos UX

| Zona | Riesgo | Recomendacion |
|---|---|---|
| `Vender` | Meter historial de clientes, ventas o presupuestos vuelve pesado el POS. | Solo cliente opcional y comprobante post-operacion. |
| `Caja` | Convertirla en un reporte completo puede confundir al cerrar caja. | Mostrar resumen y ventas recientes, no todo el historico. |
| `Stock` | Agregar edicion completa de productos aumenta errores accidentales. | Mantener solo stock, faltantes y precio simple. |
| `Importar` | El usuario podria pisar catalogo o stock con un CSV mal armado. | Mantener oculto y crear otro flujo seguro si se necesita cargar mercaderia. |
| `Clientes` | Cuenta corriente puede mezclarse con venta rapida. | Mantener venta simple; evaluar cobranza en `Caja`, no en POS. |

## Riesgos tecnicos

| Tema | Riesgo | Recomendacion |
|---|---|---|
| Caja y ventas | La asociacion venta-caja debe seguir dentro de la RPC de conversion a venta. | No mover esa responsabilidad a TypeScript. |
| Presupuestos sin stock | Un presupuesto puede incluir productos sin stock, pero una venta no deberia venderlos. | Mantener filtro por modo y validar conversion. |
| Carga de stock por CSV | Requiere movimientos auditables y vista previa. | No reutilizar importacion de catalogo sin redisenar. |
| Permisos | Acciones como precio/importacion no son para seller/viewer. | Mantener controles por rol en Server Actions. |
| Rutas ocultas | Ocultar no es proteger. | Las acciones sensibles deben seguir validando rol del lado servidor. |

## Plan recomendado por etapas

### Etapa 1: mantener el modelo visible actual

Objetivo:

- Sidebar solo con `Vender`, `Caja`, `Stock`.
- Rutas ocultas accesibles por URL directa.

Riesgo: bajo.

Validacion:

- Abrir app y confirmar que no aparece administracion.
- Probar `/ajustes`, `/ventas`, `/clientes`, `/productos` por URL directa.

### Etapa 2: reforzar Caja con ventas recientes

Objetivo:

- Agregar en `Caja` una lista corta de ventas recientes de la sesion.
- Permitir `Ver` o `Imprimir` venta reciente.

Archivos probables:

- `src/app/(dashboard)/caja/page.tsx`
- `src/app/(dashboard)/ventas/[id]/page.tsx`

Riesgo: bajo/medio.

Rollback:

- Quitar el bloque de ventas recientes.

### Etapa 3: decidir si Vender necesita buscar presupuestos guardados

Objetivo:

- Validar con el local si convierten presupuestos viejos a venta todos los dias.

Si la respuesta es si:

- Agregar busqueda simple de presupuesto en `Vender`.

Si la respuesta es no:

- Mantener `/presupuestos` oculto.

Riesgo: medio.

Rollback:

- Volver a dejar solo POS.

### Etapa 4: Stock con mini historial opcional

Objetivo:

- Si hace falta, mostrar ultimos movimientos de un producto desde `Stock`, detras de una accion secundaria.

Riesgo: medio.

Rollback:

- Mantener solo `/productos/[id]/stock` oculto.

### Etapa 5: disenar "Cargar mercaderia"

Objetivo:

- Crear flujo seguro de carga de stock por CSV, distinto de importacion de catalogo.

Condiciones:

- Vista previa.
- No crear productos.
- No pisar stock sin confirmar.
- Registrar movimientos.
- Definir si se usa `adjust_product_stock` por fila o una RPC batch nueva.

Riesgo: alto.

Rollback:

- Desactivar acceso visible y mantener solo ajuste manual.

## Decision final recomendada

La app puede funcionar para el cliente con solo tres pantallas visibles:

- `Vender`: venta, presupuesto, cliente opcional, comprobante.
- `Caja`: abrir/cerrar caja, efectivo esperado, ventas de sesion, reimpresion reciente.
- `Stock`: buscar, faltantes, ajustar stock, cambiar precio simple.

Debe quedar oculto:

- Catalogo avanzado.
- Importacion masiva.
- Historial completo.
- Fichas completas de clientes.
- Configuracion de la ferreteria.
- Auditorias detalladas.

No conviene tocar:

- Base de datos.
- Migraciones.
- RPCs actuales.
- Logica de conversion de presupuesto a venta.
- Logica de asociacion venta-caja.
- Permisos del servidor.

La mejora mas valiosa despues de esta auditoria no es reabrir administracion, sino sumar pequenas funciones operativas en las pantallas correctas: reimprimir ventas recientes en `Caja`, buscar presupuesto guardado en `Vender` solo si el negocio lo necesita, y disenar `Cargar mercaderia` como un flujo nuevo y seguro en `Stock`.
