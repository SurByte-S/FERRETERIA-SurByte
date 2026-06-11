"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { requireUser } from "@/lib/auth/session";
import {
  normalizeName,
  parseBoolean,
  parseCsv,
  toProductCsvRow,
  validateProductCsvHeaders,
  type ProductCsvRow,
} from "@/lib/csv/productos";
import { normalizeProductCode } from "@/lib/product-code";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type ImportSummary = {
  creados: number;
  actualizados: number;
  omitidos: number;
  conErrores: number;
  necesitanRevision: number;
  mensajes: string[];
};

export type ImportPreviewRow = {
  action: "crear" | "actualizar" | "omitir";
  codigo: string;
  descripcion: string;
  messages: string[];
  rowNumber: number;
  sku: string;
  status: "lista" | "error";
  stockInicial: number;
};

export type ImportState = {
  ok: boolean;
  title: string;
  canConfirm: boolean;
  confirmPayload: string;
  fileName: string;
  previewRows: ImportPreviewRow[];
  stockMode: StockImportMode;
  summary: ImportSummary;
};

type CatalogItem = {
  id: string;
  name: string;
};

type ExistingProduct = {
  barcode: string | null;
  id: string;
  sku: string;
  stock_quantity: number | null;
};

type ExistingSaleUnit = {
  barcode: string | null;
  product_id: string;
};

type NormalizedImportRow = {
  activo: boolean;
  categoriaSugerida: string;
  codigo: string | null;
  costoConIvaArs: number | null;
  costoSinIvaArs: number | null;
  descripcion: string;
  ivaPctInferido: number;
  marcaSugerida: string;
  nombreNormalizado: string;
  origenExcelFila: number | null;
  precioPublicoArs: number | null;
  rowNumber: number;
  sku: string;
  stockInicial: number;
  stockMinimo: number;
  unidadSugerida: string;
};

type ImportPlan = {
  errors: ImportPreviewRow[];
  newRows: NormalizedImportRow[];
  previewRows: ImportPreviewRow[];
  rows: NormalizedImportRow[];
  summary: ImportSummary;
  updateRows: NormalizedImportRow[];
};

type StockImportMode = "preserve" | "set";

const initialSummary: ImportSummary = {
  creados: 0,
  actualizados: 0,
  omitidos: 0,
  conErrores: 0,
  necesitanRevision: 0,
  mensajes: [],
};

const MAX_PREVIEW_ROWS = 100;

function friendlyError(message: string): ImportState {
  return {
    ok: false,
    title: "Necesitan revision",
    canConfirm: false,
    confirmPayload: "",
    fileName: "",
    previewRows: [],
    stockMode: "preserve",
    summary: {
      ...initialSummary,
      conErrores: 1,
      mensajes: [message],
    },
  };
}

function lowerKey(value: string) {
  return value.trim().toLowerCase();
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function stockModeValue(value: FormDataEntryValue | null): StockImportMode {
  return value === "set" ? "set" : "preserve";
}

async function readImportFile(file: File) {
  const fileName = file.name;
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    return {
      fileName,
      rows: parseCsv(await file.text()).map((values, index) => ({
        rowNumber: index + 2,
        values,
      })),
    };
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
      type: "buffer",
    });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("El Excel no tiene hojas para importar.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    return {
      fileName,
      rows: rows.map((values, index) => ({
        rowNumber: index + 2,
        values: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [
            key.trim(),
            String(value ?? "").trim(),
          ])
        ) as Record<string, string>,
      })),
    };
  }

  throw new Error("El archivo debe ser CSV, XLS o XLSX.");
}

function parseNumberField({
  fallback,
  field,
  label,
  messages,
  row,
}: {
  fallback: number | null;
  field: keyof ProductCsvRow;
  label: string;
  messages: string[];
  row: ProductCsvRow;
}) {
  const raw = String(row[field] ?? "").trim();

  if (!raw) {
    return fallback;
  }

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0) {
    messages.push(`${label} debe ser numerico y mayor o igual a 0.`);
    return fallback;
  }

  return parsed;
}

