# B.2 — Infraestructura de idempotencia preparada, NO habilitada

## Estado y límites

Base revisada: `d31489689edb3ad5969f069ef8316f491a133bb6`, rama main.
040 estaba disponible y no se encontró infraestructura previa de idempotencia.
No se modifican 036–039, autenticación, frontend, IndexedDB ni funciones comerciales.
No se aplicó SQL. No se encontró PostgreSQL, psql, initdb ni Docker local disponible.

**La migración NO permite crear presupuestos offline todavía.**
Se revoca EXECUTE a PUBLIC, anon, authenticated y service_role. Además, la función
rechaza toda primera creación con `OFFLINE_QUOTE_SYNC_NOT_ENABLED` antes de cualquier
escritura, incluso si alguien le otorgara EXECUTE por error. No hay flag para evitarlo.
El núcleo posterior está preparado pero es inalcanzable. No retirar el bloqueo ni
otorgar permisos hasta implementar/revisar B.3 en una nueva migración autorizada.

## Tabla y concurrencia

`public.offline_quote_operations` contiene exclusivamente comprobantes confirmados:
tenant, UUID local, propietario, versión, SHA-256 del comando normalizado, ID remoto,
número original, total original y fecha de confirmación del servidor. No necesita
estados pending/syncing remotos ni reservas parcialmente confirmadas.

La PK `(tenant_id, local_operation_id)` impide reutilizar una clave dentro del tenant.
El propietario se comprueba en cada recuperación y nunca se actualiza desde la RPC.
La tabla no tiene permisos de lectura/escritura para los roles de aplicación, ni
políticas RLS. service_role puede omitir RLS, pero no los privilegios de tabla.
El propietario de los objetos debe ser un rol administrativo confiable, no un rol
de aplicación. Un DBA conserva, como siempre, la capacidad de alterar estos objetos.

Los UUID son referencias históricas sin FK ni cascadas: así borrar un presupuesto,
usuario o tenant no borra el comprobante ni cambia las reglas previas de eliminación.
Las relaciones vigentes se validan mediante tenant_members/tenants antes del acceso.
Esta decisión exige conservar los comprobantes; no agregar tareas de purga automática.
El resultado recuperado es el original: no representa necesariamente el estado actual
de un presupuesto editado/eliminado. No recrear nunca el documento al faltar este.

La RPC toma un bloqueo asesor **transaccional** por tenant/UUID antes de buscar el
comprobante. Las colisiones del hash del bloqueo solo producen espera adicional;
la identidad real se compara siempre por UUID y la PK es la barrera definitiva.
En READ COMMITTED y función VOLATILE, el SELECT posterior al bloqueo usa una nueva
instantánea y ve lo confirmado por el primer solicitante. No se utiliza únicamente
SELECT seguido de INSERT como protección. Con REPEATABLE READ/SERIALIZABLE puede
ser necesario reintentar la transacción completa tras 23505/40001; no cambiar UUID.
También hay que manejar 40P01 y timeouts como intentos que requieren reconciliación.

La creación delegada y el INSERT del comprobante pertenecen a la misma transacción.
No hay manejador que absorba errores. Si falla cualquiera, revierten presupuesto,
renglones, eventual cliente nuevo y comprobante. Los huecos de numeración por
secuencias tras rollback son normales y no equivalen a documentos duplicados.

## Identidad y seguridad

Firma preparada:

`confirm_offline_quote_operation(uuid, uuid, uuid, uuid, integer, jsonb)`

Orden: tenant, UUID local, propietario, actor autenticado, versión, comando.
El futuro servidor deberá obtener el actor verificando el token; nunca copiarlo
del formulario. No se trata de autenticación offline. La RPC exige actor=propietario
y membresía activa owner/admin/seller. Mantiene FOR SHARE sobre membresía y tenant
hasta el final; una revocación que concurre se serializa con esa transacción.
No se confía en `auth.uid()` bajo service_role ni se acepta un rol desde el cliente.

Cada replay vuelve a autorizar. Un usuario sin membresía no recupera resultados;
otro miembro del tenant tampoco puede apropiarse de una clave existente.
El mismo UUID puede existir en otro tenant como operación distinta únicamente si
el actor está autorizado allí. No recupera ni modifica la operación del primer tenant.

La función nueva usa `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`, relaciones
calificadas y ACL explícitas dentro de la transacción de instalación. No cambia
permisos globales ni el search_path de RPCs existentes. Antes de una aplicación real
se deben revisar ACL heredadas, ownership y las definiciones remotas de dependencias.

## Contrato estructural provisional v1

