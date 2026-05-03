# Propuesta de Sistema para Ferreterías (Base: Excel `.xlsm`)

> Estado actual del repositorio: no se encontró el archivo `LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm` dentro de este proyecto, por lo que el diagnóstico del Excel se plantea con estructura esperada y checklist de validación para ejecutar al recibir el archivo.

## 1) Diagnóstico del Excel (preliminar + checklist)

Según tu descripción, el libro tiene dos hojas clave:
- `CATALOGO`: productos, código, descripción, costos, IVA, precio público, cantidad y descuentos.
- `PRESUPUESTO`: armado de presupuesto (producto, cantidad, subtotal).

### Hallazgos típicos esperables en este tipo de Excel
1. **Columnas con nombres no normalizados** (ej. `Costo c/IVA`, `COSTO CON IVA`, etc.).
2. **Precios como texto** (con `$`, comas, puntos mezclados).
3. **IVA inconsistente** (porcentaje en texto, decimal o vacío).
4. **Códigos duplicados o con espacios**.
5. **Descuentos mezclados en una sola columna** sin distinguir si aplican por marca/categoría/artículo.
6. **Filas de notas o subtítulos** dentro del rango de datos.

### Checklist de validación al importar
- Validar columnas mínimas: `codigo`, `descripcion`, `precio_publico`, `cantidad`.
- Unificar formatos numéricos (costos, IVA, precio, stock).
- Eliminar espacios invisibles y caracteres especiales en código.
- Detectar duplicados por código.
- Inferir categoría/marca desde descripción (si no existen columnas explícitas).
- Registrar errores de filas para revisión manual (no frenar toda la importación).

---

## 2) Propuesta de sistema (simple para todo público)

## Principio UX: "Buscar → Tocar → Vender → Imprimir"

### Módulos principales
1. **Inicio (Panel visual)**
   - Tarjetas grandes: `Vender`, `Presupuesto`, `Buscar producto`, `Stock`, `Clientes`, `Caja`.
   - Botón rápido: `Venta rápida`.
   - Alertas visibles: `Productos por agotarse`.

2. **Buscador de productos**
   - Campo grande: "Escribí código o nombre".
   - Resultados en tarjetas (no tabla compleja).
   - Acciones directas: `Agregar`, `Ver detalle`.

3. **Catálogo**
   - Filtros simples por categoría y marca.
   - Vista visual de productos con precio público grande.

4. **Venta rápida**
   - Carrito lateral persistente.
   - Suma automática subtotal/total.
   - Botones grandes `Cobrar` y `Guardar`.

5. **Presupuestos**
   - Crear para cliente o "Consumidor final".
   - Agregar items, editar cantidad, descuento simple.
   - `Imprimir / Exportar PDF`.
   - `Convertir en venta` con un click.

6. **Clientes**
   - Alta rápida: nombre, teléfono, dirección opcional.
   - Historial de presupuestos/ventas.

7. **Stock**
   - Stock actual por producto.
   - Movimientos (venta, ajuste, ingreso mercadería).

8. **Alertas de bajo stock**
   - Lista de productos debajo del mínimo.
   - Sugerencia visual para reponer.

9. **Caja / Resumen del día**
   - Total vendido hoy.
   - Cantidad de ventas.
   - Top productos.

10. **Configuración simple**
   - Datos del local.
   - IVA por defecto.
   - Umbral de bajo stock.

---

## 3) Dataset → Modelo de base de datos (Supabase / PostgreSQL)

## Enfoque multi-tenant desde el inicio
Todas las tablas operativas llevan `tenant_id`.

### Tablas base

- `tenants`
  - `id (uuid pk)`
  - `name`
  - `created_at`

- `users`
  - `id (uuid pk)`
  - `tenant_id (fk)`
  - `full_name`
  - `role` (`owner`, `seller`)
  - `is_active`

- `categories`
  - `id`
  - `tenant_id`
  - `name`

- `brands`
  - `id`
  - `tenant_id`
  - `name`

- `products`
  - `id`
  - `tenant_id`
  - `code` (único por tenant)
  - `description`
  - `category_id`
  - `brand_id`
  - `cost_without_tax`
  - `tax_rate`
  - `cost_with_tax`
  - `public_price`
  - `stock_qty`
  - `min_stock_qty`
  - `is_active`
  - `created_at`, `updated_at`

- `product_discounts`
  - `id`
  - `tenant_id`
  - `scope_type` (`category`, `brand`, `product`)
  - `scope_id`
  - `discount_type` (`percent`, `fixed`)
  - `value`
  - `valid_from`, `valid_to`

- `customers`
  - `id`
  - `tenant_id`
  - `name`
  - `phone`
  - `email`
  - `address`
  - `notes`

- `budgets`
  - `id`
  - `tenant_id`
  - `customer_id`
  - `number`
  - `status` (`draft`, `sent`, `approved`, `expired`, `converted`)
  - `subtotal`
  - `discount_total`
  - `tax_total`
  - `grand_total`
  - `created_at`

