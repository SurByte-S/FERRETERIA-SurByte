# FERRETERÍA SaaS — Prompts iniciales para Codex

## Prompt 1 — Crear base del proyecto

Actuá como ingeniero senior full-stack. Necesito crear una SaaS multi-tenant para administrar ferreterías, orientada a usuarios adultos poco técnicos. Usar Next.js App Router, TypeScript, Supabase, Tailwind, shadcn/ui y una arquitectura clara por módulos.

Objetivo de esta tarea:
1. Crear el proyecto base.
2. Configurar estructura de carpetas.
3. Preparar conexión Supabase.
4. Crear layout principal accesible.
5. Dejar una pantalla inicial simple con accesos grandes.

Restricciones UX:
- Botones grandes, textos claros y contraste alto.
- Nada de botones muertos.
- Cada acción importante debe tener texto + ícono.
- Navegación simple: Inicio, Productos, Presupuesto, Ventas, Clientes, Configuración.
- Pensar en personas mayores: evitar jerga técnica.

Estructura esperada:
- app/(dashboard)/inicio
- app/(dashboard)/productos
- app/(dashboard)/presupuestos
- app/(dashboard)/ventas
- app/(dashboard)/clientes
- lib/supabase
- lib/tenant
- components/ui
- components/shell
- components/productos
- components/presupuestos

Entregá código funcionando, variables `.env.example`, README corto y comandos para correr localmente.

## Prompt 2 — Migración Supabase multi-tenant

Con el archivo `001_initial_schema_supabase.sql`, integrá la migración al proyecto. Revisá que todas las tablas de negocio tengan `tenant_id`, índices por tenant y RLS activado. Crear un README en `supabase/README.md` explicando:
- cómo ejecutar migraciones,
- cómo crear el primer tenant,
- cómo asociar un usuario owner,
- cómo validar que un usuario no pueda ver datos de otro tenant.

No simplifiques eliminando RLS. La app será multi-tenant real.

## Prompt 3 — Importador de productos CSV

Crear módulo de importación desde `productos_normalizados.csv`.

Requisitos:
1. Pantalla `/productos/importar`.
2. Upload o selección de CSV.
3. Vista previa de primeras 20 filas.
4. Validaciones:
   - `sku` requerido
   - `descripcion` requerida
   - precio/costo puede venir vacío, pero debe marcarse como “revisar”
   - evitar duplicados por `(tenant_id, sku)`
5. Crear categorías y marcas si no existen.
6. Insertar o actualizar productos según SKU.
7. Mostrar resumen final: creados, actualizados, omitidos, con errores.

UX:
- Mensajes grandes y claros.
- “Importar productos” debe ser un botón principal.
- Si hay errores, mostrar “Necesitan revisión”, no mensajes técnicos tipo stacktrace.

## Prompt 4 — Módulo Productos simple

Crear pantalla de productos para ferretería con:
- buscador grande por código o descripción,
- filtros por categoría y marca,
- tarjetas o tabla legible,
- precio público bien visible,
- stock visible con semáforo simple,
- botón “Editar”,
- botón “Crear presupuesto con este producto”.

Campos editables:
- descripción,
- categoría,
- marca,
- unidad,
- costo,
- precio público,
- stock,
- stock mínimo,
- activo/inactivo.

No mostrar campos internos como `tenant_id`, UUID o `import_batch_id` al usuario final.

## Prompt 5 — Presupuesto rápido

Crear pantalla `/presupuestos/nuevo` inspirada en la hoja `PRESUPUESTO` del Excel.

Flujo:
1. Datos del cliente: razón social/nombre, teléfono, email, domicilio.
2. Buscar producto por código o descripción.
3. Agregar cantidad.
4. Calcular subtotal y total.
5. Permitir imprimir o exportar PDF.
6. Botón claro: “Guardar presupuesto”.

UX:
- El usuario debe poder hacerlo con teclado y mouse.
- Enter agrega producto si hay coincidencia exacta por código.
- Total siempre visible.
- Evitar pantallas recargadas.

## Prompt 6 — Reglas de diseño para todo el proyecto

Aplicá estas reglas globales:
- Usar lenguaje humano: “Producto guardado”, no “mutation success”.
- Tipografía grande en acciones primarias.
- Colores sobrios y alto contraste.
- Estados vacíos con explicación y botón de acción.
- Confirmar antes de borrar.
- No crear botones sin funcionalidad.
- Cada pantalla debe tener un camino claro de regreso.
- No usar íconos solos sin texto.