No es el payload IndexedDB ni un contrato comercial listo para activar. Ejemplo:

```json
{
  "customer": {"id": null, "name": "Cliente de prueba", "phone": "", "email": "", "address": ""},
  "items": [
    {"product_id": "11111111-1111-1111-1111-111111111111", "sale_unit_id": null, "quantity": 1.25},
    {"product_id": "22222222-2222-2222-2222-222222222222", "sale_unit_id": null, "quantity": 2}
  ],
  "notes": "Presupuesto creado desde mostrador"
}
```

Los UUID del ejemplo son ficticios, no fixtures existentes. Solo se aceptan las
claves indicadas; precios, nombres de productos, SKU y metadatos adicionales se
rechazan en vez de ignorarlos. Se exige product_id; no se resuelve identidad por SKU.

La huella se calcula en PostgreSQL con SHA-256 sobre UTF-8 del JSONB normalizado:
versión, tenant, propietario, cliente, array ordenado de ítems y notas. UUIDs se
convierten a uuid; cantidades se representan como numeric(14,3), después de rechazar
valores no positivos, fuera de rango o con más precisión significativa. Así 1 y
1.000 representan la misma cantidad; no se redondea 1.0001 silenciosamente.
El orden y las líneas repetidas forman parte del comando y no se compactan.
Cliente: trim; nombre vacío queda vacío; teléfono/correo/dirección vacíos se vuelven
NULL; ID ausente/vacío/NULL se vuelve NULL. Notas vacías/NULL/ausentes usan el texto
predeterminado. No se eliminan tildes ni se normaliza Unicode adicionalmente.

La fecha, el número de intento, la marca de sesión y los precios actuales de catálogo
no forman parte del hash. El UUID local es la clave externa, no cambia en un reintento.
No se acepta una huella calculada por el cliente. Antes de cambios mayores de PostgreSQL
o de normalización, verificar vectores canónicos; no cambiar el algoritmo de una
versión con comprobantes existentes. Datos distintos en un campo incluido se rechazan,
aunque ese campo no haya producido un efecto comercial (p. ej. teléfono junto a un
cliente ya existente). Es una elección conservadora.

B.3 deberá definir una versión comercial nueva que incluya las condiciones aprobadas
y su verificación transaccional. **No activar v1 simplemente quitando el bloqueo.**
La idempotencia no reemplaza la comparación de precios ni la aprobación del usuario.

## Reutilización comercial y dependencias

El núcleo preparado delega los nueve parámetros a `create_quote_with_current_product_names`
(036), que delega a `create_quote_with_items` (037). Esto conserva nombres de products.name,
WITH ORDINALITY/sort_order, presentaciones, cantidades, cálculo y redondeos existentes.
Antes de crear se comprueba cliente existente del tenant y no eliminado. Los productos
activos y las presentaciones se validan en la función existente. No se ejecuta
syncSelectedSaleUnitPrices, no se escriben precios de catálogo ni se llama conversión
a venta. 038/039 siguen siendo exclusivamente la ruta de actualización existente.

Un reintento confirmado no consulta precios, productos ni clientes actuales, ni
vuelve a ejecutar creación. Por ello puede recuperar el resultado aunque después
se haya desactivado un producto o eliminado el presupuesto.

Persisten decisiones B.3: precio de presentación/base, cambio de factor/presentación
predeterminada, precisión/total aprobado y carrera entre revisión y creación.
También debe comprobar que los renglones creados coincidan con lo aprobado antes
del commit. El núcleo B.2 aislado no garantiza estas condiciones comerciales.

## Pruebas preparadas (SQL aún NO ejecutado)

Ejecutar ahora únicamente `node scripts/check-offline-quote-idempotency.mjs`.
Es una inspección textual de barreras/estructura; no valida sintaxis PL/pgSQL,
permisos efectivos, huellas reales ni comportamiento transaccional.

Preparación futura: PostgreSQL/Supabase **local descartable**, esquema compatible
036–039, sin datos ni credenciales productivos; fixtures de dos tenants T1/T2,
U1/U2 autorizados en T1, U3 sin membresía y U4 viewer. Productos P1/P2/P3 activos,
presentación S1, cliente C1. Guardar conteos y contenidos iniciales de tablas
comerciales; usar UUIDs nuevos por caso, salvo donde se prueba replay.

Dos grupos obligatorios:

- **Migración intacta:** primera creación como propietario administrativo debe
  fallar con 55000/OFFLINE_QUOTE_SYNC_NOT_ENABLED; anon/authenticated/service_role
  deben fallar por permisos. Confirmar cero cambios. Incluso un GRANT temporal
  en la base descartable no debe evitar 55000. Revertir esa transacción de prueba.
