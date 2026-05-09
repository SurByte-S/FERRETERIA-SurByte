import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const env = readFileSync(".env.local", "utf8");
  const values = {};

  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);

    if (!match) {
      continue;
    }

    values[match[1]] = match[2].trim().replace(/^"|"$/g, "");
  }

  return values;
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows.filter((item) =>
    item.some((value) => value.trim().length > 0)
  );

  return dataRows.map((values) =>
    headers.reduce((acc, header, index) => {
      acc[header.trim()] = (values[index] ?? "").trim();
      return acc;
    }, {})
  );
}

function parseNullableNumber(value) {
  if (!String(value ?? "").trim()) {
    return null;
  }

  const text = String(value).trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  return !["false", "0", "no", "inactivo"].includes(
    String(value ?? "").trim().toLowerCase()
  );
}

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function chunk(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function upsertCatalog(supabase, table, tenantId, names) {
  const uniqueNames = Array.from(
    new Set(names.map((name) => name.trim()).filter(Boolean))
  );

  for (const items of chunk(uniqueNames, 500)) {
    const { error } = await supabase.from(table).upsert(
      items.map((name, index) => ({
        tenant_id: tenantId,
        name,
        active: true,
        ...(table === "categories" ? { icon: normalizeName(name).toLowerCase(), sort_order: index * 10 } : {}),
      })),
      { onConflict: "tenant_id,name" }
    );

    if (error) {
      throw new Error(`No se pudo guardar ${table}: ${error.message}`);
    }
  }

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
      map.set(item.name.trim().toLowerCase(), item.id);
    }

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return map;
}

async function main() {
  const env = loadEnv();
  const tenantId = env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Faltan variables de Supabase en .env.local");
  }

  if (!tenantId || tenantId === "demo") {
    throw new Error("NEXT_PUBLIC_DEFAULT_TENANT_ID debe ser el UUID real del tenant");
  }

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
  const rows = parseCsv(readFileSync("productos_normalizados.csv", "utf8"));
  const validRows = [];
  let omitted = 0;
  const seen = new Set();

  for (const row of rows) {
    if (!row.sku || !row.descripcion || seen.has(row.sku)) {
      omitted += 1;
      continue;
    }

    seen.add(row.sku);
    validRows.push(row);
  }

  const [categoryMap, brandMap] = await Promise.all([
    upsertCatalog(
      supabase,
      "categories",
      tenantId,
      validRows.map((row) => row.categoria_sugerida ?? "")
    ),
    upsertCatalog(
      supabase,
      "brands",
      tenantId,
      validRows.map((row) => row.marca_sugerida ?? "")
    ),
  ]);

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .insert({
      tenant_id: tenantId,
      source_name: "productos_normalizados.csv",
      total_rows: rows.length,
      valid_rows: validRows.length,
      invalid_rows: omitted,
      notes: "Importacion local desde script",
    })
    .select("id")
    .single();

  if (batchError) {
    throw new Error(`No se pudo crear import batch: ${batchError.message}`);
  }

  const products = validRows.map((row) => ({
    tenant_id: tenantId,
    sku: row.sku,
    barcode: row.codigo || null,
    name: row.descripcion,
    normalized_name: row.nombre_normalizado || normalizeName(row.descripcion),
    description: row.descripcion,
    category_id: categoryMap.get(String(row.categoria_sugerida ?? "").trim().toLowerCase()) ?? null,
    brand_id: brandMap.get(String(row.marca_sugerida ?? "").trim().toLowerCase()) ?? null,
    unit: row.unidad_sugerida || "unidad",
    cost_without_tax: parseNullableNumber(row.costo_sin_iva_ars),
    cost_with_tax: parseNullableNumber(row.costo_con_iva_ars),
    sale_price: parseNullableNumber(row.precio_publico_ars),
    tax_rate: parseNullableNumber(row.iva_pct_inferido) ?? 21,
    stock_quantity: parseNullableNumber(row.stock_inicial) ?? 0,
    min_stock: parseNullableNumber(row.stock_minimo) ?? 0,
    active: parseBoolean(row.activo),
    import_batch_id: batch.id,
    source_excel_row: parseNullableNumber(row.origen_excel_fila),
  }));

  let imported = 0;

  for (const productChunk of chunk(products, 500)) {
    const { error } = await supabase.from("products").upsert(productChunk, {
      onConflict: "tenant_id,sku",
    });

    if (error) {
      throw new Error(`No se pudieron guardar productos: ${error.message}`);
    }

    imported += productChunk.length;
    console.log(`Importados ${imported}/${products.length}`);
  }

  console.log(
    JSON.stringify(
      {
        totalCsv: rows.length,
        importados: imported,
        omitidos: omitted,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
