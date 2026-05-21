# MODO MOSTRADOR FAMILIAR

## 1. Objetivo general

Definir una experiencia visual simple, clara y familiar para un dueño de ferretería de +65 años, acostumbrado a sistemas clásicos de escritorio y planillas Excel.

El sistema debe sentirse como una herramienta de trabajo diaria: rápida para vender, clara para consultar y difícil de usar mal.

Esta guía es conceptual y de producto/UX. No implica modificar base de datos, rutas, Supabase, RLS ni lógica existente. Cualquier cambio futuro debe respetar lo que ya funciona.

Cada cambio visual futuro debe responder: ¿esto se parece más a una planilla o sistema de mostrador conocido?

## 2. Perfil del usuario

Usuario principal:

- Dueño o encargado de ferretería.
- Más de 65 años.
- Acostumbrado a sistemas antiguos tipo StockFácil.
- Familiarizado con Excel, listados, columnas y totales.
- Prefiere ver datos completos antes que interfaces minimalistas.
- Necesita botones visibles, textos simples y números grandes.
- No quiere aprender lógica nueva si puede reconocer patrones conocidos.

## 3. Qué conviene imitar del sistema viejo

Conceptualmente conviene tomar:

- Módulos claros: Artículos, Clientes, Ventas, Caja, Estadísticas.
- Listados tipo planilla.
- Columnas visibles y comparables.
- Total grande en ventas.
- Botones de acción grandes.
- Flujo de venta con producto, cliente, forma de pago y comprobante.
- Pantallas de stock con código, detalle, stock y precio.
- Estadísticas simples basadas en ventas, cobros y caja.
- Sensación de sistema de mostrador, no de app moderna abstracta.

## 4. Qué NO conviene copiar

No conviene copiar:

- Diseño visual viejo, pesado o gris sin jerarquía.
- Menús saturados con demasiados módulos visibles.
- Ventanas modales apiladas.
- Campos obligatorios innecesarios antes de vender.
- Atajos de teclado como única forma de operar.
- Tablas demasiado comprimidas.
- Lenguaje técnico o contable complejo.
- Pantallas con muchas opciones que el usuario no usa todos los días.

## 5. Reglas visuales generales

- Priorizar claridad sobre estética moderna.
- Usar letras grandes.
- Usar alto de fila cómodo.
- Usar tablas en desktop.
- Usar tarjetas solo cuando la pantalla sea chica.
- Alinear importes a la derecha.
- Mostrar totales con tamaño destacado.
- Mantener buen contraste.
- Evitar elementos escondidos si son importantes.
- Evitar animaciones decorativas.
- Usar colores con significado: verde bien, rojo deuda/error, azul acción principal.

## 6. Reglas para navegación

La navegación debe responder a módulos conocidos.

Nombres recomendados:

- Vender
- Caja
- Stock
- Clientes
- Estadísticas
- Presupuestos
- Solo encargado

Reglas:

- El módulo principal debe ser Vender.
- Caja debe estar visible.
- Stock debe estar visible.
- Ajustes debe sentirse separado del trabajo diario.
- Evitar que el usuario dependa de iconos solos.
- Si el sidebar se colapsa, debe seguir siendo fácil reconocer dónde está cada cosa.

## 7. Reglas para pantallas tipo venta

La pantalla de venta debe parecer un mostrador digital.

Debe priorizar:

- Buscar producto.
- Agregar producto.
- Ver productos cargados.
- Ver total grande.
- Elegir forma de pago.
- Cobrar venta.
- Guardar presupuesto si hace falta.

Conceptos importantes:

- Venta actual
- Total
- Forma de pago
- Cliente
- Cobrar venta
- Guardar presupuesto

No conviene:

- Esconder el total.
- Pedir demasiados datos antes de vender.
- Hacer que la pantalla parezca un dashboard.
- Usar pasos largos tipo asistente.

## 8. Reglas para stock / artículos

Stock debe sentirse como una planilla de artículos.

Columnas ideales:

- Código
- Detalle
- Marca / Familia
- Proveedor
- Stock
- Stock mínimo
- Precio venta
- Estado
- Acciones

Reglas:

- En desktop, preferir tabla.
- En mobile, usar tarjetas compactas.
- El buscador debe aceptar código, nombre o detalle.
- El stock bajo debe destacarse claramente.
- El precio de venta debe ser fácil de encontrar.
- No mezclar demasiada edición avanzada en el listado principal.

