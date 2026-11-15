# B.3B: revision comercial, sin creacion

## Recorrido

En Presupuestos pendientes, Revisar precios consulta una Server Action de solo
lectura. B.3A verifica la cookie con el servidor, la unica membresia activa, el
rol owner/admin/seller y el tenant existente. Los IDs del pendiente se comparan
contra esa identidad: no se usan como credenciales. Los datos comerciales se
leen filtrados por tenant y las presentaciones ademas por producto.

La accion no agrega rutas capaces de crear presupuestos. No llama RPCs ni
acciones de guardado/precios. No escribe datos remotos o IndexedDB. No requiere
040 aplicada. B.3A permanece sin modificaciones.

Se muestran nombre antiguo/actual, cantidad, presentacion, factor, unidad,
precio offline, precio efectivo actual, precio base actual, importe por linea,
diferencia y totales. El orden es el del array; las filas repetidas se identifican
por posicion. Los importes visuales y diferencias usan cadenas/BigInt, sin
recalcular las reglas monetarias de B.3A con punto flotante.

Se explican diferencias y bloqueos; ante datos faltantes no se muestra un total
parcial como si fuera completo. Cerrar revision solo descarta estado en memoria.
No hay boton Aceptar/Guardar: seria engañoso porque aun no guarda ni aprueba.
La politica confirmada para una futura creacion es usar precios actuales con
confirmacion explicita, revisar nuevamente ante cambios y no escribir precios.

## Sesiones y solicitudes

- Captura la sesion A.1/A.3 antes de enviar y la comprueba despues de recibir.
- Conserva la suscripcion mientras el resultado sea visible: invalidacion o
  vencimiento retiran el resultado; el boundary tambien bloquea el panel.
- Las revalidaciones rutinarias A.3 no cambian esa captura ni descartan la vista.
- Cambiar usuario/tenant remonta el panel bajo una identidad nueva.
- Cerrar/desmontar cancela la publicacion de respuestas tardias. No implica
  abortar una lectura que el servidor ya este ejecutando.
- Un segundo clic durante una solicitud no inicia otra desde esa vista.
- Una nueva revision retira el resultado anterior antes de consultar.
- Errores del servidor/red se traducen a mensajes generales sin detalles internos.

## Limites de esta fase

Limites server-side por solicitud: 128.000 caracteres JSON, 50 renglones y
20 combinaciones distintas producto/presentacion (hasta 20 lecturas de productos,
20 de presentaciones, membresia, tenant y cliente). Los documentos mayores se
rechazan sin alterarlos. No es un rate limiter distribuido entre pestañas.

La revision es una fotografia de lecturas no transaccionales. No detecta en vivo
cambios del catalogo ni firma una autorizacion. B.3C debera comprobar comercialmente
el documento en la transaccion y exigir nueva revision si cambio. Nunca reutilizar
este resultado como permiso de escritura. `canCreate` sigue siendo false.

## Validacion

- `node scripts/check-offline-quote-review.mjs`: accion real con autenticacion/DB
  simuladas; render HTML de React; ciclo de solicitudes contra OfflineSession real.
- `node scripts/check-offline-quote-commercial.mjs`: regresion B.3A.
- `node scripts/check-offline-session.mjs`: regresion A.1/A.3.
- TypeScript, lint, build y diff check.

Casos: igualdad, suba/baja, presentaciones, nombres, factores, filas repetidas,
orden, faltantes/inactivos, red, sesion vencida, otro tenant/usuario/rol, respuesta
tardia, cierre, doble clic, revalidacion rutinaria, limites y ausencia de escrituras.

No se ejecutaron operaciones SQL ni pruebas reales de navegador/Supabase.
Pendiente manual: abrir la revision con datos de prueba, comprobar legibilidad
en movil, cerrar/reabrir y probar logout real entre pestañas. No realizar ventas
reales ni sincronizaciones como parte de esta verificacion.
