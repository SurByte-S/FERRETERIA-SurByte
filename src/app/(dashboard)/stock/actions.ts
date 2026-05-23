"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import {
  type ConsolidatedStockCsvRow,
  parseStockCsv,
} from "@/lib/csv/stock";
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
};

function errorState(message: string): StockCsvState {
  return {
    ...initialStockCsvState,
    ok: false,
    title: "Necesita revision",
    message,
  };
}

function stockCsvErrorMessage(message?: string) {
  if (message?.includes("STOCK_CSV_INVALID_ROWS")) {
    return "Hay filas invalidas en la carga.";
  }

  if (message?.includes("STOCK_CSV_PRODUCT_NOT_FOUND")) {
    return "Hay codigos que no corresponden a productos de esta ferreteria.";
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
  const uniqueCodes = Array.from(new Set(codes));
  const bySku = new Map<string, StockCsvProduct>();
  const byBarcode = new Map<string, StockCsvProduct[]>();

  if (uniqueCodes.length === 0) {
    return { bySku, byBarcode };
  }

  const [skuResult, barcodeResult] = await Promise.all([
    supabase
      .from("products")
      .select("id,sku,barcode,name,stock_quantity")
      .eq("tenant_id", tenantId)
      .in("sku", uniqueCodes),
    supabase
      .from("products")
      .select("id,sku,barcode,name,stock_quantity")
      .eq("tenant_id", tenantId)
      .in("barcode", uniqueCodes),
  ]);

  if (skuResult.error || barcodeResult.error) {
    throw new Error("No se pudieron buscar los productos.");
  }

  for (const product of (skuResult.data ?? []) as StockCsvProduct[]) {
    bySku.set(product.sku, product);
  }

  for (const product of (barcodeResult.data ?? []) as StockCsvProduct[]) {
    if (!product.barcode) {
      continue;
    }

    const current = byBarcode.get(product.barcode) ?? [];
    current.push(product);
    byBarcode.set(product.barcode, current);
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
    const skuProduct = bySku.get(row.codigo);
    const barcodeMatches = byBarcode.get(row.codigo) ?? [];
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
    const codigo = String(row.codigo ?? "").trim();
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
