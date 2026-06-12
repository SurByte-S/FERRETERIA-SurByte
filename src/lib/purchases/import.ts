import * as XLSX from "xlsx";

import { normalizeName, parseCsv } from "@/lib/csv/productos";
import { normalizeProductCode } from "@/lib/product-code";

export type PurchaseImportDecision =
  | "match_existing"
  | "create_new"
  | "choose_other"
  | "ignore";

export type PurchaseImportMatchMethod =
  | "supplier_sku"
  | "barcode"
  | "sku"
  | "name"
  | "suggestion"
  | "none";

export type PurchaseImportRow = {
  barcode: string;
  candidateProductId: string;
  candidateSku: string;
  candidateStock: number;
  decision: PurchaseImportDecision;
  description: string;
  lineNumber: number;
  lineTotal: number | null;
  matchConfidence: number;
  matchMethod: PurchaseImportMatchMethod;
  messages: string[];
  normalizedName: string;
  projectedStock: number | null;
  quantity: number;
  sku: string;
  status: "safe" | "new" | "doubtful" | "conflict" | "ignored";
  supplierSku: string;
  unitCostWithTax: number | null;
  unitCostWithoutTax: number | null;
};

export type PurchaseImportSummary = {
  safe: number;
  new: number;
  doubtful: number;
  conflicts: number;
  ignored: number;
  totalAmount: number;
  totalRows: number;
  totalUnits: number;
};

export type PurchaseImportPreview = {
  canConfirm: boolean;
  documentNumber: string;
  fileName: string;
  rows: PurchaseImportRow[];
  supplierName: string;
  summary: PurchaseImportSummary;
};

export type ExistingPurchaseProduct = {
  barcode: string | null;
  id: string;
  name: string;
  normalized_name: string | null;
  sku: string;
  stock_quantity: number | null;
};

export type ExistingPurchaseSaleUnit = {
  barcode: string | null;
  product_id: string;
};

export type ExistingProductSupplier = {
  normalized_supplier_sku: string | null;
  product_id: string;
  supplier_id: string;
  supplier_sku: string | null;
};

export type PurchaseMatchingData = {
  products: ExistingPurchaseProduct[];
  productSuppliers: ExistingProductSupplier[];
  saleUnits: ExistingPurchaseSaleUnit[];
  supplierId?: string;
};

