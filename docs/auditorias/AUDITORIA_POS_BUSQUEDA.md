# Auditoria POS / Busqueda en Vender

Fecha: 2026-05-15

Producto: Ferreteria Guemes

Alcance: auditoria de `/inicio` como POS de mostrador. No se modifico codigo, base de datos, migraciones, RPCs ni logica.

## Resumen ejecutivo

La pantalla `Vender` ya tiene una estructura correcta para el modelo simple:

- selector `Venta` / `Presupuesto`;
- buscador;
- cantidad;
- resultados;
- lista/carrito;
- total visible;
- cliente opcional;
- estado de caja en modo venta;
- botones `Venta` y `Guardar presupuesto`.

El problema principal no es de logica critica sino de UX de busqueda:

- El boton junto al buscador dice `Agregar`, pero ejecuta una busqueda y solo agrega automaticamente si encuentra coincidencia exacta por SKU o codigo de barras.
- La busqueda general devuelve solo 15 resultados.
- Los resultados se ordenan por `name`, no por relevancia.
- La pantalla `Vender` no usa la RPC `search_products`, que ya tiene ranking por coincidencia exacta, prefijo y nombre/marca.
- La busqueda actual no incluye categoria ni marca.
- No hay paginacion ni `Ver mas` en el POS.

Recomendacion general:

- Cambiar el boton junto al input a `Buscar`.
- Mantener `Agregar` solo dentro de cada producto encontrado.
- Subir el limite de resultados de POS a 30 como primer paso seguro.
- Mejorar ranking sin tocar base de datos, o evaluar reutilizar la RPC `search_products` si se quiere ranking consistente.
- Mantener estrictamente:
  - Venta = solo productos activos con stock.
  - Presupuesto = productos activos aunque no tengan stock.

## Tabla de problemas

| Problema | Estado actual | Riesgo UX | Riesgo tecnico | Recomendacion |
|---|---|---|---|---|
| Boton del buscador dice `Agregar` | El boton llama a `runSearch()`; puede buscar o agregar exacto. | Alto para +60: parece que agrega algo sin elegir producto. | Bajo. | Renombrar a `Buscar`; dejar `Agregar` en cada resultado. |
| Limite de resultados bajo | `searchQuoteProductsAction` usa `.limit(15)`. | Medio: puede ocultar productos relevantes. | Bajo/medio si se sube demasiado. | Subir a 30; evaluar `Ver mas` si hace falta. |
| Sin ranking profesional en POS | La query ordena por `name`. | Medio: buscar codigo parcial o nombre comun puede mostrar resultados poco utiles primero. | Medio si se reescribe todo. | Priorizar exactos y prefijos; o reutilizar RPC existente con ranking. |
| No busca marca/categoria en POS | Busca `sku`, `barcode`, `name`, `normalized_name`, `description`. | Medio en ferreteria, donde marca/rubro ayuda. | Medio si se suman joins en query directa. | Mantener simple ahora; evaluar marca/categoria en etapa posterior. |
| Busqueda automatica desde 1 caracter | Hay debounce de 250 ms para cualquier termino. | Medio: una letra puede traer resultados poco utiles. | Bajo. | Para nombre, buscar desde 2 o 3 caracteres; para codigo numerico permitir 1. |
| No hay paginacion ni `Ver mas` | Solo se ven los resultados limitados. | Medio. | Bajo si se implementa paginacion local simple. | Primero subir limite; luego evaluar `Ver mas`. |
| Enter agrega exacto automaticamente | `runSearch()` busca exacto por SKU/barcode y llama `addProduct()`. | Bajo/medio: bueno para scanner, pero debe estar claro. | Bajo. | Mantener para scanner; el boton visible debe decir `Buscar`. |
| Textos con mojibake en lectura PowerShell | Algunos textos con tildes se ven como `BuscÃ¡` en consola. | Bajo si navegador renderiza bien; medio si archivo esta mal codificado. | Bajo. | Verificar en navegador/UTF-8 antes de tocar mas textos. |

## 1. Boton del buscador

Archivo revisado:

- `src/components/pos/quick-sale.tsx`

Estado actual:

