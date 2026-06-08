"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { normalizeName } from "@/lib/csv/productos";
import {
  type ConsolidatedStockCsvRow,
  normalizeStockCode,
  parseStockCsv,
} from "@/lib/csv/stock";
import type { ProductListItem } from "@/components/productos/product-types";
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
  return {
    id: row.id,
    sku: row.sku,
    code: row.barcode ?? row.sku,
    barcode: row.barcode ?? "",
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
    barcode: row.barcode ?? "",
    isDefault: Boolean(row.is_default),
    active: row.active !== false,
  }));
}

async function loadProductForBarcodePanel(tenantId: string, productId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,sku,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,profit_margin_percent,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,brands(name),suppliers(name)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

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

async function findProductBarcodeOwner(tenantId: string, code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("barcode", code)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo revisar si el codigo ya existe.");
  }

  return (data as { id: string } | null)?.id ?? null;
}

async function findProductSkuOwner(tenantId: string, code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("sku", code)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo revisar si el codigo interno ya existe.");
  }

  return (data as { id: string } | null)?.id ?? null;
}

async function findSaleUnitBarcodeOwner(tenantId: string, code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select("product_id")
    .eq("tenant_id", tenantId)
    .eq("barcode", code)
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo revisar las presentaciones.");
  }

  return (data as { product_id: string } | null)?.product_id ?? null;
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
  const [productOwnerId, saleUnitOwnerId] = await Promise.all([
    findProductBarcodeOwner(tenantId, code),
    findSaleUnitBarcodeOwner(tenantId, code),
  ]);
  const skuOwnerId = await findProductSkuOwner(tenantId, code);

  if (productOwnerId && productOwnerId !== productId) {
    throw new Error("Ese codigo de barras ya esta usado por otro producto.");
  }

  if (skuOwnerId && skuOwnerId !== productId) {
    throw new Error("Ese codigo ya esta usado como codigo interno de otro producto.");
  }

  if (saleUnitOwnerId && saleUnitOwnerId !== productId) {
    throw new Error("Ese codigo de barras ya esta usado en otra presentacion.");
  }
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
    const supabase = getSupabaseServerClient();
    const saleUnitResult = await supabase
      .from("product_sale_units")
      .select("product_id")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .ilike("barcode", code)
      .limit(1)
      .maybeSingle();

    if (!saleUnitResult.error && saleUnitResult.data) {
      const product = await loadProductForBarcodePanel(
        tenant.id,
        (saleUnitResult.data as { product_id: string }).product_id
      );

      if (product) {
        return {
          ok: true,
          status: "found",
          code,
          product,
          matchedBy: "sale_unit_barcode",
        };
      }
    }

    const productResult = await supabase
      .from("products")
      .select("id,sku,barcode")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(`sku.ilike.${code},barcode.ilike.${code}`)
      .limit(1)
      .maybeSingle();

    if (!productResult.error && productResult.data) {
      const row = productResult.data as {
        id: string;
        sku: string;
        barcode: string | null;
      };
      const product = await loadProductForBarcodePanel(tenant.id, row.id);

      if (product) {
        return {
          ok: true,
          status: "found",
          code,
          product,
          matchedBy:
            normalizeStockCode(row.barcode ?? "") === code
              ? "product_barcode"
              : "sku",
        };
      }
    }

    return {
      ok: true,
      status: "not_found",
      code,
      message: "No hay producto con ese codigo. Buscalo por nombre para asociarlo.",
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
      .select("id,barcode")
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

    if ((current as { barcode: string | null }).barcode) {
      return {
        ok: false,
        message: "Ese producto ya tiene codigo de barras.",
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
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"]),
      requireUser(),
    ]);
    const supabase = getSupabaseServerClient();
    const normalizedProductName = normalizeName(name);

    await ensureBarcodeIsFree({ code: barcode, tenantId: tenant.id });

    const { data: existingName, error: nameError } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("normalized_name", normalizedProductName)
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (nameError) {
      return {
        ok: false,
        message: "No se pudo revisar si el producto ya existe.",
      };
    }

    if (existingName) {
      return {
        ok: false,
        message:
          "Ya existe un producto con ese nombre. Buscalo y asociale el codigo.",
      };
    }

    const { data: existingSku, error: skuError } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("sku", sku)
      .maybeSingle();

    if (skuError) {
      return {
        ok: false,
        message: "No se pudo revisar si el codigo interno ya existe.",
      };
    }

    if (existingSku) {
      return {
        ok: false,
        message: "Ya existe un producto con ese codigo interno.",
      };
    }

    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        tenant_id: tenant.id,
        sku,
        barcode,
        name,
        normalized_name: normalizedProductName,
        description: name,
        unit,
        sale_price: salePrice,
        tax_rate: 21,
        profit_margin_percent: 0,
        stock_quantity: stockQuantity,
        min_stock: 0,
        active: true,
      })
      .select("id")
      .single();

    if (insertError || !product) {
      return {
        ok: false,
        message: "No se pudo crear el producto.",
      };
    }

    const productId = (product as { id: string }).id;
    const { error: saleUnitError } = await supabase
      .from("product_sale_units")
      .insert({
        tenant_id: tenant.id,
        product_id: productId,
        name: "Unidad",
        quantity_in_base_unit: 1,
        sale_price: salePrice ?? 0,
        barcode: null,
        is_default: true,
        active: true,
      });

    if (saleUnitError) {
      return {
        ok: false,
        message: "Producto creado, pero no se pudo crear la presentacion.",
      };
    }

    if (stockQuantity > 0) {
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          tenant_id: tenant.id,
          product_id: productId,
          movement_type: "initial",
          quantity: stockQuantity,
          unit_cost: null,
          notes: "Stock inicial desde codigo de barras",
          created_by: user.id,
        });

      if (movementError) {
        return {
          ok: false,
          message:
            "Producto creado, pero no se pudo registrar el movimiento inicial.",
        };
      }
    }

    revalidatePath("/stock");
    revalidatePath("/productos");
    revalidatePath("/inicio");

    const createdProduct = await loadProductForBarcodePanel(tenant.id, productId);

    return {
      ok: true,
      message: "Producto creado correctamente.",
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