- `budget_items`
  - `id`
  - `tenant_id`
  - `budget_id`
  - `product_id`
  - `product_code_snapshot`
  - `description_snapshot`
  - `qty`
  - `unit_price`
  - `discount_amount`
  - `line_total`

- `sales`
  - `id`
  - `tenant_id`
  - `customer_id`
  - `budget_id` (nullable)
  - `number`
  - `status` (`paid`, `pending`, `cancelled`)
  - `payment_method`
  - `subtotal`, `discount_total`, `tax_total`, `grand_total`
  - `sold_at`

- `sale_items`
  - `id`
  - `tenant_id`
  - `sale_id`
  - `product_id`
  - `product_code_snapshot`
  - `description_snapshot`
  - `qty`
  - `unit_price`
  - `discount_amount`
  - `line_total`

- `stock_movements`
  - `id`
  - `tenant_id`
  - `product_id`
  - `movement_type` (`sale`, `purchase`, `adjustment`, `return`)
  - `qty_delta`
  - `reference_type` (`sale`, `manual`, `import`)
  - `reference_id`
  - `notes`
  - `created_at`

- `settings`
  - `id`
  - `tenant_id`
  - `currency`
  - `default_tax_rate`
  - `low_stock_threshold_default`
  - `business_name`
  - `business_phone`
  - `business_address`

- `import_jobs`
  - `id`
  - `tenant_id`
  - `source_filename`
  - `status` (`processing`, `done`, `error`)
  - `rows_total`, `rows_ok`, `rows_error`
  - `error_report_url`
  - `created_at`

### Reglas clave
- Índice único: `unique(tenant_id, code)` en `products`.
- RLS en Supabase: cada usuario solo ve su `tenant_id`.
- Snapshots en items (`description_snapshot`, `unit_price`) para no perder histórico si cambia el producto luego.

---

## 4) Flujo de pantallas (ultra simple)

1. **Inicio**
   - 6 botones grandes.
2. **Buscar producto**
   - Input grande + teclado en pantalla en tablet.
3. **Detalle rápido producto**
   - Precio grande + stock + `Agregar`.
4. **Carrito / Presupuesto**
   - Editar cantidad con + y -.
5. **Confirmar**
   - Cliente opcional + total grande.
6. **Imprimir/Compartir**
   - PDF o impresión térmica/A4.

---

## 5) Diseño UX/UI recomendado

### Guía visual
- Tipografía legible (mínimo 16px).
- Botones 48px+ de alto.
- Contraste alto (texto oscuro sobre fondo claro).
- Iconografía clara: martillo, tornillo, pintura, electricidad, caños.
- Cards con bordes suaves y sombras leves.

### Tono de texto
- "Vender"
- "Buscar"
- "Agregar"
- "Imprimir"
- "Cobrar"

Evitar:
- "Persistir transacción"
- "Gestionar inventario por SKU"

### Accesibilidad práctica para 60+
- Modo "letra grande".
- Confirmaciones claras: "¿Querés finalizar la venta?".
- Mensajes positivos: "Listo, presupuesto guardado".

---

## 6) Plan de implementación por fases

### Fase 1 — Importar Excel y catálogo limpio
- Carga de `.xlsm`.
- Mapeo de columnas y validación.
- Mostrar catálogo en tarjetas.

### Fase 2 — Buscador simple y producto
- Búsqueda por código/descripcion.
- Vista detalle rápida.
- Agregar al carrito/presupuesto.

### Fase 3 — Presupuestos
- Crear/editar presupuesto.
- Asociar cliente.
- Exportar PDF e imprimir.

### Fase 4 — Convertir presupuesto en venta
- Botón "Pasar a venta".
- Generar comprobante.
- Descontar stock.

### Fase 5 — Stock y alertas
- Movimientos automáticos/manuales.
- Alertas por mínimo.
- Pantalla de reposición.

### Fase 6 — Dashboard dueño
- Ventas del día/semana.
- Productos más vendidos.
- Margen estimado.

---

## 7) Arquitectura recomendada (sin Firebase, con Supabase)

- **Frontend**: Next.js + Tailwind (UI limpia y responsive).
- **Backend**: Supabase (Postgres + Auth + RLS + Storage).
- **Importador Excel**: job server-side (Node/Python) con logs de errores.
- **PDF**: plantilla simple con logo y datos del negocio.
- **Multi-tenant**: `tenant_id` + RLS en todas las tablas de negocio.

---

## 8) Próximo paso (antes de código)

Para convertir este diagnóstico en implementación real, el paso siguiente es cargar y perfilar el archivo real `LISTA DE PRECIOS FERRETERIAS 17-04-2026.xlsm` y devolver:
- mapeo exacto de columnas,
- reglas reales de descuento detectadas,
- script SQL inicial + script de importación.
