"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import {
  buildPurchaseConfirmItems,
  buildPurchaseImportPreview,
  readPurchaseImportFile,
  type ExistingProductSupplier,
  type ExistingPurchaseProduct,
  type ExistingPurchaseSaleUnit,
  type PurchaseImportPreview,
  type PurchaseImportRow,
} from "@/lib/purchases/import";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type PurchaseImportState = {
  ok: boolean;
  message: string;
  preview: PurchaseImportPreview | null;
  receiptId?: string;
};

const emptyState: PurchaseImportState = {
  ok: false,
  message: "",
  preview: null,
};

function errorState(message: string): PurchaseImportState {
  return {
    ...emptyState,
    message,
  };
}

async function loadMatchingData(tenantId: string, supplierName: string) {
  const supabase = getSupabaseServerClient();
  const [supplierResult, productsResult, saleUnitsResult, productSuppliersResult] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id,name")
        .eq("tenant_id", tenantId)
        .ilike("name", supplierName)
        .maybeSingle(),
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
      supabase
        .from("product_suppliers")
        .select("product_id,supplier_id,supplier_sku,normalized_supplier_sku")
        .eq("tenant_id", tenantId)
        .limit(20000),
    ]);

  if (productsResult.error) {
    throw new Error("No se pudieron leer productos para matchear.");
  }

  if (saleUnitsResult.error) {
    throw new Error("No se pudieron leer presentaciones para matchear.");
  }

  if (
    productSuppliersResult.error &&
    !productSuppliersResult.error.message.includes("product_suppliers")
  ) {
    throw new Error("No se pudieron leer codigos de proveedor.");
  }

  return {
    products: (productsResult.data ?? []) as ExistingPurchaseProduct[],
    productSuppliers: (productSuppliersResult.data ??
      []) as ExistingProductSupplier[],
    saleUnits: (saleUnitsResult.data ?? []) as ExistingPurchaseSaleUnit[],
    supplierId: supplierResult.data
      ? (supplierResult.data as { id: string }).id
      : undefined,
  };
}

function formText(formData: FormData, key: string, fallback = "") {
  return String(formData.get(key) ?? fallback).trim();
}

export async function previewPurchaseImportAction(
  _previousState: PurchaseImportState,
  formData: FormData
): Promise<PurchaseImportState> {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const file = formData.get("purchaseFile");
    const supplierName = formText(formData, "supplierName", "Ferremax Quilmes");
    const documentNumber = formText(formData, "documentNumber", "#9-1267");

    if (!(file instanceof File) || file.size === 0) {
      return errorState("Selecciona un archivo CSV, XLS o XLSX.");
    }

    if (!supplierName || !documentNumber) {
      return errorState("Proveedor y comprobante son obligatorios.");
    }

    const parsed = await readPurchaseImportFile(file);

    if (parsed.rows.length === 0) {
      return errorState("No se detectaron filas de compra validas.");
    }

    const preview = buildPurchaseImportPreview({
      documentNumber,
      fileName: parsed.fileName,
      matchingData: await loadMatchingData(tenant.id, supplierName),
      rows: parsed.rows,
      supplierName,
    });

    return {
      ok: true,
      message: "Vista previa generada. No se modifico stock.",
      preview,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return errorState("No tenes permiso para importar compras.");
    }

    return errorState(
      error instanceof Error
        ? error.message
        : "No se pudo preparar la compra."
    );
  }
}

function parseRowsPayload(value: string) {
  const rows = JSON.parse(value) as PurchaseImportRow[];

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("No hay filas revisadas para confirmar.");
  }

  return rows;
}

export async function confirmPurchaseImportAction(
  _previousState: PurchaseImportState,
  formData: FormData
): Promise<PurchaseImportState> {
  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"]),
      requireUser(),
    ]);
    const supplierName = formText(formData, "supplierName");
    const documentNumber = formText(formData, "documentNumber");
    const fileName = formText(formData, "fileName", "compra.xlsx");
    const rows = parseRowsPayload(String(formData.get("rows") ?? "[]"));
    const unresolved = rows.filter(
      (row) => row.status === "conflict" || row.decision === "choose_other"
    );

    if (!supplierName || !documentNumber) {
      return errorState("Proveedor y comprobante son obligatorios.");
    }

    if (unresolved.length > 0) {
      return errorState("No se puede confirmar con filas dudosas o en conflicto.");
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("confirm_reviewed_purchase_import", {
      input_document_number: documentNumber,
      input_items: buildPurchaseConfirmItems(rows),
      input_source_name: fileName,
      input_supplier_name: supplierName,
      input_tenant_id: tenant.id,
      input_user_id: user.id,
    });

    if (error || !data) {
      return errorState(
        error?.message?.includes("Could not find the function")
          ? "Falta aplicar la migracion 022_supplier_purchases.sql."
          : "No se pudo confirmar la compra."
      );
    }

    revalidatePath("/stock");
    revalidatePath("/productos");
    revalidatePath("/compras/importar");

    return {
      ok: true,
      message: "Compra confirmada y stock actualizado.",
      preview: null,
      receiptId: String(data),
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return errorState("No tenes permiso para confirmar compras.");
    }

    return errorState(
      error instanceof Error
        ? error.message
        : "No se pudo confirmar la compra."
    );
  }
}