- El boton grande ubicado al lado del buscador muestra:
  - `Agregar`
- El `onClick` ejecuta:
  - `runSearch()`

Funcion real de `runSearch()`:

1. Si el input esta vacio:
   - limpia resultados;
   - muestra mensaje inicial;
   - enfoca el buscador.
2. Si hay texto:
   - muestra `Buscando productos...`;
   - llama primero a `getQuoteProductBySkuAction(term, isQuoteMode)`.
3. Si encuentra coincidencia por SKU o barcode:
   - llama a `addProduct(exact)`;
   - limpia el input;
   - devuelve foco al buscador.
4. Si no encuentra exacto:
   - llama a `searchQuoteProductsAction(term, isQuoteMode)`;
   - muestra resultados para elegir.

Conclusion:

- El boton no es semanticamente `Agregar`.
- Es un boton de busqueda con comportamiento acelerado para codigo exacto.
- Para usuario +60, `Agregar` al lado del buscador comunica que se va a agregar algo sin haber elegido producto.

Recomendacion:

- Cambiar texto e icono mental del boton a `Buscar`.
- Mantener el comportamiento de Enter/agregado exacto para scanner.
- Mantener `Agregar` exclusivamente en cada resultado de producto.

## 2. Limite de resultados

Archivo revisado:

- `src/app/(dashboard)/presupuestos/nuevo/actions.ts`

Funcion:

- `searchQuoteProductsAction(rawSearch, includeOutOfStock = false)`

Limite actual:

```ts
.limit(15)
```

No se encontro:

- paginacion en el POS;
- boton `Ver mas`;
- control de `page`;
- total de resultados.

Comparacion con otras pantallas:

- `/productos` usa `PAGE_SIZE = 100` y RPC `search_products`.
- `/stock` usa `PAGE_SIZE = 80`.
- `/inicio` usa solo 15 resultados.

Evaluacion:

- 15 puede ser poco para una ferreteria con muchos productos y nombres parecidos.
- Mostrar 100 en POS puede abrumar.
- Un primer limite razonable para POS es 30.
- Si sigue faltando, conviene agregar `Ver mas` antes que mostrar listas enormes de entrada.

Recomendacion:

- Etapa 1: subir de 15 a 30.
- Etapa 2: si el usuario sigue sin encontrar productos, agregar `Ver mas` o paginacion simple.
- No implementar scroll infinito.

## 3. Precision de busqueda

### Busqueda general actual

`searchQuoteProductsAction` busca en:

- `sku`
- `barcode`
- `name`
- `normalized_name`
- `description`

Filtro base:

- `tenant_id = tenant.id`
- `active = true`

Filtro de stock:

- si `includeOutOfStock` es `false`, agrega:
  - `stock_quantity > 0`

Orden actual:

```ts
.order("name")
.limit(15)
```

No busca actualmente en POS:

- categoria;
- marca;
- codigo exacto con ranking dentro de la lista general;
- prefijos ordenados antes que contiene;
- total_count.

### Busqueda exacta actual

`getQuoteProductBySkuAction`:

- limpia el texto;
- busca primero `sku ilike sku`;
- luego `barcode ilike sku`;
- limita a 1;
- aplica `active = true`;
- aplica `stock_quantity > 0` si no esta en presupuesto.

Observacion:

- `ilike` sin `%` funciona como comparacion case-insensitive del valor completo.
- Es util para scanner y codigo exacto.

### Normalizacion

`cleanSearch()`:

```ts
trim()
replace(/[^\p{L}\p{N}\s.-]/gu, " ")
replace(/\s+/g, " ")
```

Ventajas:

- limpia caracteres raros;
- conserva letras, numeros, espacios, punto y guion.

Limitaciones:

- no normaliza tildes en el input;
- depende de que `normalized_name` ya este bien construido;
- no transforma comas a puntos;
- no divide tokens para busquedas tipo `tornillo 8 zinc`;
- no usa ranking por relevancia.

### RPC existente

Migraciones revisadas:

- `supabase/migrations/003_search_products_rpc.sql`
- `supabase/migrations/006_stock_rpc_and_search.sql`

La RPC `search_products` ya implementa:

