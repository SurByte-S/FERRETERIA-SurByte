import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import XLSX from "xlsx";

const defaultPath = "data/imports/compras/ferremax_9-1267_REVISION_PREVIA.xlsx";
const fallbackPath = "C:/Users/Martin/Documents/ferremax_9-1267_REVISION_PREVIA.xlsx";
const filePath = resolve(process.argv[2] || (existsSync(defaultPath) ? defaultPath : fallbackPath));
const supplierName = "Ferremax Quilmes";
const documentNumber = "#9-1267";

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...rest] = trimmed.split("=");

    if (!process.env[key]) {
      process.env[key] = rest.join("=").replace(/^"|"$/g, "");
    }
  }
}

function normalizeProductCode(value) {
  const clean = String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  return /[a-z]/.test(clean) ? clean.toUpperCase() : clean;
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

function parseNumber(value) {
  const raw = String(value ?? "").replace(/\$/g, "").replace(/\s/g, "");

  if (!raw) {
    return null;
  }

  const normalized =
    /^\d{1,3}(\.\d{3})+$/.test(raw)
      ? raw.replace(/\./g, "")
      : raw.includes(",") && raw.includes(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.includes(",")
        ? raw.replace(",", ".")
        : raw;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function readRows(path) {
  if (!existsSync(path)) {
    throw new Error(`No existe el archivo: ${path}`);
  }

  const workbook = XLSX.readFile(path);
  const sheetName = workbook.SheetNames.includes("REVISION_PRODUCTOS")
    ? "REVISION_PRODUCTOS"
    : workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });

  return rows
    .map((row, index) => {
      const quantity = parseNumber(row.stock_inicial ?? row.cantidad);
      const unitCostWithTax = parseNumber(row.costo_con_iva_ars ?? row.precio);
      const lineTotal =
        quantity && unitCostWithTax
          ? quantity * unitCostWithTax
          : parseNumber(row.subtotal_pdf ?? row.total);
      const description = String(row.descripcion ?? row.detalle ?? "").trim();

      if (!description || !quantity) {
        return null;
      }

      return {
        barcode: normalizeProductCode(row.codigo ?? row.barcode ?? ""),
        description,
        lineNumber: index + 2,
        lineTotal,
        normalizedName: normalizeName(row.nombre_normalizado || description),
        quantity,
        sku: normalizeProductCode(row.sku ?? ""),
        supplierSku: normalizeProductCode(row.sku ?? row.codigo ?? ""),
        unitCostWithTax,
        unitCostWithoutTax: parseNumber(row.costo_sin_iva_ars),
      };
    })
    .filter(Boolean);
}

async function loadProducts() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  if (!url || !key || !tenantId) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_DEFAULT_TENANT_ID.");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [{ data: products, error: productsError }, { data: saleUnits }] =
    await Promise.all([
      supabase
        .from("products")
        .select("id,sku,barcode,name,normalized_name,stock_quantity")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .limit(20000),
      supabase
        .from("product_sale_units")
        .select("product_id,barcode")
        .eq("tenant_id", tenantId)
        .eq("active", true)
        .limit(20000),
    ]);

  if (productsError) {
    throw new Error(productsError.message);
  }

  return {
    products: products ?? [],
    saleUnits: saleUnits ?? [],
  };
}

function addOwner(map, code, product) {
  const clean = normalizeProductCode(code);

  if (!clean) {
    return;
  }

  const current = map.get(clean) ?? [];

  if (!current.some((item) => item.id === product.id)) {
    current.push(product);
  }

  map.set(clean, current);
}

function matchRows(rows, data) {
  const productById = new Map(data.products.map((product) => [product.id, product]));
  const byCode = new Map();
  const byName = new Map();

  for (const product of data.products) {
    addOwner(byCode, product.sku, product);
    addOwner(byCode, product.barcode, product);

    const nameKey = normalizeName(product.normalized_name || product.name);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), product]);
  }

  for (const saleUnit of data.saleUnits) {
    const product = productById.get(saleUnit.product_id);

    if (product) {
      addOwner(byCode, saleUnit.barcode, product);
    }
  }

  return rows.map((row) => {
    const codeMatches = [
      ...(row.barcode ? byCode.get(row.barcode) ?? [] : []),
      ...(row.sku ? byCode.get(row.sku) ?? [] : []),
    ].filter((product, index, all) => all.findIndex((item) => item.id === product.id) === index);
    const nameMatches = byName.get(row.normalizedName) ?? [];
    const exact = codeMatches[0] ?? (nameMatches.length === 1 ? nameMatches[0] : null);
    const stockActual = exact ? Number(exact.stock_quantity ?? 0) : 0;
    const status = codeMatches.length > 1 || nameMatches.length > 1
      ? "conflict"
      : exact
        ? "safe"
        : "new";

    return {
      ...row,
      candidate: exact?.sku ?? "",
      projectedStock: stockActual + row.quantity,
      status,
      stockActual,
    };
  });
}

function printTable(rows) {
  const printable = rows.map((row) => ({
    fila: row.lineNumber,
    descripcion: row.description,
    cantidad: row.quantity,
    costo: row.unitCostWithTax,
    total: row.lineTotal,
    candidato: row.candidate || "NUEVO",
    stock_actual: row.stockActual,
    stock_proyectado: row.projectedStock,
    estado: row.status,
  }));

  console.table(printable);

  const summary = rows.reduce(
    (acc, row) => {
      acc.filas += 1;
      acc.unidades += row.quantity;
      acc.total += row.lineTotal ?? row.quantity * (row.unitCostWithTax ?? 0);
      acc[row.status] += 1;
      return acc;
    },
    { conflict: 0, filas: 0, new: 0, safe: 0, total: 0, unidades: 0 }
  );

  console.log(JSON.stringify({
    archivo: basename(filePath),
    proveedor: supplierName,
    comprobante: documentNumber,
    ...summary,
  }, null, 2));
}

const rows = readRows(filePath);
const data = await loadProducts();
const matchedRows = matchRows(rows, data);

printTable(matchedRows);
