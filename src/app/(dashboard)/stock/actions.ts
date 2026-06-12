"use server";

import { revalidatePath } from "next/cache";

import { createProductAction } from "@/app/(dashboard)/productos/actions";
import { requireUser } from "@/lib/auth/session";
import {
  type ConsolidatedStockCsvRow,
  normalizeStockCode,
  parseStockCsv,
} from "@/lib/csv/stock";
import type { ProductListItem } from "@/components/productos/product-types";
import {
  hasNormalizedProductCode,
  hasRealProductBarcode,
  isInheritedProductBarcode,
  normalizeProductCode,
} from "@/lib/product-code";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";
import {
  initialStockCsvState,
  type StockCsvPreviewRow,
  type StockCsvState,
} from "./stock-csv-utils";

type StockCsvProduct = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  stock_quantity: number;
  active: boolean;
};

type BarcodeProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  normalized_name: string | null;
  description: string | null;
  unit: string;
  cost_without_tax: number | null;
  cost_with_tax: number | null;
  sale_price: number | null;
  tax_rate: number | null;
  profit_margin_percent: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean;
  image_url: string | null;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  brands: { name: string } | null;
  suppliers: { name: string } | null;
};

type BarcodeSaleUnitRow = {
  id: string;
  product_id: string;
  name: string;
  quantity_in_base_unit: number | null;
  sale_price: number | null;
  barcode: string | null;
  is_default: boolean | null;
  active: boolean | null;
};

type CodeLookupRow = {
  active: boolean | null;
  conflict_count: number | null;
  conflict_sources: unknown;
  matched_by: "sku" | "product_barcode" | "sale_unit_barcode" | null;
  product_id: string | null;
  sale_unit_id: string | null;
  status: "found" | "not_found" | "inactive" | "conflict" | string;
  tenant_id: string | null;
};

export type BarcodeLookupResult =
  | {
      ok: true;
      status: "found";
      code: string;
      product: ProductListItem;
      matchedBy: "sku" | "product_barcode" | "sale_unit_barcode";
    }
  | {
      ok: true;
      status: "inactive";
      code: string;
      message: string;
      product?: ProductListItem;
    }
  | {
      ok: false;
      status: "conflict";
      code: string;
      message: string;
      conflictSources?: unknown;
    }
  | {
      ok: true;
      status: "not_found";
      code: string;
      message: string;
    }
  | {
      ok: false;
      status: "error";
      code: string;
      message: string;
    };

export type BarcodeProductSearchResult = {
  ok: boolean;
  message: string;
  products: ProductListItem[];
};

export type BarcodeMutationResult = {
  ok: boolean;
  message: string;
  product?: ProductListItem;
};

function errorState(message: string): StockCsvState {
  return {
    ...initialStockCsvState,
    ok: false,
    title: "Necesita revision",
    message,
  };
}

function mapBarcodeProduct(
  row: BarcodeProductRow,
  saleUnits: ProductListItem["saleUnits"] = []
): ProductListItem {
  const productBarcode = normalizeProductCode(row.barcode);
  const displayCode = productBarcode || row.sku;

  return {
    id: row.id,
    sku: row.sku,
    code: displayCode,
    displayCode,
    barcode: productBarcode,
    productBarcode,
    hasProductBarcode: hasRealProductBarcode({
      barcode: productBarcode,
      sku: row.sku,
    }),
    name: row.name,
    description: row.description ?? row.name,
    category: "",
    categoryId: row.category_id ?? "",
    brand: row.brands?.name ?? "",
    brandId: row.brand_id ?? "",
    supplier: row.suppliers?.name ?? "",
    supplierId: row.supplier_id ?? "",
    unit: row.unit,
    cost: row.cost_with_tax,
    costWithoutTax: row.cost_without_tax,
    costWithTax: row.cost_with_tax,
    taxRate: row.tax_rate ?? 21,
    profitMarginPercent: row.profit_margin_percent ?? 0,
    salePrice: row.sale_price,
    stockQuantity: Number(row.stock_quantity ?? 0),
    minStock: Number(row.min_stock ?? 0),
    active: row.active,
    imageUrl: row.image_url ?? "",
    matchedBy: "text",
    saleUnits,
  };
}

async function loadSaleUnitsByProductId(tenantId: string, productId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select(
      "id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active"
    )
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    throw new Error("No se pudieron cargar las presentaciones.");
  }

  return ((data ?? []) as BarcodeSaleUnitRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    quantityInBaseUnit: Number(row.quantity_in_base_unit ?? 1),
    salePrice: Number(row.sale_price ?? 0),
    barcode: normalizeProductCode(row.barcode),
    isDefault: Boolean(row.is_default),
    active: row.active !== false,
  }));
}