function parseIntegerField({
  field,
  label,
  messages,
  row,
}: {
  field: keyof ProductCsvRow;
  label: string;
  messages: string[];
  row: ProductCsvRow;
}) {
  const raw = String(row[field] ?? "").trim();

  if (!raw) {
    return null;
  }

  const parsed = parseNumberField({
    fallback: null,
    field,
    label,
    messages,
    row,
  });

  if (parsed === null) {
    return null;
  }

  if (!Number.isInteger(parsed)) {
    messages.push(`${label} debe ser entero.`);
    return null;
  }

  return parsed;
}

function normalizeImportRow(
  rawRow: { rowNumber: number; values: Record<string, string> }
) {
  const row = toProductCsvRow(rawRow.values);
  const messages: string[] = [];
  const sku = normalizeProductCode(row.sku);
  const codigo = normalizeProductCode(row.codigo);
  const descripcion = row.descripcion.trim();
  const categoriaSugerida = row.categoria_sugerida.trim() || "Sin categoria";
  const marcaSugerida = row.marca_sugerida.trim();
  const unidadSugerida = row.unidad_sugerida.trim() || "unidad";

  if (!sku) {
    messages.push("Falta SKU.");
  }

  if (!descripcion) {
    messages.push("Falta descripcion.");
  }

  const costoSinIvaArs = parseNumberField({
    fallback: null,
    field: "costo_sin_iva_ars",
    label: "Costo sin IVA",
    messages,
    row,
  });
  const costoConIvaArs = parseNumberField({
    fallback: null,
    field: "costo_con_iva_ars",
    label: "Costo con IVA",
    messages,
    row,
  });
  const precioPublicoArs = parseNumberField({
    fallback: null,
    field: "precio_publico_ars",
    label: "Precio publico",
    messages,
    row,
  });
  const ivaPctInferido = parseNumberField({
    fallback: 21,
    field: "iva_pct_inferido",
    label: "IVA",
    messages,
    row,
  });
  const stockInicial = parseNumberField({
    fallback: 0,
    field: "stock_inicial",
    label: "Stock inicial",
    messages,
    row,
  });
  const stockMinimo = parseNumberField({
    fallback: 0,
    field: "stock_minimo",
    label: "Stock minimo",
    messages,
    row,
  });

  return {
    errors: messages,
    row: {
      activo: parseBoolean(row.activo),
      categoriaSugerida,
      codigo: codigo || null,
      costoConIvaArs,
      costoSinIvaArs,
      descripcion,
      ivaPctInferido: ivaPctInferido ?? 21,
      marcaSugerida,
      nombreNormalizado:
        row.nombre_normalizado.trim() || normalizeName(descripcion),
      origenExcelFila: parseIntegerField({
        field: "origen_excel_fila",
        label: "Fila de origen",
        messages,
        row,
      }),
      precioPublicoArs,
      rowNumber: rawRow.rowNumber,
      sku,
      stockInicial: stockInicial ?? 0,
      stockMinimo: stockMinimo ?? 0,
      unidadSugerida,
    } satisfies NormalizedImportRow,
  };
}

function addCodeOwner(
  map: Map<string, ExistingProduct[]>,
  code: string | null | undefined,
  product: ExistingProduct
) {
  const cleanCode = normalizeProductCode(code ?? "");

  if (!cleanCode) {
    return;
  }

  const current = map.get(cleanCode) ?? [];

  if (!current.some((item) => item.id === product.id)) {
    current.push(product);
  }

  map.set(cleanCode, current);
}

