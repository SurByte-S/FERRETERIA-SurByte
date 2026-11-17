# B.3C.1 - Contrato preparado; no autorizacion de escritura

## Alcance implementado

Modulo server-only de funciones puras, sin consumidores en rutas, Server Actions
o UI. No cambia B.3A/B, autenticacion, IndexedDB ni SQL. No instala secretos.
`issueCommercialProposal` solo se ejecuta en pruebas aisladas en esta fase.
La propuesta firmada prueba integridad/origen, NO consentimiento del empleado.
Todos los resultados mantienen `canCreate: false`.

El futuro emisor debera obtener actor mediante auth.getUser, tenant/membresia/rol
mediante consultas propias, vencimiento real de sesion y catalogo fresco. Nunca
aceptar VerifiedApprovalIdentity, ApprovalCatalog, recibos o claves desde el
navegador. Los tipos TypeScript no autentican. La futura accion verificara estos
datos en cada llamada, con limites de B.3B, sin confiar en la revision anterior.
La funcion pura no hace autenticacion ni acceso a red por si misma.

## Contrato v2

- Purpose `offline-quote-review-proposal`; version 2 (distinta del prototipo 040).
- UUID local, actor, tenant, propietario y rol verificados.
- `sourceFingerprint`: SHA-256 del documento original normalizado, con cliente,
  notas, nombres/precios offline, cantidades, unidades, presentaciones/factores,
  SKU/codigo/descripcion, posiciones, total original e identidad/operacion.
- Excluye estado de cola, intentos, errores y fechas locales administrativas.
  Cambiar esos metadatos al reintentar no cambia la identidad comercial.
- `proposalFingerprint`: SHA-256 de version/operacion/tenant/propietario,
  huella original y comando comercial exacto revisado.
- Politica current-catalog-v1; cliente, notas, nombres actuales, cantidades,
  precios base/efectivos, presentacion resuelta, factor, unidad, total de linea,
  subtotal/total, descuentos e impuestos cero. Orden y repeticiones intactos.
- Estados activos y revisiones de producto/presentacion; resolucion explicita
  o unidad virtual. No emitir si B.3A detecta un bloqueo o faltan revisiones.
- issuedAt/expiresAt: milisegundos UTC enteros, plazo maximo cinco minutos y
  nunca mayor al vencimiento verificado de la sesion al emitir.

## Canonicalizacion y firma

JSON UTF-8 sin espacios; claves del esquema ordenadas alfabeticamente, arrays
sin ordenar/agrupar; cadenas conservadas sin trim ni normalizacion Unicode.
Cantidades/factores son cadenas fijas de tres decimales, precios/importes de dos.
Total bruto offline usa String(numero JSON) para conservar el ruido legado;
1 y 1.0 recibidos como numero tienen la misma representacion. UUIDs minusculos.
No se admiten flotantes en el serializador canonico: solo enteros estructurales
(version, posicion, tiempos). No inventar descuentos ni redondear cantidades.
`revision` exige updated_at UTC y conserva seis decimales (microsegundos).

Token: keyId.base64url(JSON canonico).base64url(HMAC-SHA256(keyId.payload)).
Compara MAC con timingSafeEqual antes de interpretar el contenido. Rechaza claves
desconocidas, manipulacion, vencimiento exacto, emision futura, otra identidad,
contenido o propuesta diferentes. La clave debe tener al menos 32 bytes
criptograficamente aleatorios, ser exclusiva del servidor y comun a instancias.
No usar una clave publica, del navegador o una service-role key como secreto.
El integrador futuro gestionara rotacion por keyId; si una clave ya no existe,
se exige nueva revision para operaciones no confirmadas. No configurar ahora.
La firma NO cifra: contiene datos del cliente. No registrar tokens en logs/URLs.

Los tiempos y keyId quedan firmados pero fuera de las huellas comerciales:
renovar una propuesta identica no altera el comando idempotente.

## Obsolescencia y dependencias pendientes

La verificacion pura reconstruye la propuesta con identidad/catalogo FRESCOS y
compara todo el documento canonico. Un cambio de precio, estado, nombre, factor,
presentacion, revision, orden o contenido exige revisar. No es monitoreo en vivo.
El esquema tiene triggers updated_at en products y product_sale_units. B.3A/B
todavia no seleccionan esos campos: un futuro resolver debe leerlos y pasarlos
como revision. No emitir tokens con la respuesta B.3B actual sin esos datos.
updated_at puede causar revisiones adicionales ante cambios no comerciales.
No es un contador monotono: escritores que eviten/restauren timestamps o varios
cambios en una misma transaccion no quedan diferenciados solo por ese campo.
La comparacion de valores/estados sigue siendo obligatoria. Si se exige detectar
absolutamente cada cambio transitorio, se necesitara versionado SQL adicional.

