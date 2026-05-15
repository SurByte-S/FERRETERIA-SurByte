"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";
import {
  normalizeName,
  parseBoolean,
  parseCsv,
  parseNullableNumber,
  toProductCsvRow,
  validateProductCsvHeaders,
  validateProductCsvRow,
} from "@/lib/csv/productos";

type ImportSummary = {
  creados: number;
  actualizados: number;
  omitidos: number;
  conErrores: number;
  necesitanRevision: number;
  mensajes: string[];
};

type ImportState = {
  ok: boolean;
  title: string;
  summary: ImportSummary;
};

type CatalogItem = {
  id: string;
  name: string;
};

const initialSummary: ImportSummary = {
  creados: 0,
  actualizados: 0,
  omitidos: 0,
  conErrores: 0,
  necesitanRevision: 0,
  mensajes: [],
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function friendlyError(message: string): ImportState {
  return {
    ok: false,
    title: "Necesitan revision",
    summary: {
      ...initialSummary,
      conErrores: 1,
      mensajes: [message],
    },
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
    ((data ?? []) as CatalogItem[]).map((item) => [
      item.name.trim().toLowerCase(),
      item.id,
    ])
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
        .filter((name) => !current.has(name.toLowerCase()))
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

async function loadExistingSkus(tenantId: string) {
  const supabase = getSupabaseServerClient();
  const existing = new Set<string>();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("sku")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudieron revisar los SKU existentes.");
    }

    for (const row of (data ?? []) as { sku: string }[]) {
      existing.add(row.sku);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return existing;
}

export async function importProductsAction(
  _previousState: ImportState,
  formData: FormData
): Promise<ImportState> {
  const file = formData.get("csvFile");
  let tenant;

  try {
    tenant = await requireTenantRole(["owner", "admin"]);
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return friendlyError("No tenes permiso para importar productos.");
    }

    throw error;
  }

  if (!isUuid(tenant.id)) {
    return friendlyError("No se pudo identificar la ferreteria para importar.");
  }

  if (!(file instanceof File) || file.size === 0) {
    return friendlyError("Selecciona un archivo CSV para importar.");
  }

  let rows: Record<string, string>[];

  try {
    rows = parseCsv(await file.text());
  } catch {
    return friendlyError("El CSV no se pudo leer. Revisa el formato del archivo.");
  }

  if (rows.length === 0) {
    return friendlyError("El CSV no tiene productos para importar.");
  }

  const missingHeaders = validateProductCsvHeaders(rows);

  if (missingHeaders.length > 0) {
    return friendlyError(
      `Faltan columnas necesarias: ${missingHeaders.join(", ")}.`
    );
  }

  const summary: ImportSummary = {
    ...initialSummary,
    mensajes: [],
  };
  const seenInFile = new Set<string>();
  const validRows = [];

  for (const [index, rawRow] of rows.entries()) {
    const row = toProductCsvRow(rawRow);
    const validation = validateProductCsvRow(row, index + 2);
    const hasBlockingError = !row.sku || !row.descripcion;

    if (validation.messages.some((message) => message.includes("revisar"))) {
      summary.necesitanRevision += 1;
    }

    if (hasBlockingError) {
      summary.omitidos += 1;
      summary.conErrores += 1;
      summary.mensajes.push(
        `Fila ${index + 2}: necesitan revision por SKU o descripcion faltante.`
      );
      continue;
    }

    if (seenInFile.has(row.sku)) {
      summary.omitidos += 1;
      summary.conErrores += 1;
      summary.mensajes.push(
        `Fila ${index + 2}: necesitan revision porque el SKU ${row.sku} esta repetido en el archivo.`
      );
      continue;
    }

    seenInFile.add(row.sku);
    validRows.push(row);
  }

  if (validRows.length === 0) {
    return {
      ok: false,
      title: "Necesitan revision",
      summary,
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const [categoryMap, brandMap, existingSkus] = await Promise.all([
      ensureCatalogItems(
        "categories",
        tenant.id,
        validRows.map((row) => row.categoria_sugerida)
      ),
      ensureCatalogItems(
        "brands",
        tenant.id,
        validRows.map((row) => row.marca_sugerida)
      ),
      loadExistingSkus(tenant.id),
    ]);

    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        tenant_id: tenant.id,
        source_name: file.name,
        total_rows: rows.length,
        valid_rows: validRows.length,
        invalid_rows: summary.omitidos,
        notes: "Importacion CSV de productos normalizados",
      })
      .select("id")
      .single();

    if (batchError) {
      throw new Error("No se pudo registrar la importacion.");
    }

    const products = validRows.map((row) => {
      const categoryId = categoryMap.get(
        row.categoria_sugerida.trim().toLowerCase()
      );
      const brandId = row.marca_sugerida.trim()
        ? brandMap.get(row.marca_sugerida.trim().toLowerCase())
        : null;

      if (existingSkus.has(row.sku)) {
        summary.actualizados += 1;
      } else {
        summary.creados += 1;
      }

      return {
        tenant_id: tenant.id,
        sku: row.sku,
        barcode: row.codigo || null,
        name: row.descripcion,
        normalized_name:
          row.nombre_normalizado || normalizeName(row.descripcion),
        description: row.descripcion,
        category_id: categoryId ?? null,
        brand_id: brandId ?? null,
        unit: row.unidad_sugerida || "unidad",
        cost_without_tax: parseNullableNumber(row.costo_sin_iva_ars),
        cost_with_tax: parseNullableNumber(row.costo_con_iva_ars),
        sale_price: parseNullableNumber(row.precio_publico_ars),
        tax_rate: parseNullableNumber(row.iva_pct_inferido) ?? 21,
        stock_quantity: parseNullableNumber(row.stock_inicial) ?? 0,
        min_stock: parseNullableNumber(row.stock_minimo) ?? 0,
        active: parseBoolean(row.activo),
        import_batch_id: (batch as { id: string }).id,
        source_excel_row: parseNullableNumber(row.origen_excel_fila),
      };
    });

    for (const productChunk of chunk(products, 500)) {
      const { error } = await supabase.from("products").upsert(productChunk, {
        onConflict: "tenant_id,sku",
      });

      if (error) {
        throw new Error("No se pudieron guardar algunos productos.");
      }
    }

    return {
      ok: summary.conErrores === 0,
      title:
        summary.conErrores > 0
          ? "Importacion completada con productos que necesitan revision"
          : "Importacion completada",
      summary,
    };
  } catch (error) {
    return friendlyError(
      error instanceof Error
        ? error.message
        : "No se pudo completar la importacion."
    );
  }
}