async function loadExistingProducts(tenantId: string) {
  const supabase = getSupabaseServerClient();
  const products: ExistingProduct[] = [];
  const saleUnits: ExistingSaleUnit[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,barcode,stock_quantity")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudieron revisar los productos existentes.");
    }

    products.push(...((data ?? []) as ExistingProduct[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("product_sale_units")
      .select("product_id,barcode")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudieron revisar las presentaciones existentes.");
    }

    saleUnits.push(...((data ?? []) as ExistingSaleUnit[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return { products, saleUnits };
}

function buildImportPlan({
  existing,
  rows,
}: {
  existing: Awaited<ReturnType<typeof loadExistingProducts>>;
  rows: { rowNumber: number; values: Record<string, string> }[];
}): ImportPlan {
  const bySku = new Map<string, ExistingProduct>();
  const codeOwners = new Map<string, ExistingProduct[]>();
  const productById = new Map(existing.products.map((product) => [product.id, product]));
  const validRows: NormalizedImportRow[] = [];
  const newRows: NormalizedImportRow[] = [];
  const updateRows: NormalizedImportRow[] = [];
  const errors: ImportPreviewRow[] = [];
  const previewRows: ImportPreviewRow[] = [];
  const seenSkus = new Map<string, number[]>();
  const seenCodes = new Map<string, number[]>();

  for (const product of existing.products) {
    const cleanSku = normalizeProductCode(product.sku);

    bySku.set(cleanSku, product);
    addCodeOwner(codeOwners, product.sku, product);
    addCodeOwner(codeOwners, product.barcode, product);
  }

  for (const saleUnit of existing.saleUnits) {
    const product = productById.get(saleUnit.product_id);

    if (product) {
      addCodeOwner(codeOwners, saleUnit.barcode, product);
    }
  }

  const normalized = rows.map(normalizeImportRow);

  for (const result of normalized) {
    const row = result.row;
    const rowMessages = [...result.errors];

    if (row.sku) {
      const rowsForSku = seenSkus.get(row.sku) ?? [];
      rowsForSku.push(row.rowNumber);
      seenSkus.set(row.sku, rowsForSku);
    }

    if (row.codigo) {
      const rowsForCode = seenCodes.get(row.codigo) ?? [];
      rowsForCode.push(row.rowNumber);
      seenCodes.set(row.codigo, rowsForCode);
    }

    if (rowMessages.length > 0) {
      errors.push({
        action: "omitir",
        codigo: row.codigo ?? "",
        descripcion: row.descripcion,
        messages: rowMessages,
        rowNumber: row.rowNumber,
        sku: row.sku,
        status: "error",
        stockInicial: row.stockInicial,
      });
    }
  }

  const duplicateSkuRows = new Set(
    [...seenSkus.values()].filter((value) => value.length > 1).flat()
  );
  const duplicateCodeRows = new Set(
    [...seenCodes.values()].filter((value) => value.length > 1).flat()
  );
  const rowsWithErrors = new Set(errors.map((error) => error.rowNumber));

  for (const result of normalized) {
    const row = result.row;
    const messages: string[] = [];

    if (rowsWithErrors.has(row.rowNumber)) {
      continue;
    }

    if (duplicateSkuRows.has(row.rowNumber)) {
      messages.push(`SKU duplicado dentro del archivo: ${row.sku}.`);
    }

    if (row.codigo && duplicateCodeRows.has(row.rowNumber)) {
      messages.push(`Codigo duplicado dentro del archivo: ${row.codigo}.`);
    }

    const existingBySku = bySku.get(row.sku);
    const skuOwners = codeOwners.get(row.sku) ?? [];
    const codeOwnersForRow = row.codigo ? codeOwners.get(row.codigo) ?? [] : [];
    const conflictingSkuOwner = skuOwners.find(
      (product) => product.id !== existingBySku?.id
    );
    const conflictingCodeOwner = codeOwnersForRow.find(
      (product) => product.id !== existingBySku?.id
    );

    if (conflictingSkuOwner) {
      messages.push(
        `El SKU ya existe como codigo de otro producto: ${conflictingSkuOwner.sku}.`
      );
    }

    if (conflictingCodeOwner) {
      messages.push(
        `El codigo ya pertenece a otro producto: ${conflictingCodeOwner.sku}.`
      );
    }

    const action = existingBySku ? "actualizar" : "crear";

    if (messages.length > 0) {
      errors.push({
        action: "omitir",
        codigo: row.codigo ?? "",
        descripcion: row.descripcion,
        messages,
        rowNumber: row.rowNumber,
        sku: row.sku,
        status: "error",
        stockInicial: row.stockInicial,
      });
      continue;
    }

    validRows.push(row);

    if (existingBySku) {
      updateRows.push(row);
    } else {
      newRows.push(row);
    }

    previewRows.push({
      action,
      codigo: row.codigo ?? "",
      descripcion: row.descripcion,
      messages: [],
      rowNumber: row.rowNumber,
      sku: row.sku,
      status: "lista",
      stockInicial: row.stockInicial,
    });
  }

  const errorRows = errors.sort((first, second) => first.rowNumber - second.rowNumber);
  const finalPreviewRows = [...errorRows, ...previewRows]
    .sort((first, second) => first.rowNumber - second.rowNumber)
    .slice(0, MAX_PREVIEW_ROWS);
  const summary = {
    ...initialSummary,
    creados: newRows.length,
    actualizados: updateRows.length,
    omitidos: errorRows.length,
    conErrores: errorRows.length,
    necesitanRevision: errorRows.length,
    mensajes: errorRows
      .slice(0, 20)
      .map((row) => `Fila ${row.rowNumber}: ${row.messages.join(" ")}`),
  };

  return {
    errors: errorRows,
    newRows,
    previewRows: finalPreviewRows,
    rows: validRows,
    summary,
    updateRows,
  };
}

async function loadCatalogMap(
  table: "categories" | "brands",
  tenantId: string
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .select("id,name")
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`No se pudo leer ${table}.`);
  }

  return new Map(
    ((data ?? []) as CatalogItem[]).map((item) => [lowerKey(item.name), item.id])
  );
}

async function ensureCatalogItems(
  table: "categories" | "brands",
  tenantId: string,
  names: string[]
) {
  const supabase = getSupabaseServerClient();
  const current = await loadCatalogMap(table, tenantId);
  const missing = Array.from(
    new Set(
      names
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
        .filter((name) => table !== "brands" || name !== "0")
        .filter((name) => !current.has(lowerKey(name)))
    )
  );

  if (missing.length > 0) {
    const { error } = await supabase.from(table).upsert(
      missing.map((name) => ({
        tenant_id: tenantId,
        name,
        active: true,
      })),
      { onConflict: "tenant_id,name" }
    );

    if (error) {
      throw new Error(`No se pudieron crear ${table}.`);
    }
  }

  return loadCatalogMap(table, tenantId);
}

function productPayload({
  batchId,
  brandMap,
  categoryMap,
  includeStock,
  row,
  tenantId,
}: {
  batchId: string;
  brandMap: Map<string, string>;
  categoryMap: Map<string, string>;
  includeStock: boolean;
  row: NormalizedImportRow;
  tenantId: string;
}) {
  const brandId =
    row.marcaSugerida && row.marcaSugerida !== "0"
      ? brandMap.get(lowerKey(row.marcaSugerida)) ?? null
      : null;
  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    sku: row.sku,
    barcode: row.codigo,
    name: row.descripcion,
    normalized_name: row.nombreNormalizado,
    description: row.descripcion,
    category_id: categoryMap.get(lowerKey(row.categoriaSugerida)) ?? null,
    brand_id: brandId,
    unit: row.unidadSugerida,
    cost_without_tax: row.costoSinIvaArs,
    cost_with_tax: row.costoConIvaArs,
    sale_price: row.precioPublicoArs,
    tax_rate: row.ivaPctInferido,
    min_stock: row.stockMinimo,
    active: row.activo,
    import_batch_id: batchId,
    source_excel_row: row.origenExcelFila,
  };

  if (includeStock) {
    payload.stock_quantity = row.stockInicial;
  }

  return payload;
}

async function applyImportPlan({
  fileName,
  plan,
  stockMode,
  tenantId,
  userId,
}: {
  fileName: string;
  plan: ImportPlan;
  stockMode: StockImportMode;
  tenantId: string;
  userId: string;
}) {
  const supabase = getSupabaseServerClient();
  const [categoryMap, brandMap] = await Promise.all([
    ensureCatalogItems(
      "categories",
      tenantId,
      plan.rows.map((row) => row.categoriaSugerida)
    ),
    ensureCatalogItems(
      "brands",
      tenantId,
      plan.rows.map((row) => row.marcaSugerida)
    ),
  ]);
  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      tenant_id: tenantId,
      source_name: fileName,
      imported_by: userId,
      total_rows: plan.rows.length + plan.errors.length,
      valid_rows: plan.rows.length,
      invalid_rows: plan.errors.length,
      notes:
        stockMode === "set"
          ? "Importacion revisada CSV/XLSX. Stock de existentes ajustado con movimientos."
          : "Importacion revisada CSV/XLSX. Stock de existentes preservado.",
    })
    .select("id")
    .single();

  if (batchError || !batch) {
    throw new Error("No se pudo registrar la importacion.");
  }

  const batchId = (batch as { id: string }).id;
  const insertedProducts: { id: string; sku: string }[] = [];

  for (const rows of chunk(plan.newRows, 300)) {
    const { data, error } = await supabase
      .from("products")
      .insert(
        rows.map((row) =>
          productPayload({
            batchId,
            brandMap,
            categoryMap,
            includeStock: true,
            row,
            tenantId,
          })
        )
      )
      .select("id,sku");

    if (error) {
      throw new Error("No se pudieron crear algunos productos.");
    }

    insertedProducts.push(...((data ?? []) as { id: string; sku: string }[]));
  }

  const insertedBySku = new Map(
    insertedProducts.map((product) => [product.sku, product.id])
  );
  const newRowsWithIds = plan.newRows
    .map((row) => ({ row, productId: insertedBySku.get(row.sku) }))
    .filter((item): item is { row: NormalizedImportRow; productId: string } =>
      Boolean(item.productId)
    );

  for (const rows of chunk(newRowsWithIds, 500)) {
    const { error } = await supabase.from("product_sale_units").insert(
      rows.map(({ productId, row }) => ({
        tenant_id: tenantId,
        product_id: productId,
        name: "Unidad",
        quantity_in_base_unit: 1,
        sale_price: row.precioPublicoArs ?? 0,
        barcode: null,
        is_default: true,
        active: true,
      }))
    );

    if (error) {
      throw new Error("Se crearon productos, pero fallaron presentaciones.");
    }
  }

  const initialMovements = newRowsWithIds
    .filter(({ row }) => row.stockInicial > 0)
    .map(({ productId, row }) => ({
      tenant_id: tenantId,
      product_id: productId,
      movement_type: "initial",
      quantity: row.stockInicial,
      unit_cost: row.costoConIvaArs,
      notes: `Stock inicial importado: ${fileName}`,
      created_by: userId,
    }));

  for (const rows of chunk(initialMovements, 500)) {
    const { error } = await supabase.from("inventory_movements").insert(rows);

    if (error) {
      throw new Error("Se crearon productos, pero fallaron movimientos iniciales.");
    }
  }

  const existingBySku = new Map(
    (await loadExistingProducts(tenantId)).products.map((product) => [
      product.sku,
      product,
    ])
  );

  for (const row of plan.updateRows) {
    const existing = existingBySku.get(row.sku);
    const payload = productPayload({
      batchId,
      brandMap,
      categoryMap,
      includeStock: stockMode === "set",
      row,
      tenantId,
    });

    delete payload.tenant_id;
    delete payload.sku;

    const { error } = await supabase
      .from("products")
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("sku", row.sku);

    if (error) {
      throw new Error(`No se pudo actualizar SKU ${row.sku}.`);
    }

    if (stockMode === "set" && existing) {
      const previousStock = Number(existing.stock_quantity ?? 0);
      const difference = row.stockInicial - previousStock;

      if (difference !== 0) {
        const { error: movementError } = await supabase
          .from("inventory_movements")
          .insert({
            tenant_id: tenantId,
            product_id: existing.id,
            movement_type:
              previousStock === 0 && row.stockInicial > 0 ? "initial" : "adjustment",
            quantity: difference,
            unit_cost: row.costoConIvaArs,
            notes: `Stock ajustado por importacion: ${fileName}`,
            created_by: userId,
          });

        if (movementError) {
          throw new Error(`No se pudo registrar movimiento de SKU ${row.sku}.`);
        }
      }
    }
  }
}