type ParsedPurchaseRow = {
  barcode: string;
  description: string;
  lineNumber: number;
  lineTotal: number | null;
  quantity: number;
  sku: string;
  supplierSku: string;
  unitCostWithTax: number | null;
  unitCostWithoutTax: number | null;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const headerAliases = {
  barcode: ["barcode", "codigo de barras", "cod barras", "ean", "gtin", "barras"],
  description: [
    "descripcion",
    "descripción",
    "detalle",
    "producto",
    "articulo",
    "artículo",
    "nombre",
  ],
  lineTotal: ["total", "importe", "subtotal", "subtotal_pdf", "neto total", "total linea"],
  quantity: ["cantidad", "cant", "unidades", "qty", "bultos", "stock_inicial"],
  sku: ["sku", "codigo interno", "código interno", "codigo", "código"],
  supplierSku: [
    "codigo proveedor",
    "código proveedor",
    "cod proveedor",
    "cod",
    "referencia",
    "articulo proveedor",
  ],
  unitCostWithTax: [
    "costo",
    "precio",
    "precio unitario",
    "unitario",
    "costo con iva",
    "costo_con_iva_ars",
    "precio_publico_ars",
    "precio c/iva",
  ],
  unitCostWithoutTax: [
    "costo sin iva",
    "costo_sin_iva_ars",
    "precio sin iva",
    "neto unitario",
    "unitario sin iva",
  ],
} as const;

function cleanHeader(value: string) {
  return normalizeName(value).toLowerCase();
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

export function parsePurchaseNumber(value: unknown) {
  const raw = textValue(value)
    .replace(/\$/g, "")
    .replace(/\s/g, "");

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

function pickField(row: Record<string, string>, aliases: readonly string[]) {
  const normalizedAliases = aliases.map(cleanHeader);

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.includes(cleanHeader(key))) {
      return value;
    }
  }

  return "";
}

function rowHasPurchaseShape(row: Record<string, string>) {
  return Boolean(
    pickField(row, headerAliases.description) &&
      (pickField(row, headerAliases.quantity) ||
        pickField(row, headerAliases.unitCostWithTax) ||
        pickField(row, headerAliases.lineTotal))
  );
}

function normalizeRawRows(rows: Record<string, string>[]) {
  return rows
    .map((values, index) => ({
      lineNumber: index + 2,
      values,
    }))
    .filter((row) => rowHasPurchaseShape(row.values));
}

function parsePurchaseRows(rows: { lineNumber: number; values: Record<string, string> }[]) {
  return rows
    .map<ParsedPurchaseRow | null>((row) => {
      const description = pickField(row.values, headerAliases.description);
      const quantity = parsePurchaseNumber(pickField(row.values, headerAliases.quantity));
      const lineTotal = parsePurchaseNumber(pickField(row.values, headerAliases.lineTotal));
      const unitCostWithTax = parsePurchaseNumber(
        pickField(row.values, headerAliases.unitCostWithTax)
      );
      const unitCostWithoutTax = parsePurchaseNumber(
        pickField(row.values, headerAliases.unitCostWithoutTax)
      );
      const finalUnitCostWithTax =
        unitCostWithTax ?? (lineTotal !== null && quantity ? lineTotal / quantity : null);

      if (!description || !quantity || quantity <= 0) {
        return null;
      }

      return {
        barcode: normalizeProductCode(pickField(row.values, headerAliases.barcode)),
        description,
        lineNumber: row.lineNumber,
        lineTotal:
          finalUnitCostWithTax === null ? lineTotal : finalUnitCostWithTax * quantity,
        quantity,
        sku: normalizeProductCode(pickField(row.values, headerAliases.sku)),
        supplierSku: normalizeProductCode(
          pickField(row.values, headerAliases.supplierSku) ||
            pickField(row.values, headerAliases.sku)
        ),
        unitCostWithTax: finalUnitCostWithTax,
        unitCostWithoutTax,
      };
    })
    .filter((row): row is ParsedPurchaseRow => Boolean(row));
}

export async function readPurchaseImportFile(file: File) {
  const lowerName = file.name.toLowerCase();

  if (file.size > MAX_FILE_BYTES) {
    throw new Error("El archivo supera 5 MB.");
  }

  if (lowerName.endsWith(".csv")) {
    return {
      fileName: file.name,
      rows: parsePurchaseRows(normalizeRawRows(parseCsv(await file.text()))),
    };
  }

  if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".xls")) {
    throw new Error("El archivo debe ser CSV, XLS o XLSX.");
  }

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    type: "buffer",
  });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("El Excel no tiene hojas.");
  }

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    const parsedRows = parsePurchaseRows(
      normalizeRawRows(
        rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [
              key.trim(),
              textValue(value),
            ])
          )
        )
      )
    );

    if (parsedRows.length > 0) {
      return {
        fileName: file.name,
        rows: parsedRows,
      };
    }
  }

  return {
    fileName: file.name,
    rows: [],
  };
}