## 9. Reglas para clientes y cuenta corriente

Clientes debe sentirse como una libreta clara de cuenta corriente.

Columnas ideales:

- Cliente
- Teléfono
- Dirección
- Estado de cuenta
- Acciones

Reglas:

- Mostrar deuda o saldo a favor sin tecnicismos.
- Usar "Debe $..." en rojo.
- Usar "Sin deuda" en verde.
- Usar "Saldo a favor" en verde o azul.
- Mantener botones Ver y Editar grandes.
- Mantener buscador visible.

## 10. Reglas para caja

Caja debe ser una pantalla de operación diaria.

Debe mostrar:

- Caja abierta o cerrada.
- Monto inicial.
- Total vendido.
- Efectivo esperado.
- Total por forma de pago.
- Cerrar caja.
- Historial de cierres.

Reglas:

- Usar frases directas.
- Diferencia de caja debe estar muy clara.
- Evitar mensajes que normalicen vender sin caja abierta.
- Separar apertura/cierre de estadísticas generales.

## 11. Reglas para estadísticas

Estadísticas debe parecer una planilla contable simple.

Debe priorizar:

- Total vendido.
- Total cobrado.
- Pendiente de cobro.
- Cantidad de ventas.
- Promedio por venta.
- Ventas por día.
- Forma de pago.

Reglas:

- Tabla antes que gráfico.
- Gráfico simple de barras horizontales.
- Mostrar siempre el importe escrito.
- No usar gráficos circulares.
- No usar métricas difíciles de comprobar.
- No hablar de ganancia si no hay costos confiables.

## 12. Vocabulario recomendado

Usar:

- Vender
- Cobrar
- Caja
- Abrir caja
- Cerrar caja
- Stock
- Artículos
- Clientes
- Cuenta corriente
- Debe
- Sin deuda
- Saldo a favor
- Presupuesto
- Imprimir
- Total vendido
- Total cobrado
- Pendiente de cobro
- Promedio por venta
- Forma de pago
- Buscar
- Agregar
- Editar
- Ver

## 13. Vocabulario que conviene evitar

Evitar:

- Dashboard
- Analytics
- Métricas avanzadas
- Range
- Dataset
- Tenant
- Configuración avanzada
- Workflow
- Pipeline
- Performance
- Conversión
- Engagement
- Estado financiero estimado
- Rentabilidad estimada sin costos reales

## 14. Prioridades futuras, sin implementación

Prioridad 1:

- Corregir textos raros o caracteres rotos.
- Mantener nombres claros de módulos.

Prioridad 2:

- Llevar Stock a una vista más tipo Excel en desktop.
- Llevar Presupuestos a tabla en desktop.

Prioridad 3:

- Revisar si la navegación colapsada es suficientemente clara para usuario mayor.

Prioridad 4:

- Pulir pantalla de venta para mostrar más estructura clásica: cliente, pago, comprobante, ticket y total.

Prioridad 5:

- Evaluar estadísticas contables simples solo cuando existan datos confiables de costos.

Estas prioridades son conceptuales. No deben implementarse sin una decisión explícita y sin validar antes que no rompan rutas, base de datos, Supabase, RLS ni lógica existente.

## 15. Cosas que NO se deben tocar porque ya funcionan

No tocar sin una razón fuerte:

- `/inicio` como pantalla principal de venta.
- Total grande de la venta.
- Flujo buscar producto -> agregar -> cobrar.
- Botón Cobrar venta.
- Botón Guardar presupuesto.
- `/caja` como pantalla separada de apertura y cierre.
- Links Ver / Imprimir en ventas y presupuestos.
- `/clientes` con buscador, tabla y estado de cuenta.
- `/ventas` como pantalla actual de estadísticas/listado de ventas, salvo decisión futura de separar Ventas realizadas y Estadísticas.
- Separación entre operación diaria y Solo encargado.
- Rutas existentes.
- Base de datos.
- Supabase.
- RLS.
- Lógica de ventas, caja, stock, clientes y presupuestos.
- Componentes funcionales que ya resuelven el flujo diario.

Esta guía debe funcionar como criterio de producto: cualquier cambio futuro debería acercar el sistema a una herramienta de mostrador clara, reconocible y fácil de usar para alguien que viene de sistemas clásicos y Excel.