function buildConfirmPayload({
  fileName,
  plan,
  stockMode,
}: {
  fileName: string;
  plan: ImportPlan;
  stockMode: StockImportMode;
}) {
  return JSON.stringify({
    fileName,
    rows: plan.rows,
    stockMode,
  });
}

function parseConfirmPayload(value: string): {
  fileName: string;
  rows: NormalizedImportRow[];
  stockMode: StockImportMode;
} {
  const parsed = JSON.parse(value) as {
    fileName?: unknown;
    rows?: unknown;
    stockMode?: unknown;
  };

  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new Error("No hay productos revisados para confirmar.");
  }

  return {
    fileName: String(parsed.fileName ?? "productos-importados"),
    rows: parsed.rows as NormalizedImportRow[],
    stockMode: parsed.stockMode === "set" ? "set" : "preserve",
  };
}

export async function previewProductsImportAction(
  _previousState: ImportState,
  formData: FormData
): Promise<ImportState> {
  const file = formData.get("productFile");
  const stockMode = stockModeValue(formData.get("stockMode"));

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);

    if (!(file instanceof File) || file.size === 0) {
      return friendlyError("Selecciona un archivo CSV, XLS o XLSX.");
    }

    const parsedFile = await readImportFile(file);

    if (parsedFile.rows.length === 0) {
      return friendlyError("El archivo no tiene productos para importar.");
    }

    const missingHeaders = validateProductCsvHeaders(
      parsedFile.rows.map((row) => row.values)
    );

    if (missingHeaders.length > 0) {
      return friendlyError(
        `Faltan columnas necesarias: ${missingHeaders.join(", ")}.`
      );
    }

    const plan = buildImportPlan({
      existing: await loadExistingProducts(tenant.id),
      rows: parsedFile.rows,
    });
    const canConfirm = plan.errors.length === 0 && plan.rows.length > 0;

    return {
      ok: canConfirm,
      title: canConfirm
        ? "Vista previa lista para confirmar"
        : "Hay filas que necesitan revision",
      canConfirm,
      confirmPayload: canConfirm
        ? buildConfirmPayload({
            fileName: parsedFile.fileName,
            plan,
            stockMode,
          })
        : "",
      fileName: parsedFile.fileName,
      previewRows: plan.previewRows,
      stockMode,
      summary: plan.summary,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return friendlyError("No tenes permiso para importar productos.");
    }

    return friendlyError(
      error instanceof Error
        ? error.message
        : "No se pudo preparar la importacion."
    );
  }
}