## Propuesta SQL posterior a 040 (NO implementada ni aplicada)

040 permanece intacta y bloqueada. Una futura migracion 041, autorizada por
separado, debe ampliar la tabla de recibos con source_fingerprint. Mantener
command_fingerprint para la huella v2 de propuesta; version separa v1/v2.
No reinterpretar registros v1 ni quitar su bloqueo para nuevas operaciones.

La nueva confirmacion, solo invocable por el servidor autorizado, debe:

1. Validar actor/propietario, tenant y membresia/rol activos, bloqueando membresia
   y tenant durante la transaccion como 040. Serializar tenant + UUID local con
   advisory lock y mantener PK como garantia durable.
2. Buscar recibo antes de exigir vigencia/precios de una nueva propuesta.
   Confirmacion con comando distinto: conflicto. Recuperacion separada con
   mismo propietario + huella original: devolver exclusivamente recibo congelado,
   incluso si el token vencio, el precio cambio o se borro el presupuesto remoto.
3. Si no hay recibo, exigir propuesta firmada verificada por el servidor y
   consentimiento explicito vinculado a esa propuesta, nunca un booleano libre.
   El servidor recomputa ambas huellas. La RPC recibe solo la asercion autenticada
   de ese servidor; anon/authenticated no obtienen EXECUTE.
4. Dentro de la MISMA transaccion, comprobar vencimiento con reloj de DB despues
   de esperas, bloquear productos/presentaciones/clientes en orden determinista,
   resolver estados/tenant/precios/factores/revisiones y recalcular importes con
   numeric. Comparar campo por campo con el comando revisado. No usar el resultado
   de una consulta previa como prueba suficiente. Pasar IDs resueltos explicitos.
5. La ausencia de una predeterminada no se protege bloqueando filas inexistentes.
   Para unidad virtual/default, se necesita proteccion contra inserciones
   concurrentes. Una opcion concreta es SHARE sobre product_sale_units antes
   de resolver, con costo de bloquear brevemente escrituras de catalogo; requiere
   revision/autorizacion. Sin esa proteccion, rechazar ese caso en la futura
   confirmacion. No asumir que bloquear products obliga a todos los escritores.
6. Crear mediante 036/037 solamente tras estas comprobaciones, sin llamar a
   syncSelectedSaleUnitPrices. Comparar filas/totales creados con los aprobados,
   verificar vencimiento antes de completar e insertar recibo atomico. Cualquier
   discrepancia aborta presupuesto, renglones, cliente nuevo y recibo juntos.

No comparar la huella Node con SHA-256(jsonb::text) de 040: son codificaciones
diferentes. Opcion minima: servidor verifica firma/recalcula huellas v2 y SQL
compara el contenido tipado del comando con sus propios valores normalizados;
almacena las huellas del servidor confiable como identificadores opacos. Si SQL
debe recomputarlas independientemente, implementar canonicalizador v2 equivalente
y vectores Node/PostgreSQL antes de habilitarlo. No reutilizar el hash v1.

La funcion pura inspectConfirmedOperation modela recuperacion, no consulta DB.
El recibo debe obtenerse en servidor con aislamiento/propiedad verificados. Sin
expectedProposalFingerprint es recuperacion por documento original; con ese
campo exige tambien coincidencia del comando. Dos propuestas distintas para el
mismo UUID no pueden crear dos presupuestos: primera transaccion gana, la otra
debe devolver conflicto/recuperar el existente. Nada de esto se ejecuta aun.

## Pruebas

`node scripts/check-offline-quote-approval.mjs`: firma/alteracion, identidad,
precios/factores/estado/revisiones, caducidad, decimales, orden/repeticiones,
reintentos y recibos confirmados. Son funciones reales con fixtures en memoria,
no SQL ni pruebas transaccionales. Las pruebas de concurrencia, permisos DB,
rollback, equivalencia SQL, rotacion de claves y consentimiento real quedan
pendientes de autorizacion e implementacion posterior.