- busqueda por `sku`;
- busqueda por `barcode`;
- busqueda por `name`;
- busqueda por `normalized_name`;
- busqueda por `description`;
- busqueda por `brand`;
- filtro por categoria;
- ranking:
  - exacto por SKU/barcode = 1;
  - empieza con SKU/barcode = 2;
  - empieza con nombre/normalized/description/brand = 3;
  - resto = 4;
- `total_count`;
- `page_size`;
- `page_offset`;
- orden por `rank`, `name`, `sku`.

Diferencia importante:

- `/productos` usa esta RPC.
- `/inicio` no la usa.

Recomendacion:

- Para correccion rapida: mantener queries directas y mejorar limite/texto.
- Para busqueda profesional: evaluar adaptar `Vender` para usar `search_products` con un wrapper de POS, agregando filtro de stock en TypeScript o ajustando query sin tocar RPC.
- No tocar RPC en la primera mejora.

## 4. Modo Venta / Presupuesto

Estado actual:

- `mode` puede ser:
  - `sale`
  - `quote`
- `isQuoteMode = mode === "quote"`

Modo Venta:

- `includeOutOfStock = false`
- `searchQuoteProductsAction` filtra:
  - `stock_quantity > 0`
- `getQuoteProductBySkuAction` tambien filtra:
  - `stock_quantity > 0`
- `registerSale()` bloquea venta si hay lineas sin stock:
  - mensaje: `Hay productos a pedido. Guarda presupuesto o quitalos antes de vender.`

Modo Presupuesto:

- `includeOutOfStock = true`
- incluye productos activos aunque tengan stock 0;
- los productos sin stock quedan con:
  - `availableForSale = false`;
- resultados muestran:
  - `A pedido`;
- carrito muestra:
  - `A pedido`;
- en presupuesto se oculta pago/caja;
- accion principal visible:
  - `Guardar presupuesto`.

Conclusion:

- La separacion funcional es correcta.
- No conviene tocar RPCs ni conversion de venta.
- La mejora debe concentrarse en UX y busqueda.

## 5. UX de resultados

Cada resultado muestra:

- Codigo;
- Producto;
- Precio;
- Stock;
- Estado;
- boton `Agregar`.

Fortalezas:

- La informacion minima para vender esta presente.
- El precio es visible.
- El stock esta visible.
- El estado `Con stock` / `A pedido` es claro.
- El boton `Agregar` por producto esta bien ubicado.

Riesgos:

- En desktop, cada resultado usa muchas columnas y puede ocupar bastante alto/ancho.
- Si se sube el limite a 30, la lista debe seguir siendo escaneable.
- No muestra categoria/marca, que a veces ayuda a distinguir productos parecidos.

Recomendacion:

- No agregar mucha informacion nueva.
- Si hay muchos productos parecidos, sumar una linea secundaria opcional con categoria/marca solo si ya viene del backend.
- Mantener precio y boton `Agregar` bien visibles.

## 6. Estado vacio

Estados actuales:

- Sin busqueda:
  - muestra mensaje inicial.
- Buscando:
  - `Buscando productos...`
- Sin resultados:
  - modo venta: `No encontramos productos con stock para esa busqueda.`
  - modo presupuesto: `No encontramos productos para esa busqueda.`

Riesgos:

- El bloque vacio ocupa toda el area de resultados; esto esta bien como superficie de trabajo, pero el texto debe ser muy directo.
- En algunos textos revisados por consola aparecen caracteres mojibake por codificacion de salida; verificar en navegador.

Recomendacion:

- Mantener estados simples.
- Usar exactamente:
  - Venta: `No encontramos productos con stock para esa busqueda.`
  - Presupuesto: `No encontramos productos para esa busqueda.`
- Evitar explicaciones largas.

## 7. Acciones por teclado y scanner

Estado actual:

- `Enter` en el input llama a `runSearch()`.
- `runSearch()` intenta exacto por SKU/barcode.
- Si encuentra exacto, agrega automaticamente.
- Despues de agregar:
  - limpia input;
  - limpia resultados;
  - resetea cantidad a 1;
  - vuelve foco al buscador.

Evaluacion:

