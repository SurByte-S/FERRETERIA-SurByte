# B.3A - Validacion comercial de solo lectura

## Limites

`validateOfflineQuoteCommercial` es un modulo interno marcado `server-only`.
No se expone mediante una ruta ni Server Action; no esta conectado al POS o a
los paneles. Solo autentica y lee. No llama RPCs, no escribe precios, no modifica
IndexedDB, no firma propuestas y no autoriza creaciones. `canCreate` siempre es
`false`, incluso con `status: no_differences`. La migracion 040 sigue bloqueada.

## Identidad

- Verifica la cookie mediante `getCurrentUser` / Supabase `auth.getUser`.
- Obtiene la unica membresia activa del usuario desde el servidor, como el
  recorrido actual de seleccion de tenant. Multiples membresias bloquean.
- Requiere rol owner/admin/seller y existencia del tenant. El esquema actual no
  tiene un indicador `tenants.active`; la actividad corresponde a la membresia.
- Compara tenant y propietario declarados en el pendiente con ese contexto.
- Filtra todas las lecturas comerciales por tenant; presentaciones tambien por
  producto. Cliente existente requiere pertenencia y `deleted_at IS NULL`.
- La igualdad del propietario no prueba que IndexedDB sea inalterable ni que
  los precios locales fueran autorizados. Son datos no confiables para comparar.

## Contrato y compatibilidad

Acepta el registro actual `quote_create` de la cola (pending/failed/syncing), sin
exigir version, firma, descuento, total por linea ni nuevos metadatos.
Admite IDs opcionales vacios para cliente/presentacion, como el POS antiguo.
Rechaza UUIDs incorrectos, propietario ausente, claves comerciales desconocidas
(incluidos descuentos), valores no finitos, negativos o precision incompatible.
No asigna un propietario a registros antiguos que no lo tengan.
No modifica el objeto original ni agrupa renglones. Cada fila usa posicion 1-based.
Limite defensivo: 1000 renglones por analisis; los pendientes mayores quedan
intactos y devuelven error de contrato. No se utiliza su fecha local como fecha
de emision. Metadatos de reintento/fechas no tienen autoridad comercial.

## Aritmetica

- BigInt sobre la representacion decimal serializada, sin dependencia nueva.
- Cantidad y factor: numeric(14,3), positivos, sin redondear precision excedente.
- Precio: numeric(14,2), no negativo; cero explicito es valido.
- Total de linea: cantidad por precio efectivo, redondeado a centavos con
  empate alejandose de cero (los importes admitidos son no negativos).
- Subtotal: suma de lineas ya redondeadas; comprueba limites numeric(14,2).
- El factor no multiplica el precio: mantiene el calculo de 037.
- Descuento e impuesto del contrato actual: cero. No infiere descuentos.
- Conserva y devuelve el total offline recibido, su equivalente mostrado a dos
  decimales, la suma de lineas offline redondeadas y el total actual calculado.
- Solo la comprobacion del total bruto legado tolera 0.000001, para el ruido
  binario del POS. Las comparaciones de precios son exactas en centavos.
- Diferencias por redondeo se informan; nunca se corrige el documento original.

## Catalogo y resultados

Devuelve por posicion los valores originales y actuales: nombre, cantidad,
unidad, presentacion, factor, precio y total. Distingue el precio actual del
producto del precio efectivo de su presentacion.

Estados: `no_differences`, `differences`, `blocked`, `contract_error`,
`unauthorized`, `verification_unavailable`. Estos tres ultimos no exponen datos
comerciales. Los errores de red/lectura no se interpretan como catalogo vacio.

Codigos por linea: `price_difference`, `name_difference`,
`presentation_difference`, `factor_difference`, `unit_difference`,
`product_missing`, `product_inactive`, `presentation_missing`,
`presentation_inactive`, `presentation_ambiguous`, `price_missing`,
`catalog_invalid`, `amount_out_of_range`.
Codigos globales adicionales: `customer_missing`, `rounding_difference`.

Una presentacion explicita faltante/inactiva bloquea: nunca se sustituye.
Sin ID explicito se analiza la predeterminada activa; si no existe, la unidad
virtual Unidad/factor 1 con precio del producto, igual que la creacion actual.
Un cambio de presentacion se informa; un cambio de factor/unidad base bloquea.
Multiples predeterminadas bloquean en vez de elegir una arbitrariamente.
Precio efectivo ausente bloquea, aunque la RPC antigua permita fallback a cero
o al precio base. Precio de producto nulo con presentacion de precio explicito
valido se muestra como nulo y no impide calcular esa presentacion.
Los nombres actuales proceden de products.name, como 036, nunca de description.

## Pruebas y limites pendientes

Ejecutar `node scripts/check-offline-quote-commercial.mjs`.
El script ejecuta los modulos TypeScript con autenticacion y lecturas simuladas;
el adaptador no ofrece metodos de escritura. No conecta a Supabase ni SQL.
Incluye permisos, aislamiento, cantidades, precios, redondeo, presentaciones,
duplicados, orden, errores, compatibilidad y ausencia de mutacion del documento.

Las lecturas son puntuales, deduplicadas por producto/presentacion, para no
confundir truncamiento de PostgREST con productos eliminados. Son secuenciales
y no constituyen una instantanea transaccional. Catalogo o membresia pueden
cambiar durante/despues del analisis. B.3C debera repetir comprobaciones dentro
de la transaccion antes de cualquier creacion. B.3A no garantiza esos bloqueos.

Pendientes de fases futuras: politica autorizada para conservar precios offline
diferentes, aprobacion consciente, firma, idempotencia comercial, pruebas SQL
reales y rendimiento con documentos grandes. No requiere aplicar 040 para
analizar. No aplicar migraciones ni habilitar sincronizacion por este checklist.
