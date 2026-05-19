import { DEFAULT_BRAND, normalizeName } from "./normalize.mjs";

const CHUNK_SIZE = 500;

function chunk(items, size = CHUNK_SIZE) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function lowerKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

export async function validateTenantExists(supabase, tenantId) {
  const cleanTenantId = String(tenantId ?? "").trim();

  if (!cleanTenantId) {
    throw new Error("El tenant_id no existe en public.tenants: ");
  }

  const { data, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", cleanTenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo validar tenant_id en public.tenants: ${error.message}`);
  }

  if (!data) {
    throw new Error(`El tenant_id no existe en public.tenants: ${cleanTenantId}`);
  }
}

export async function loadExistingProducts(supabase, tenantId) {
  const products = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,barcode")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`No se pudieron leer productos existentes: ${error.message}`);
    }

    products.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return products;
}

async function loadCatalogMap(supabase, table, tenantId) {
  const map = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("id,name")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`No se pudo leer ${table}: ${error.message}`);
    }

    for (const item of data ?? []) {
      map.set(lowerKey(item.name), item.id);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return map;
}

async function ensureCatalogItems(supabase, table, tenantId, names) {
  const cleanTenantId = String(tenantId ?? "").trim();
  const current = await loadCatalogMap(supabase, table, cleanTenantId);
  const missing = Array.from(
    new Set(
      names
        .map((name) => String(name ?? "").trim())
        .filter(Boolean)
        .filter((name) => !current.has(lowerKey(name)))
    )
  );

  console.log(
    `[import-productos] ${table}: cantidad a crear=${missing.length} | tenant_id=${cleanTenantId}`
  );

  for (const items of chunk(missing)) {
    const { error } = await supabase.from(table).upsert(
      items.map((name, index) => ({
        tenant_id: cleanTenantId,
        name,
        active: true,
        ...(table === "categories"
          ? { icon: normalizeName(name).toLowerCase(), sort_order: index * 10 }
          : {}),
      })),
      { onConflict: "tenant_id,name" }
    );

    if (error) {
      throw new Error(`No se pudieron crear ${table}: ${error.message}`);
    }
  }

  return loadCatalogMap(supabase, table, cleanTenantId);
}

function mapProductRow(row, tenantId, importBatchId, categoryMap, brandMap, includeStock) {
  const brandId =
    row.marcaSugerida === DEFAULT_BRAND
      ? null
      : brandMap.get(lowerKey(row.marcaSugerida)) ?? null;
  const product = {
    tenant_id: tenantId,
    sku: row.sku,
    barcode: row.codigo,
    name: row.descripcion,
    normalized_name: row.nombreNormalizado || normalizeName(row.descripcion),
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
    import_batch_id: importBatchId,
    source_excel_row: row.origenExcelFila,
  };

  if (includeStock) {
    product.stock_quantity = row.stockInicial;
  }

  return product;
}

export async function applyImportPlan({ supabase, plan }) {
  const tenantId = String(plan.tenantId ?? "").trim();

  await validateTenantExists(supabase, tenantId);
  console.log(`[import-productos] tenant_id usado en importacion real=${tenantId}`);

  const categoryMap = await ensureCatalogItems(
    supabase,
    "categories",
    tenantId,
    plan.rows.map((row) => row.categoriaSugerida)
  );
  const brandMap = await ensureCatalogItems(
    supabase,
    "brands",
    tenantId,
    plan.rows
      .map((row) => row.marcaSugerida)
      .filter((name) => name !== DEFAULT_BRAND)
  );

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      tenant_id: tenantId,
      source_name: plan.sourceName,
      total_rows: plan.totalRows,
      valid_rows: plan.rows.length,
      invalid_rows: plan.errors.length,
      notes: `Importacion segura CSV. Nuevos: ${plan.newRows.length}. Actualizados: ${plan.updateRows.length}. Estado: aplicado.`,
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(`No se pudo crear import_batches: ${batchError.message}`);
  }

  const batchId = batch.id;
  let inserted = 0;
  let updated = 0;

  const inserts = plan.newRows.map((row) =>
    mapProductRow(row, tenantId, batchId, categoryMap, brandMap, true)
  );

  for (const insertChunk of chunk(inserts)) {
    const { error } = await supabase.from("products").insert(insertChunk);

    if (error) {
      throw new Error(`No se pudieron insertar productos: ${error.message}`);
    }

    inserted += insertChunk.length;
  }

  for (const row of plan.updateRows) {
    const payload = mapProductRow(
      row,
      tenantId,
      batchId,
      categoryMap,
      brandMap,
      false
    );
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
      throw new Error(`No se pudo actualizar sku ${row.sku}: ${error.message}`);
    }

    updated += 1;
  }

  return {
    importBatchId: batchId,
    inserted,
    updated,
  };
}