async function loadProductForBarcodePanel(
  tenantId: string,
  productId: string,
  options: { includeInactive?: boolean } = {}
) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("products")
    .select(
      "id,sku,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,profit_margin_percent,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,brands(name),suppliers(name)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", productId);

  if (!options.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as BarcodeProductRow;
  const saleUnits = await loadSaleUnitsByProductId(tenantId, row.id);

  return mapBarcodeProduct(row, saleUnits);
}

function cleanBarcodeCode(value: string) {
  return normalizeStockCode(value);
}

function cleanNameSearch(value: string) {
  return String(value ?? "").trim().replace(/[%_]/g, "");
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function findProductByExactCode(tenantId: string, code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .rpc("find_product_by_code", {
      input_tenant_id: tenantId,
      input_code: code,
    });

  if (error) {
    throw new Error("Falta aplicar la migracion 021 de codigos de producto.");
  }

  return (Array.isArray(data) ? data[0] : data) as CodeLookupRow | null;
}

async function ensureBarcodeIsFree({
  code,
  productId,
  tenantId,
}: {
  code: string;
  productId?: string;
  tenantId: string;
}) {
  const result = await findProductByExactCode(tenantId, code);

  if (!result || result.status === "not_found") {
    return;
  }

  if (
    (result.status === "found" || result.status === "inactive") &&
    result.product_id === productId
  ) {
    return;
  }

  if (result.status === "conflict") {
    throw new Error("Ese codigo esta duplicado en mas de un producto.");
  }

  throw new Error("Ese codigo ya esta usado por otro producto o presentacion.");
}

function stockCsvErrorMessage(message?: string) {
  if (message?.includes("STOCK_CSV_INVALID_ROWS")) {
    return "Hay filas invalidas en la carga.";
  }

  if (message?.includes("STOCK_CSV_PRODUCT_NOT_FOUND")) {
    return "Hay codigos que no corresponden a productos de esta ferreteria.";
  }

  if (message?.includes("STOCK_CSV_PRODUCT_INACTIVE")) {
    return "Hay productos inactivos en la carga.";
  }

  if (message?.includes("STOCK_CSV_AMBIGUOUS_BARCODE")) {
    return "Hay un codigo de barras asociado a mas de un producto.";
  }

  if (message?.includes("Could not find the function")) {
    return "Falta aplicar la migracion de carga rapida de stock.";
  }

  if (message?.includes("function min(uuid) does not exist")) {
    return "Falta aplicar la migracion 019 de carga rapida de stock.";
  }

  return "No se pudo confirmar la carga rapida de stock.";
}

export async function lookupBarcodeStockAction(
  rawCode: string
): Promise<BarcodeLookupResult> {
  const code = cleanBarcodeCode(rawCode);

  if (!code) {
    return {
      ok: false,
      status: "error",
      code,
      message: "Escanea o escribi un codigo.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const result = await findProductByExactCode(tenant.id, code);

    if (!result || result.status === "not_found") {
      return {
        ok: true,
        status: "not_found",
        code,
        message: "No hay producto con ese codigo. Buscalo por nombre para asociarlo.",
      };
    }

    if (result.status === "conflict") {
      return {
        ok: false,
        status: "conflict",
        code,
        message:
          "Ese codigo aparece en mas de un producto. Revisa el diagnostico antes de vender o cargar stock.",
        conflictSources: result.conflict_sources,
      };
    }

    if (result.status === "inactive" && result.product_id) {
      const product = await loadProductForBarcodePanel(
        tenant.id,
        result.product_id,
        { includeInactive: true }
      );

      return {
        ok: true,
        status: "inactive",
        code,
        product: product ?? undefined,
        message:
          "El codigo pertenece a un producto inactivo. No crees otro producto con el mismo codigo.",
      };
    }

    if (result.status === "found" && result.product_id && result.matched_by) {
      const product = await loadProductForBarcodePanel(tenant.id, result.product_id);

      if (product) {
        return {
          ok: true,
          status: "found",
          code,
          product: {
            ...product,
            matchedBy: result.matched_by,
            matchedSaleUnitId: result.sale_unit_id ?? undefined,
          },
          matchedBy: result.matched_by,
        };
      }
    }

    return {
      ok: false,
      status: "error",
      code,
      message: "No se pudo cargar el producto encontrado.",
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        status: "error",
        code,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      status: "error",
      code,
      message:
        error instanceof Error
          ? error.message
          : "No se pudo buscar el codigo.",
    };
  }
}

export async function searchProductsForBarcodeAction(
  rawName: string
): Promise<BarcodeProductSearchResult> {
  const search = cleanNameSearch(rawName);

  if (search.length < 2) {
    return {
      ok: false,
      message: "Escribi al menos 2 letras del producto.",
      products: [],
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,profit_margin_percent,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(
        `name.ilike.%${search}%,normalized_name.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`
      )
      .order("name")
      .limit(8);

    if (error) {
      return {
        ok: false,
        message: "No se pudo buscar productos.",
        products: [],
      };
    }

    const rows = (data ?? []) as unknown as BarcodeProductRow[];
    const products = await Promise.all(
      rows.map(async (row) =>
        mapBarcodeProduct(row, await loadSaleUnitsByProductId(tenant.id, row.id))
      )
    );

    return {
      ok: true,
      message:
        products.length > 0
          ? "Elegi el producto correcto. No crees otro si ya existe."
          : "No encontramos coincidencias.",
      products,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
        products: [],
      };
    }

    return {
      ok: false,
      message: "No se pudo buscar productos.",
      products: [],
    };
  }
}

export async function assignBarcodeToProductAction({
  code: rawCode,
  productId,
}: {
  code: string;
  productId: string;
}): Promise<BarcodeMutationResult> {
  const code = cleanBarcodeCode(rawCode);

  if (!code || !isUuid(productId)) {
    return {
      ok: false,
      message: "Selecciona un producto y un codigo valido.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    await ensureBarcodeIsFree({ code, productId, tenantId: tenant.id });

    const supabase = getSupabaseServerClient();
    const { data: current, error: currentError } = await supabase
      .from("products")
      .select("id,sku,barcode")
      .eq("tenant_id", tenant.id)
      .eq("id", productId)
      .eq("active", true)
      .maybeSingle();

    if (currentError || !current) {
      return {
        ok: false,
        message: "No se encontro el producto para asociar.",
      };
    }

    const currentProduct = current as {
      barcode: string | null;
      sku: string | null;
    };
    const saleUnits = await loadSaleUnitsByProductId(tenant.id, productId);
    const saleUnitWithBarcode = saleUnits.find((unit) =>
      hasNormalizedProductCode(unit.barcode)
    );

    if (saleUnitWithBarcode) {
      return {
        ok: false,
        message: `La presentacion ${saleUnitWithBarcode.name} ya tiene codigo: ${saleUnitWithBarcode.barcode}. Revisalo antes de modificar.`,
      };
    }

    const currentBarcode = normalizeProductCode(currentProduct.barcode);
    const canReplaceInheritedBarcode =
      !currentBarcode ||
      isInheritedProductBarcode({
        barcode: currentProduct.barcode,
        sku: currentProduct.sku,
      });

    if (!canReplaceInheritedBarcode) {
      return {
        ok: false,
        message:
          "Este producto ya tiene otro codigo de barras. Revisalo antes de reemplazarlo.",
      };
    }

    const { error } = await supabase
      .from("products")
      .update({ barcode: code })
      .eq("tenant_id", tenant.id)
      .eq("id", productId);

    if (error) {
      return {
        ok: false,
        message: "No se pudo asociar el codigo.",
      };
    }

    revalidatePath("/stock");
    revalidatePath("/productos");
    revalidatePath("/inicio");

    const product = await loadProductForBarcodePanel(tenant.id, productId);

    return {
      ok: true,
      message: "Codigo asociado correctamente.",
      product: product ?? undefined,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "No se pudo asociar el codigo.",
    };
  }
}

export async function createBarcodeProductAction({
  barcode: rawBarcode,
  name: rawName,
  salePrice: rawSalePrice,
  sku: rawSku,
  stockQuantity: rawStockQuantity,
  unit: rawUnit,
}: {
  barcode: string;
  name: string;
  salePrice?: string;
  sku?: string;
  stockQuantity?: string;
  unit?: string;
}): Promise<BarcodeMutationResult> {
  const barcode = cleanBarcodeCode(rawBarcode);
  const name = String(rawName ?? "").trim();
  const sku = cleanBarcodeCode(rawSku || barcode);
  const unit = String(rawUnit ?? "").trim() || "unidad";
  const salePriceText = String(rawSalePrice ?? "").trim().replace(",", ".");
  const stockQuantityText = String(rawStockQuantity ?? "0").trim().replace(",", ".");
  const salePrice = salePriceText ? Number(salePriceText) : null;
  const stockQuantity = stockQuantityText ? Number(stockQuantityText) : 0;

  if (!barcode || !name || !sku) {
    return {
      ok: false,
      message: "Nombre, codigo interno y codigo de barras son obligatorios.",
    };
  }

  if (
    (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0)) ||
    !Number.isFinite(stockQuantity) ||
    stockQuantity < 0
  ) {
    return {
      ok: false,
      message: "Revisa precio y cantidad. Deben ser numeros validos.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const formData = new FormData();

    formData.set("name", name);
    formData.set("sku", sku);
    formData.set("barcode", barcode);
    formData.set("description", name);
    formData.set("unit", unit);
    formData.set("taxRate", "21");
    formData.set("profitMarginPercent", "0");
    formData.set("stockQuantity", String(stockQuantity));
    formData.set("minStock", "0");
    formData.set("active", "true");

    if (salePrice !== null) {
      formData.set("salePrice", String(salePrice));
    }

    formData.set(
      "saleUnits",
      JSON.stringify([
        {
          id: "",
          name: "Unidad",
          quantityInBaseUnit: 1,
          salePrice: salePrice ?? 0,
          barcode: "",
          isDefault: true,
          active: true,
        },
      ])
    );

    const created = await createProductAction({ ok: false, message: "" }, formData);

    if (!created.ok || !created.productId) {
      return {
        ok: false,
        message: created.message || "No se pudo crear el producto.",
      };
    }

    const createdProduct = await loadProductForBarcodePanel(
      tenant.id,
      created.productId
    );

    return {
      ok: true,
      message: created.message,
      product: createdProduct ?? undefined,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "No se pudo crear el producto.",
    };
  }
}

async function readCsvFile(formData: FormData) {
  const file = formData.get("csvFile");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, message: "Selecciona un archivo CSV." };
  }

  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { ok: false as const, message: "El archivo debe ser .csv." };
  }

  return {
    ok: true as const,
    fileName: file.name,
    text: await file.text(),
  };
}