- Esto es correcto para POS y scanner.
- Es rapido para codigo de barras.
- El riesgo UX esta en el texto del boton, no tanto en la logica.

Recomendacion:

- Mantener Enter/agregado exacto.
- Renombrar boton visual a `Buscar`.
- Evaluar microcopy: `Escaneá o buscá un producto`.

## 8. Performance

Estado actual:

- Hay busqueda automatica con debounce de 250 ms en cada cambio de `search`.
- No hay minimo de caracteres.
- Cualquier letra dispara query despues de 250 ms.
- Tambien hay busqueda manual con boton/Enter.

Riesgos:

- En una base grande, una sola letra puede disparar consultas frecuentes y poco utiles.
- `ilike %term%` en varios campos puede ser costoso si no hay indices adecuados.
- `limit(15)` reduce carga, pero tambien oculta resultados.

Recomendacion:

- Mantener debounce.
- Agregar regla simple:
  - si parece codigo/SKU numerico: permitir desde 1 caracter;
  - si parece nombre/texto: buscar desde 2 o 3 caracteres.
- Subir limite a 30 con cuidado.
- No usar busqueda sin limite.

## 9. Filtros simples

Filtros actuales en POS:

- modo `Venta` / `Presupuesto`, que define stock.

No hay:

- categoria;
- marca;
- precio;
- rubro;
- solo con stock manual.

Evaluacion:

- Agregar muchos filtros ensuciaria el POS.
- El modo ya resuelve el filtro mas importante.
- Categoria/marca podria ser util, pero debe ser secundario.

Recomendacion:

- No agregar filtros en la primera etapa.
- Si se necesita, agregar un unico filtro opcional `Rubro` o `Categoria`, colapsado o discreto.
- No agregar filtros administrativos.

## Riesgos UX para usuario +60

| Riesgo | Impacto | Recomendacion |
|---|---|---|
| Boton `Agregar` junto al buscador | Puede creer que agrega sin elegir producto. | Cambiar a `Buscar`. |
| Pocos resultados | Puede pensar que el producto no existe. | Subir limite a 30 o agregar `Ver mas`. |
| Orden alfabetico simple | Productos relevantes pueden quedar abajo. | Mejorar ranking. |
| Mensajes con palabras tecnicas | Baja confianza. | Textos cortos y directos. |
| Demasiados filtros | Vuelve a parecer sistema administrativo. | Mantener solo modo Venta/Presupuesto. |
| Producto sin stock en venta | Riesgo operativo. | Mantener filtro y bloqueo actual. |

## Riesgos tecnicos

| Riesgo | Impacto | Recomendacion |
|---|---|---|
| Cambiar busqueda y romper venta | Alto | No tocar `saveQuoteAndConvertToSaleAction`. |
| Cambiar RPC sin necesidad | Alto | Evitar en primera etapa. |
| Subir limite demasiado | Medio | Usar 30 primero, medir. |
| Usar marca/categoria con joins nuevos | Medio | Preferir RPC existente si se necesita ranking avanzado. |
| Vender productos sin stock | Alto | Mantener `stock_quantity > 0` en venta y bloqueo por `hasOutOfStockLines`. |
| Presupuesto sin stock bloqueado por error | Medio | Mantener `includeOutOfStock = true` en presupuesto. |

## Propuesta de mejora

### Cambio seguro inmediato

Archivos probables:

- `src/components/pos/quick-sale.tsx`
- `src/app/(dashboard)/presupuestos/nuevo/actions.ts`

Cambios:

1. Cambiar boton junto al buscador:
   - de `Agregar`
   - a `Buscar`
2. Mantener boton `Agregar` por producto.
3. Subir limite de resultados:
   - de 15
   - a 30
4. Mantener Enter/agregado exacto para SKU/barcode.
5. Mantener modo Venta/Presupuesto actual.

Riesgo:

- Bajo.

Validacion:

- `npm run lint`
- `npm run build`
- prueba manual de venta/presupuesto.

### Mejora de ranking sin tocar DB

Objetivo:

- Ordenar mejor los productos antes de mostrarlos.

Opciones:

1. Hacer dos busquedas:
   - exacto/prefijo;
   - contiene.