function addCodeOwner(
  map: Map<string, ExistingPurchaseProduct[]>,
  code: string | null | undefined,
  product: ExistingPurchaseProduct
) {
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

function measurementTokens(value: string) {
  const normalized = normalizeName(value).toLowerCase();
  const tokens = new Set<string>();
  const pattern = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|kg|g|lt|l|ml|w|v|a|pulg|")/g;
  let match = pattern.exec(normalized);

  while (match) {
    tokens.add(`${match[1].replace(",", ".")}${match[2]}`);
    match = pattern.exec(normalized);
  }

  return tokens;
}

function tokenScore(first: string, second: string) {
  const firstTokens = new Set(normalizeName(first).toLowerCase().split(/\s+/).filter(Boolean));
  const secondTokens = new Set(normalizeName(second).toLowerCase().split(/\s+/).filter(Boolean));

  if (firstTokens.size === 0 || secondTokens.size === 0) {
    return 0;
  }

  const shared = [...firstTokens].filter((token) => secondTokens.has(token)).length;

  return Math.round((shared / Math.max(firstTokens.size, secondTokens.size)) * 100);
}

function measurementsCompatible(input: string, candidate: string) {
  const inputMeasures = measurementTokens(input);
  const candidateMeasures = measurementTokens(candidate);

  if (inputMeasures.size === 0 || candidateMeasures.size === 0) {
    return true;
  }

  return [...inputMeasures].every((token) => candidateMeasures.has(token));
}

function mapProduct(product: ExistingPurchaseProduct) {
  return {
    candidateProductId: product.id,
    candidateSku: product.sku,
    candidateStock: Number(product.stock_quantity ?? 0),
    projectedStock: Number(product.stock_quantity ?? 0),
  };
}

export function buildPurchaseImportPreview({
  documentNumber,
  fileName,
  matchingData,
  rows,
  supplierName,
}: {
  documentNumber: string;
  fileName: string;
  matchingData: PurchaseMatchingData;
  rows: ParsedPurchaseRow[];
  supplierName: string;
}): PurchaseImportPreview {
  const productById = new Map(matchingData.products.map((product) => [product.id, product]));
  const byCode = new Map<string, ExistingPurchaseProduct[]>();
  const byName = new Map<string, ExistingPurchaseProduct[]>();
  const bySupplierSku = new Map<string, ExistingPurchaseProduct[]>();

  for (const product of matchingData.products) {
    addCodeOwner(byCode, product.sku, product);
    addCodeOwner(byCode, product.barcode, product);

    const normalized = normalizeName(product.normalized_name || product.name);
    const current = byName.get(normalized) ?? [];
    current.push(product);
    byName.set(normalized, current);
  }

  for (const saleUnit of matchingData.saleUnits) {
    const product = productById.get(saleUnit.product_id);

    if (product) {
      addCodeOwner(byCode, saleUnit.barcode, product);
    }
  }

  for (const relation of matchingData.productSuppliers) {
    if (matchingData.supplierId && relation.supplier_id !== matchingData.supplierId) {
      continue;
    }

    const product = productById.get(relation.product_id);
    const clean = normalizeProductCode(
      relation.normalized_supplier_sku || relation.supplier_sku
    );

    if (!product || !clean) {
      continue;
    }

    const current = bySupplierSku.get(clean) ?? [];
    current.push(product);
    bySupplierSku.set(clean, current);
  }

  const previewRows = rows.map<PurchaseImportRow>((row) => {
    const messages: string[] = [];
    const normalizedName = normalizeName(row.description);
    const supplierMatches = row.supplierSku
      ? bySupplierSku.get(row.supplierSku) ?? []
      : [];
    const barcodeMatches = row.barcode ? byCode.get(row.barcode) ?? [] : [];
    const skuMatches = row.sku ? byCode.get(row.sku) ?? [] : [];
    const nameMatches = byName.get(normalizedName) ?? [];

    let product: ExistingPurchaseProduct | undefined;
    let matchMethod: PurchaseImportMatchMethod = "none";
    let matchConfidence = 0;

    if (supplierMatches.length === 1) {
      product = supplierMatches[0];
      matchMethod = "supplier_sku";
      matchConfidence = 100;
    } else if (barcodeMatches.length === 1) {
      product = barcodeMatches[0];
      matchMethod = "barcode";
      matchConfidence = 98;
    } else if (skuMatches.length === 1) {
      product = skuMatches[0];
      matchMethod = "sku";
      matchConfidence = 95;
    } else if (nameMatches.length === 1) {
      product = nameMatches[0];
      matchMethod = "name";
      matchConfidence = 90;
    } else {
      const suggestions = matchingData.products
        .filter((candidate) => measurementsCompatible(row.description, candidate.name))
        .map((candidate) => ({
          product: candidate,
          score: tokenScore(row.description, candidate.name),
        }))
        .filter((candidate) => candidate.score >= 55)
        .sort((first, second) => second.score - first.score);

      if (suggestions[0]) {
        product = suggestions[0].product;
        matchMethod = "suggestion";
        matchConfidence = suggestions[0].score;
      }
    }

    const conflictingSources = [supplierMatches, barcodeMatches, skuMatches, nameMatches]
      .filter((matches) => matches.length > 1)
      .flat();

    if (conflictingSources.length > 1) {
      messages.push("Hay mas de un candidato exacto.");
    }

    if (!row.unitCostWithTax && !row.unitCostWithoutTax && !row.lineTotal) {
      messages.push("Falta costo para confirmar.");
    }

    const base = product ? mapProduct(product) : null;
    const status: PurchaseImportRow["status"] =
      messages.length > 0
        ? "conflict"
        : product && matchMethod !== "suggestion"
          ? "safe"
          : product
            ? "doubtful"
            : "new";
    const decision: PurchaseImportDecision =
      status === "safe"
        ? "match_existing"
        : status === "new"
          ? "create_new"
          : status === "conflict"
            ? "ignore"
            : "choose_other";

    return {
      barcode: row.barcode,
      candidateProductId: base?.candidateProductId ?? "",
      candidateSku: base?.candidateSku ?? "",
      candidateStock: base?.candidateStock ?? 0,
      decision,
      description: row.description,
      lineNumber: row.lineNumber,
      lineTotal: row.lineTotal,
      matchConfidence,
      matchMethod,
      messages,
      normalizedName,
      projectedStock:
        base === null ? row.quantity : base.candidateStock + row.quantity,
      quantity: row.quantity,
      sku: row.sku || row.supplierSku,
      status,
      supplierSku: row.supplierSku,
      unitCostWithTax: row.unitCostWithTax,
      unitCostWithoutTax: row.unitCostWithoutTax,
    };
  });

  const summary = previewRows.reduce<PurchaseImportSummary>(
    (acc, row) => {
      acc.totalRows += 1;
      acc.totalUnits += row.quantity;
      acc.totalAmount += row.lineTotal ?? row.quantity * (row.unitCostWithTax ?? 0);

      if (row.status === "safe") acc.safe += 1;
      if (row.status === "new") acc.new += 1;
      if (row.status === "doubtful") acc.doubtful += 1;
      if (row.status === "conflict") acc.conflicts += 1;
      if (row.status === "ignored") acc.ignored += 1;

      return acc;
    },
    {
      safe: 0,
      new: 0,
      doubtful: 0,
      conflicts: 0,
      ignored: 0,
      totalAmount: 0,
      totalRows: 0,
      totalUnits: 0,
    }
  );

  return {
    canConfirm:
      previewRows.length > 0 &&
      previewRows.every((row) => row.status !== "conflict" && row.decision !== "choose_other"),
    documentNumber,
    fileName,
    rows: previewRows,
    supplierName,
    summary,
  };
}

export function buildPurchaseConfirmItems(rows: PurchaseImportRow[]) {
  return rows
    .filter((row) => row.decision !== "ignore")
    .map((row) => ({
      barcode: row.barcode || null,
      decision: row.decision,
      description: row.description,
      line_number: row.lineNumber,
      line_total: row.lineTotal,
      normalized_name: row.normalizedName,
      product_id: row.candidateProductId || null,
      quantity: row.quantity,
      sku: row.sku || row.supplierSku,
      supplier_sku: row.supplierSku || null,
      unit_cost_with_tax: row.unitCostWithTax,
      unit_cost_without_tax: row.unitCostWithoutTax,
    }));
}