- **Núcleo experimental:** solo en esa base descartable, crear una copia de prueba
  de la función con otro nombre y sin la línea del bloqueo. No cambiar el archivo
  040 ni habilitar la función productiva. Es una prueba del núcleo SIN B.3, no una
  certificación del flujo publicable. No otorgarle permisos de aplicación.

| Caso | Ejecución y resultado exigido sobre la copia experimental |
|---|---|
| Primera operación | U1/T1/O1 con P1→P2→P3: exactamente un presupuesto y un comprobante, ID/número/total coincidentes. |
| Replay | Repetir O1 idéntico: mismo resultado completo/fecha, mismos conteos y ningún cliente adicional. |
| Concurrencia | Conexión A: BEGIN, O1, mantener transacción abierta. B: mismo O1; debe esperar. COMMIT A: B devuelve mismo resultado. Repetir con ROLLBACK A: B puede crear exactamente uno. |
| Respuesta perdida | Confirmar O1 y cerrar la conexión después de COMMIT sin usar el resultado; recuperar desde otra conexión con O1 idéntico. |
| Contenido diferente | Cambiar cantidad/orden/cliente/notas con O1: COMMAND_MISMATCH, sin escrituras. Probar orden JSON distinto y 1 vs 1.000: mismo hash. |
| Otro tenant | U1 sin membresía T2: FORBIDDEN. Con actor autorizado en T2, mismo UUID es una operación separada; nunca devuelve datos de T1. |
| Otro usuario | U2/T1 sobre O1 propiedad U1: FORBIDDEN aunque U2 sea owner. Actor distinto del propietario declarado: FORBIDDEN. |
| Sin membresía | U3 o membresía U1 revocada: FORBIDDEN tanto para primera creación como replay. |
| Rol inválido | U4 viewer: FORBIDDEN. Cambiar rol mientras A mantiene transacción: comprobar bloqueo/serialización. |
| Error de creación | Cliente nuevo y producto inexistente/inactivo o presentación ajena: ninguna fila nueva en customers/quotes/items/operations. |
| Error al insertar comprobante | En fixture local, trigger temporal que rechace INSERT a operations después de crear: todo revierte; no queda presupuesto huérfano. |
| Borrado remoto | Tras O1 confirmado, borrar su presupuesto en la fixture: comprobante intacto; replay devuelve resultado original y no recrea. |
| Nombres/orden | p.name distinto de p.description; comprobar name actual, orden 1/2/3, repetidos y distintas presentaciones. |
| Datos comerciales | Comparar snapshots antes/después: precios products/product_sale_units, stock, caja, pagos y ventas sin cambios. |
| Decimales | Cantidad 1.125 aceptada; 1.0001 rechazada; totales y redondeos coinciden con RPC original. |
| Aislamiento fuerte | Repetir concurrencia en REPEATABLE READ/SERIALIZABLE, aceptar fallo de transacción/reintento con la misma clave, jamás dos presupuestos confirmados. |

No se puede afirmar que las filas conservan datos correctos solo porque la revisión
estática pasó. Registrar versión PostgreSQL, roles, comandos, resultados y conteos
cuando estas pruebas se ejecuten. Las pruebas comerciales finales requieren B.3.

## Aplicación manual futura y reversión

1. No aplicar automáticamente ni ejecutar desde esta tarea.
2. Revisar 040 y probarla primero en entorno local/aislado como se describe arriba.
3. Verificar en el destino las definiciones 036/037/039, sort_order, roles y ownership;
   comprobar que no existe ya 040 ni objetos homónimos. La migración falla ante colisión,
   no reemplaza silenciosamente una tabla/función previa.
4. Con autorización independiente, aplicar el archivo completo dentro de su transacción.
5. Verificar ACL/RLS y que la RPC sigue cerrada. No otorgar EXECUTE ni conectar frontend.
6. B.3 se autoriza y despliega por separado; sus controles deben preceder cualquier habilitación.

Si falla la instalación, la transacción revierte los objetos nuevos. Si ya fue aplicada,
mantenerla deshabilitada es la reversión segura. No borrar la tabla si alguna vez contiene
comprobantes: perderlos permite duplicados futuros. No alterar 036–039 para revertir B.2.

Referencias oficiales consultadas:
- https://www.postgresql.org/docs/current/sql-createfunction.html
- https://www.postgresql.org/docs/current/explicit-locking.html
- https://www.postgresql.org/docs/current/transaction-iso.html
- https://www.postgresql.org/docs/current/functions-binarystring.html