async function loadProductsByCodes(tenantId: string, codes: string[]) {
  const supabase = getSupabaseServerClient();
  const uniqueCodes = new Set(codes.map(normalizeStockCode));
  const bySku = new Map<string, StockCsvProduct>();
  const byBarcode = new Map<string, StockCsvProduct[]>();

  if (uniqueCodes.size === 0) {
    return { bySku, byBarcode };
  }

  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,barcode,name,stock_quantity,active")
      .eq("tenant_id", tenantId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudieron buscar los productos.");
    }

    const products = (data ?? []) as StockCsvProduct[];

    for (const product of products) {
      const normalizedSku = normalizeStockCode(product.sku);

      if (uniqueCodes.has(normalizedSku)) {
        bySku.set(normalizedSku, product);
      }

      if (!product.barcode) {
        continue;
      }

      const normalizedBarcode = normalizeStockCode(product.barcode);

      if (!uniqueCodes.has(normalizedBarcode)) {
        continue;
      }

      const current = byBarcode.get(normalizedBarcode) ?? [];
      current.push(product);
      byBarcode.set(normalizedBarcode, current);
    }

    if (products.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { bySku, byBarcode };
}

function buildPreviewRows({
  rows,
  bySku,
  byBarcode,
}: {
  rows: ConsolidatedStockCsvRow[];
  bySku: Map<string, StockCsvProduct>;
  byBarcode: Map<string, StockCsvProduct[]>;
}) {
  return rows.map<StockCsvPreviewRow>((row) => {
    const normalizedCode = normalizeStockCode(row.codigo);
    const skuProduct = bySku.get(normalizedCode);
    const barcodeMatches = byBarcode.get(normalizedCode) ?? [];
    const product =
      skuProduct ?? (barcodeMatches.length === 1 ? barcodeMatches[0] : null);

    if (!product && barcodeMatches.length > 1) {
      return {
        codigo: row.codigo,
        cantidad: row.cantidad,
        sourceRows: row.sourceRows,
        productId: null,
        productName: "",
        stockActual: null,
        stockFinal: null,
        status: "error",
        message: "Codigo de barras duplicado en productos.",
      };
    }

    if (!product) {
      return {
        codigo: row.codigo,
        cantidad: row.cantidad,
        sourceRows: row.sourceRows,
        productId: null,
        productName: "",
        stockActual: null,
        stockFinal: null,
        status: "error",
        message: "Producto no encontrado.",
      };
    }

    if (!product.active) {
      return {
        codigo: row.codigo,
        cantidad: row.cantidad,
        sourceRows: row.sourceRows,
        productId: product.id,
        productName: product.name,
        stockActual: Number(product.stock_quantity ?? 0),
        stockFinal: null,
        status: "error",
        message: "Producto inactivo.",
      };
    }

    const stockActual = Number(product.stock_quantity ?? 0);

    return {
      codigo: row.codigo,
      cantidad: row.cantidad,
      sourceRows: row.sourceRows,
      productId: product.id,
      productName: product.name,
      stockActual,
      stockFinal: stockActual + row.cantidad,
      status: "ok",
      message: "Listo para sumar.",
    };
  });
}

export async function previewStockCsvAction(
  _previousState: StockCsvState,
  formData: FormData
): Promise<StockCsvState> {
  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const fileResult = await readCsvFile(formData);

    if (!fileResult.ok) {
      return errorState(fileResult.message);
    }

    const parsed = parseStockCsv(fileResult.text);

    if (parsed.missingHeaders.length > 0) {
      return errorState(
        `Faltan columnas necesarias: ${parsed.missingHeaders.join(", ")}.`
      );
    }

    const invalidRows = parsed.rows
      .filter((row) => row.errors.length > 0)
      .map((row) => ({
        rowNumber: row.rowNumber,
        codigo: row.codigo,
        cantidad: row.cantidadText,
        message: row.errors.join(" "),
      }));

    const { bySku, byBarcode } = await loadProductsByCodes(
      tenant.id,
      parsed.consolidatedRows.map((row) => row.codigo)
    );
    const previewRows = buildPreviewRows({
      rows: parsed.consolidatedRows,
      bySku,
      byBarcode,
    });
    const summary = {
      updatedProducts: previewRows.filter((row) => row.status === "ok").length,
      notFound: previewRows.filter((row) => row.status === "error").length,
      invalidRows: invalidRows.length,
      totalQuantity: previewRows
        .filter((row) => row.status === "ok")
        .reduce((sum, row) => sum + row.cantidad, 0),
    };
    const canConfirm =
      summary.updatedProducts > 0 &&
      summary.notFound === 0 &&
      summary.invalidRows === 0;

    return {
      ok: canConfirm,
      title: "Vista previa lista",
      message: canConfirm
        ? "Revisa la vista previa y confirma para sumar stock."
        : "Corregi las filas observadas antes de confirmar.",
      fileName: fileResult.fileName,
      previewRows,
      invalidRows,
      summary,
      confirmPayload: canConfirm
        ? JSON.stringify(
            previewRows.map((row) => ({
              codigo: row.codigo,
              cantidad: row.cantidad,
            }))
          )
        : "",
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return errorState(FORBIDDEN_ACTION_MESSAGE);
    }

    return errorState(
      error instanceof Error
        ? error.message
        : "No se pudo preparar la vista previa."
    );
  }
}