export async function confirmProductsImportAction(
  _previousState: ImportState,
  formData: FormData
): Promise<ImportState> {
  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"]),
      requireUser(),
    ]);
    const payload = parseConfirmPayload(String(formData.get("payload") ?? ""));
    const rows = payload.rows.map((row) => ({
      rowNumber: row.rowNumber,
      values: {
        activo: row.activo ? "true" : "false",
        categoria_sugerida: row.categoriaSugerida,
        codigo: row.codigo ?? "",
        costo_con_iva_ars: String(row.costoConIvaArs ?? ""),
        costo_sin_iva_ars: String(row.costoSinIvaArs ?? ""),
        descripcion: row.descripcion,
        iva_pct_inferido: String(row.ivaPctInferido),
        marca_sugerida: row.marcaSugerida,
        nombre_normalizado: row.nombreNormalizado,
        origen_excel_fila: String(row.origenExcelFila ?? ""),
        precio_publico_ars: String(row.precioPublicoArs ?? ""),
        sku: row.sku,
        stock_inicial: String(row.stockInicial),
        stock_minimo: String(row.stockMinimo),
        unidad_sugerida: row.unidadSugerida,
      },
    }));
    const plan = buildImportPlan({
      existing: await loadExistingProducts(tenant.id),
      rows,
    });

    if (plan.errors.length > 0 || plan.rows.length === 0) {
      return {
        ok: false,
        title: "La base cambio desde la vista previa",
        canConfirm: false,
        confirmPayload: "",
        fileName: payload.fileName,
        previewRows: plan.previewRows,
        stockMode: payload.stockMode,
        summary: plan.summary,
      };
    }

    await applyImportPlan({
      fileName: payload.fileName,
      plan,
      stockMode: payload.stockMode,
      tenantId: tenant.id,
      userId: user.id,
    });

    revalidatePath("/productos");
    revalidatePath("/stock");
    revalidatePath("/inicio");

    return {
      ok: true,
      title: "Importacion confirmada",
      canConfirm: false,
      confirmPayload: "",
      fileName: payload.fileName,
      previewRows: plan.previewRows,
      stockMode: payload.stockMode,
      summary: plan.summary,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return friendlyError("No tenes permiso para importar productos.");
    }

    return friendlyError(
      error instanceof Error ? error.message : "No se pudo confirmar la importacion."
    );
  }
}