2. O traer 30/50 y ordenar en TypeScript por:
   - SKU exacto;
   - barcode exacto;
   - SKU empieza con;
   - nombre empieza con;
   - contiene.

Riesgo:

- Medio.

Recomendacion:

- Solo hacerlo despues del cambio seguro inmediato.

### Reutilizar RPC `search_products`

Ventaja:

- Ya tiene ranking, marca, categoria y `total_count`.

Problema:

- No tiene parametro de stock en la firma actual.
- Para Venta habria que filtrar stock despues o crear una variante.
- Filtrar despues de recibir puede devolver menos resultados reales si muchos no tienen stock.

Recomendacion:

- No tocar RPC en primera etapa.
- Si el POS necesita busqueda profesional real, crear una etapa especifica para:
  - evaluar si extender RPC;
  - o crear Server Action POS que combine RPC + filtro stock;
  - o crear RPC nueva con parametro `include_out_of_stock`.

## Plan de implementacion por etapas

### Etapa 1: UX minima del buscador

Objetivo:

- Que la accion visible sea clara.

Cambios:

- `Agregar` junto al input -> `Buscar`.
- Mantener `Agregar` en cada resultado.

Riesgo:

- Bajo.

Rollback:

- Revertir texto del boton.

### Etapa 2: ampliar resultados

Objetivo:

- Reducir falsos "no existe".

Cambios:

- `limit(15)` -> `limit(30)`.

Riesgo:

- Bajo/medio.

Rollback:

- Volver a 15.

### Etapa 3: minimo de caracteres

Objetivo:

- Evitar busquedas pobres por una sola letra.

Regla:

- Codigo/SKU numerico: desde 1 caracter.
- Nombre/texto: desde 2 o 3 caracteres.

Riesgo:

- Medio: no debe molestar al scanner.

Rollback:

- Quitar minimo.

### Etapa 4: ranking POS

Objetivo:

- Encontrar primero lo mas probable.

Orden deseado:

1. SKU exacto.
2. Barcode exacto.
3. SKU empieza con.
4. Barcode empieza con.
5. Nombre empieza con.
6. Nombre/descripcion contiene.
7. Normalized name contiene.
8. Marca/categoria si se incorpora.

Riesgo:

- Medio.

### Etapa 5: evaluar RPC dedicada

Objetivo:

- Busqueda profesional, paginable y consistente.

Condicion:

- Solo si las etapas anteriores no alcanzan.

Riesgo:

- Medio/alto si implica migracion.

## Checklist de validacion manual

Modo Venta:

- Abrir `/inicio`.
- Confirmar sidebar solo `Vender`, `Caja`, `Stock`.
- Confirmar boton junto al input como `Buscar`.
- Buscar por SKU exacto.
- Buscar por barcode exacto.
- Buscar por nombre parcial.
- Buscar por descripcion/detalle.
- Confirmar que no aparecen productos sin stock.
- Confirmar que cada resultado tiene `Agregar`.
- Agregar producto.
- Confirmar que limpia input y vuelve foco.
- Confirmar total.
- Tocar `Venta`.
- Confirmar que descuenta stock.
- Confirmar que impacta caja segun flujo actual.

Modo Presupuesto:

- Elegir `Presupuesto`.
- Buscar producto sin stock.
- Confirmar que aparece.
- Confirmar etiqueta `A pedido`.
- Agregar producto sin stock.
- Confirmar etiqueta en lista.
- Tocar `Guardar presupuesto`.
- Confirmar que no descuenta stock.
- Confirmar que no impacta caja.
- Confirmar comprobante.

Tecnico:

- `npm run lint`
- `npm run build`

## Decision final recomendada

El POS esta bien encaminado funcionalmente. La primera correccion debe ser pequena:

- boton del buscador = `Buscar`;
- resultados con `Agregar`;
- limite 30;
- mantener diferenciacion Venta/Presupuesto;
- no tocar base de datos ni RPCs.

La busqueda profesional debe ir por etapas. La RPC `search_products` ya contiene una logica de ranking superior, pero no conviene conectarla al POS sin analizar el filtro de stock, porque `Venta` necesita excluir productos sin stock antes de mostrar resultados relevantes.