function parseConfirmRows(value: string) {
  const rows = JSON.parse(value) as { codigo?: unknown; cantidad?: unknown }[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No hay productos para confirmar.");
  }

  return rows.map((row) => {
    const codigo = normalizeStockCode(String(row.codigo ?? ""));
    const cantidad = Number(row.cantidad);

    if (!codigo || !Number.isFinite(cantidad) || cantidad <= 0) {
      throw new Error("Hay filas invalidas en la confirmacion.");
    }

    return { codigo, cantidad };
  });
}

export async function confirmStockCsvAction(
  _previousState: StockCsvState,
  formData: FormData
): Promise<StockCsvState> {
  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin", "seller"]),
      requireUser(),
    ]);
    const fileName = String(formData.get("fileName") ?? "stock.csv").trim();
    const rows = parseConfirmRows(String(formData.get("rows") ?? ""));
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("bulk_add_stock_csv", {
      input_tenant_id: tenant.id,
      input_user_id: user.id,
      input_source_name: fileName || "stock.csv",
      input_rows: rows,
    });

    if (error) {
      return errorState(stockCsvErrorMessage(error.message));
    }

    const result = Array.isArray(data) ? data[0] : data;
    const updatedProducts = Number(result?.updated_products ?? rows.length);
    const totalQuantity = Number(
      result?.total_quantity ??
        rows.reduce((sum, row) => sum + Number(row.cantidad), 0)
    );

    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ...initialStockCsvState,
      ok: true,
      title: "Carga confirmada",
      message: "Stock actualizado correctamente.",
      fileName,
      summary: {
        updatedProducts,
        notFound: 0,
        invalidRows: 0,
        totalQuantity,
      },
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return errorState(FORBIDDEN_ACTION_MESSAGE);
    }

    return errorState(
      error instanceof Error ? error.message : "No se pudo confirmar la carga."
    );
  }
}
