"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { requireUser } from "@/lib/auth/session";
import { normalizeName, parseBoolean } from "@/lib/csv/productos";
import { normalizeProductCode } from "@/lib/product-code";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type ProductActionState = {
  ok: boolean;
  message: string;
  barcode?: string;
  customCode?: string;
  productId?: string;
  sku?: string;
  stockQuantity?: number;
};

export type CatalogCreateState = {
  ok: boolean;
  message: string;
  id?: string;
  name?: string;
};

type CatalogTable = "brands" | "suppliers";

type SaleUnitInput = {
  id?: string;
  name: string;
  quantityInBaseUnit: number;
  salePrice: number;
  barcode: string;
  isDefault: boolean;
  active: boolean;
};

const errorState = {
  ok: false,
  message: "Necesitan revisión. No se pudo guardar el producto.",
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const clean = textValue(formData, key);
  return clean || null;
}

function codeValue(formData: FormData, key: string) {
  return normalizeProductCode(String(formData.get(key) ?? ""));
}

function optionalCodeValue(formData: FormData, key: string) {
  const clean = codeValue(formData, key);
  return clean || null;
}

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

function parseSaleUnitsInput(formData: FormData, fallbackSalePrice: number | null) {
  const raw = textValue(formData, "saleUnits");
  const fallback = fallbackSalePrice ?? 0;

  if (!raw) {
    return [
      {
        name: "Unidad",
        quantityInBaseUnit: 1,
        salePrice: fallback,
        barcode: "",
        isDefault: true,
        active: true,
      },
    ] satisfies SaleUnitInput[];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Presentaciones de venta invalidas.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Presentaciones de venta invalidas.");
  }

  const units = parsed
    .map((item): SaleUnitInput => {
      const record = item as Record<string, unknown>;
      const id = String(record.id ?? "").trim();
      const name = String(record.name ?? "").trim();
      const quantityInBaseUnit = numberValue(
        String(record.quantityInBaseUnit ?? "1")
      );
      const salePrice = numberValue(String(record.salePrice ?? fallback));
      const barcode = normalizeProductCode(String(record.barcode ?? ""));

      return {
        id: id || undefined,
        name,
        quantityInBaseUnit,
        salePrice:
          !id &&
          name.toLowerCase() === "unidad" &&
          quantityInBaseUnit === 1 &&
          salePrice === 0 &&
          fallback > 0
            ? fallback
            : salePrice,
        barcode,
        isDefault: Boolean(record.isDefault),
        active: record.active !== false,
      };
    })
    .filter((unit) => unit.active || unit.id);

  if (units.length === 0 || units.every((unit) => !unit.active)) {
    throw new Error("Agrega al menos una presentacion activa.");
  }

  for (const unit of units) {
    if (!unit.name) {
      throw new Error("Cada presentacion necesita nombre.");
    }

    if (!Number.isFinite(unit.quantityInBaseUnit) || unit.quantityInBaseUnit <= 0) {
      throw new Error("La cantidad que descuenta debe ser mayor a 0.");
    }

    if (!Number.isFinite(unit.salePrice) || unit.salePrice < 0) {
      throw new Error("El precio de cada presentacion debe ser mayor o igual a 0.");
    }
  }

  const activeUnits = units.filter((unit) => unit.active);
  const defaultIndex = activeUnits.findIndex((unit) => unit.isDefault);

  if (defaultIndex === -1) {
    activeUnits[0].isDefault = true;
  }

  let defaultAssigned = false;

  for (const unit of units) {
    if (!unit.active) {
      unit.isDefault = false;
      continue;
    }

    if (unit.isDefault && !defaultAssigned) {
      defaultAssigned = true;
      continue;
    }

    unit.isDefault = false;
  }

  return units;
}

async function syncDefaultSaleUnitPrice({
  productId,
  salePrice,
  tenantId,
}: {
  productId: string;
  salePrice: number | null;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const existingResult = await supabase
    .from("product_sale_units")
    .select("id,name,quantity_in_base_unit,is_default,active")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);

  if (existingResult.error) {
    throw new Error("No se pudieron revisar las presentaciones.");
  }

  type ExistingSaleUnit = {
    id: string;
    name: string;
    quantity_in_base_unit: number | null;
    is_default: boolean | null;
    active: boolean | null;
  };

  const units = (existingResult.data ?? []) as ExistingSaleUnit[];
  const defaultUnit = units.find((unit) => unit.active !== false && unit.is_default);
  const internalUnit = units.find(
    (unit) =>
      unit.active !== false &&
      unit.name.trim().toLowerCase() === "unidad"
  );
  const inactiveInternalUnit = units.find(
    (unit) =>
      unit.active === false &&
      unit.name.trim().toLowerCase() === "unidad"
  );
  const targetUnit = defaultUnit ?? internalUnit ?? inactiveInternalUnit;
  const normalizedSalePrice = salePrice ?? 0;

  if (!targetUnit) {
    const { error } = await supabase.from("product_sale_units").insert({
      tenant_id: tenantId,
      product_id: productId,
      name: "Unidad",
      quantity_in_base_unit: 1,
      sale_price: normalizedSalePrice,
      barcode: null,
      is_default: true,
      active: true,
    });

    if (error) {
      throw new Error("No se pudo crear la presentacion interna del producto.");
    }

    const { error: activeUnitsError } = await supabase
      .from("product_sale_units")
      .update({ sale_price: normalizedSalePrice })
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .eq("active", true);

    if (activeUnitsError) {
      throw new Error("No se pudieron sincronizar los precios internos del producto.");
    }
    return;
  }

  if (!defaultUnit) {
    const { error: resetError } = await supabase
      .from("product_sale_units")
      .update({ is_default: false })
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .neq("id", targetUnit.id);

    if (resetError) {
      throw new Error("No se pudo actualizar la presentacion predeterminada.");
    }
  }

  const { error } = await supabase
    .from("product_sale_units")
    .update({
      sale_price: normalizedSalePrice,
      is_default: true,
      active: true,
    })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("id", targetUnit.id);

  if (error) {
    throw new Error("No se pudo sincronizar el precio interno del producto.");
  }

  const { error: activeUnitsError } = await supabase
    .from("product_sale_units")
    .update({ sale_price: normalizedSalePrice })
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .eq("active", true);

  if (activeUnitsError) {
    throw new Error("No se pudieron sincronizar los precios internos del producto.");
  }
}

async function syncProductSaleUnits({
  productId,
  saleUnits,
  tenantId,
}: {
  productId: string;
  saleUnits: SaleUnitInput[];
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const existingResult = await supabase
    .from("product_sale_units")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);

  if (existingResult.error) {
    throw new Error("No se pudieron revisar las presentaciones.");
  }

  const existingIds = new Set(
    ((existingResult.data ?? []) as { id: string }[]).map((item) => item.id)
  );
  const incomingIds = new Set(
    saleUnits.map((unit) => unit.id).filter((id): id is string => Boolean(id))
  );
  const idsToDeactivate = [...existingIds].filter((id) => !incomingIds.has(id));

  if (idsToDeactivate.length > 0) {
    const { error } = await supabase
      .from("product_sale_units")
      .update({ active: false, is_default: false })
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .in("id", idsToDeactivate);

    if (error) {
      throw new Error("No se pudieron desactivar presentaciones anteriores.");
    }
  }

  const defaultUnit = saleUnits.find((unit) => unit.active && unit.isDefault);

  if (defaultUnit?.id) {
    const { error } = await supabase
      .from("product_sale_units")
      .update({ is_default: false })
      .eq("tenant_id", tenantId)
      .eq("product_id", productId)
      .neq("id", defaultUnit.id);

    if (error) {
      throw new Error("No se pudo actualizar la presentacion predeterminada.");
    }
  } else {
    const { error } = await supabase
      .from("product_sale_units")
      .update({ is_default: false })
      .eq("tenant_id", tenantId)
      .eq("product_id", productId);

    if (error) {
      throw new Error("No se pudo actualizar la presentacion predeterminada.");
    }
  }

  for (const unit of saleUnits) {
    const payload = {
      tenant_id: tenantId,
      product_id: productId,
      name: unit.name,
      quantity_in_base_unit: unit.quantityInBaseUnit,
      sale_price: unit.salePrice,
      barcode: unit.barcode || null,
      is_default: unit.isDefault,
      active: unit.active,
    };
    const { error } = unit.id
      ? await supabase
          .from("product_sale_units")
          .update(payload)
          .eq("tenant_id", tenantId)
          .eq("product_id", productId)
          .eq("id", unit.id)
      : await supabase.from("product_sale_units").insert(payload);

    if (error) {
      throw new Error("No se pudieron guardar las presentaciones.");
    }
  }
}

type CodeLookupRow = {
  status?: string | null;
  product_id?: string | null;
  conflict_count?: number | null;
};

async function resolveProductCustomCode({
  customCode,
  tenantId,
}: {
  customCode: string | null;
  tenantId: string;
}) {
  if (customCode) {
    return customCode;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("next_product_custom_code", {
    input_tenant_id: tenantId,
  });

  if (error || !data) {
    throw new Error("No se pudo generar el codigo propio.");
  }

  return String(data);
}

async function ensureProductCodesAvailable({
  barcode,
  customCode,
  productId,
  saleUnits,
  sku,
  tenantId,
}: {
  barcode?: string | null;
  customCode?: string | null;
  productId: string;
  saleUnits: SaleUnitInput[];
  sku?: string | null;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const activeSaleUnitCodes = saleUnits
    .filter((unit) => unit.active)
    .map((unit) => unit.barcode)
    .filter(Boolean);
  const repeatedSaleUnitCodes = activeSaleUnitCodes.filter(
    (code, index) => activeSaleUnitCodes.indexOf(code) !== index
  );

  if (repeatedSaleUnitCodes.length > 0) {
    throw new Error("Hay presentaciones con el mismo codigo de barras.");
  }

  const codes = [
    { code: normalizeProductCode(sku ?? ""), label: "El codigo de catalogo" },
    { code: normalizeProductCode(customCode ?? ""), label: "El codigo propio" },
    { code: normalizeProductCode(barcode ?? ""), label: "El codigo de barras" },
    ...activeSaleUnitCodes.map((code) => ({
      code,
      label: "Un codigo de presentacion",
    })),
  ].filter((item) => item.code);

  const uniqueCodes = [...new Map(codes.map((item) => [item.code, item])).values()];

  for (const item of uniqueCodes) {
    const { data, error } = await supabase.rpc("find_product_by_code", {
      input_tenant_id: tenantId,
      input_code: item.code,
    });

    if (error) {
      throw new Error("Falta aplicar la migracion 021 de codigos de producto.");
    }

    const result = (Array.isArray(data) ? data[0] : data) as CodeLookupRow | null;

    if (!result || result.status === "not_found") {
      continue;
    }

    if (
      (result.status === "found" || result.status === "inactive") &&
      result.product_id === productId
    ) {
      continue;
    }

    if (result.status === "conflict") {
      throw new Error(`${item.label} esta duplicado en mas de un producto.`);
    }

    throw new Error(`${item.label} ya esta usado por otro producto.`);
  }
}

function nonNegativeNumberValue({
  fieldName,
  label,
  nullable = false,
  fallback,
  formData,
}: {
  fieldName: string;
  label: string;
  nullable?: boolean;
  fallback?: number;
  formData: FormData;
}) {
  const text = textValue(formData, fieldName);

  if (!text && nullable) {
    return null;
  }

  if (!text && typeof fallback === "number") {
    return fallback;
  }

  const value = numberValue(text);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} debe ser un numero mayor o igual a 0.`);
  }

  return value;
}

function stockErrorMessage(message?: string) {
  if (message?.includes("STOCK_NOTE_REQUIRED")) {
    return "Escribi un motivo para ajustar el stock.";
  }

  if (message?.includes("PRODUCT_NOT_FOUND")) {
    return "No se encontro el producto para la ferreteria actual. Recarga Productos y proba de nuevo.";
  }

  if (message?.includes("Could not find the function")) {
    return "Falta aplicar la migracion 006 de stock en Supabase.";
  }

  return "No se pudo ajustar el stock. Revisa la conexion y las migraciones.";
}

function createProductErrorMessage(message?: string) {
  const cleanMessage = String(message ?? "");
  const normalizedMessage = cleanMessage.toLowerCase();

  if (cleanMessage.includes("PRODUCT_NAME_REQUIRED")) {
    return "El nombre es obligatorio.";
  }

  if (cleanMessage.includes("PRODUCT_SKU_REQUIRED")) {
    return "El codigo de catalogo es obligatorio.";
  }

  if (
    cleanMessage.includes("PRODUCT_SKU_CONFLICT") ||
    normalizedMessage.includes("products_tenant_id_sku_key") ||
    normalizedMessage.includes("products_tenant_id_sku")
  ) {
    return "Ya existe un producto con ese codigo de catalogo.";
  }

  if (cleanMessage.includes("PRODUCT_BARCODE_CONFLICT")) {
    return "Ya existe un producto con ese codigo de barras.";
  }

  if (cleanMessage.includes("PRODUCT_CUSTOM_CODE_CONFLICT")) {
    return "Ya existe un producto con ese codigo propio.";
  }

  if (cleanMessage.includes("PRODUCT_SALE_UNIT_BARCODE_DUPLICATE")) {
    return "Hay presentaciones con el mismo codigo de barras.";
  }

  if (
    cleanMessage.includes("PRODUCT_SALE_UNIT_BARCODE_CONFLICT") ||
    normalizedMessage.includes("product_sale_units") &&
      normalizedMessage.includes("barcode")
  ) {
    return "Un codigo de presentacion ya esta usado por otro producto.";
  }

  if (
    normalizedMessage.includes("product_sale_units_tenant_product_name_unique")
  ) {
    return "Hay presentaciones de venta con el mismo nombre.";
  }

  if (cleanMessage.includes("PRODUCT_BRAND_INVALID")) {
    return "La marca no pertenece a esta ferreteria.";
  }

  if (cleanMessage.includes("PRODUCT_SUPPLIER_INVALID")) {
    return "El proveedor no pertenece a esta ferreteria.";
  }

  if (cleanMessage.includes("PRODUCT_NUMERIC_INVALID")) {
    return "Revisa precios y stock. No pueden ser negativos.";
  }

  if (cleanMessage.includes("PRODUCT_SALE_UNITS_INVALID")) {
    return "Revisa las presentaciones de venta.";
  }

  if (
    cleanMessage.includes("TENANT_FORBIDDEN") ||
    normalizedMessage.includes("permission denied") ||
    normalizedMessage.includes("not authorized")
  ) {
    return FORBIDDEN_ACTION_MESSAGE;
  }

  if (cleanMessage.includes("Could not find the function")) {
    return "Falta aplicar la migracion 021 de stock y codigos.";
  }

  if (cleanMessage && !normalizedMessage.includes("duplicate key value")) {
    return `No se pudo crear el producto. ${cleanMessage}`;
  }

  return "No se pudo crear el producto.";
}

async function validateTenantCatalogId({
  fieldName,
  label,
  table,
  tenantId,
}: {
  fieldName: string;
  label: string;
  table: CatalogTable;
  tenantId: string;
}) {
  const id = fieldName.trim();

  if (!id) {
    return null;
  }

  if (!isUuid(id)) {
    throw new Error(`${label} no es valido.`);
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`${label} no pertenece a esta ferreteria.`);
  }

  return id;
}

export async function createBrandAction(
  _previousState: CatalogCreateState,
  formData: FormData
): Promise<CatalogCreateState> {
  const name = textValue(formData, "name");

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre de la marca.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .insert({
        tenant_id: tenant.id,
        name,
        active: true,
      })
      .select("id,name")
      .single();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo crear la marca. Revisa si ya existe.",
      };
    }

    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Marca creada.",
      id: (data as { id: string; name: string }).id,
      name: (data as { id: string; name: string }).name,
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message: "No se pudo crear la marca.",
    };
  }
}

export async function createSupplierAction(
  _previousState: CatalogCreateState,
  formData: FormData
): Promise<CatalogCreateState> {
  const name = textValue(formData, "name");

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre del proveedor.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        tenant_id: tenant.id,
        name,
        phone: optionalText(formData, "phone"),
        email: optionalText(formData, "email"),
        address: optionalText(formData, "address"),
        notes: optionalText(formData, "notes"),
      })
      .select("id,name")
      .single();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo crear el proveedor. Revisa si ya existe.",
      };
    }

    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Proveedor creado.",
      id: (data as { id: string; name: string }).id,
      name: (data as { id: string; name: string }).name,
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message: "No se pudo crear el proveedor.",
    };
  }
}

async function uploadProductImage({
  tenantId,
  productId,
  file,
}: {
  tenantId: string;
  productId: string;
  file: File;
}) {
  const supabase = getSupabaseServerClient();
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("La foto debe ser JPG, PNG o WebP.");
  }

  const { error: bucketError } = await supabase.storage.createBucket("product-images", {
    public: true,
    allowedMimeTypes: allowedTypes,
  });

  if (bucketError && !bucketError.message.toLowerCase().includes("already")) {
    throw new Error("No se pudo preparar el espacio para fotos.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${tenantId}/products/${productId}/foto.${extension}`;
  const { error } = await supabase.storage
    .from("product-images")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

  if (error) {
    throw new Error("No se pudo subir la foto del producto.");
  }

  const { data } = supabase.storage.from("product-images").getPublicUrl(path);

  return data.publicUrl;
}

export async function updateProductAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const productId = textValue(formData, "productId");
  const nextSku = codeValue(formData, "sku");
  const requestedCustomCode = optionalCodeValue(formData, "customCode");
  const name = textValue(formData, "name");
  const description = textValue(formData, "description");
  const barcode = optionalCodeValue(formData, "barcode");
  const unit = textValue(formData, "unit") || "unidad";
  const imageFile = formData.get("image");
  let imageUrl = textValue(formData, "currentImageUrl");

  if (!productId || !nextSku || !name) {
    return {
      ok: false,
      message: "Necesitan revision. Nombre y codigo de catalogo son obligatorios.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const customCode = await resolveProductCustomCode({
      customCode: requestedCustomCode,
      tenantId: tenant.id,
    });
    const [
      costWithoutTax,
      costWithTax,
      taxRate,
      profitMarginPercent,
      salePrice,
      minStock,
    ] = [
      nonNegativeNumberValue({
        fieldName: "costWithoutTax",
        label: "Costo sin IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "cost",
        label: "Costo con IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "taxRate",
        label: "IVA",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "profitMarginPercent",
        label: "Utilidad",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "salePrice",
        label: "Precio de venta",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "minStock",
        label: "Stock minimo",
        fallback: 0,
        formData,
      }),
    ];
    await ensureProductCodesAvailable({
      barcode,
      customCode,
      productId,
      saleUnits: [],
      sku: nextSku,
      tenantId: tenant.id,
    });
    const [brandId, supplierId] = await Promise.all([
      validateTenantCatalogId({
        fieldName: textValue(formData, "brandId"),
        label: "La marca",
        table: "brands",
        tenantId: tenant.id,
      }),
      validateTenantCatalogId({
        fieldName: textValue(formData, "supplierId"),
        label: "El proveedor",
        table: "suppliers",
        tenantId: tenant.id,
      }),
    ]);

    if (imageFile instanceof File && imageFile.size > 0) {
      imageUrl = await uploadProductImage({
        tenantId: tenant.id,
        productId,
        file: imageFile,
      });
    }

    const { error } = await supabase
      .from("products")
      .update({
        sku: nextSku,
        custom_code: customCode,
        barcode,
        name,
        description: description || name,
        normalized_name: normalizeName(name),
        brand_id: brandId,
        supplier_id: supplierId,
        unit,
        cost_without_tax: costWithoutTax,
        cost_with_tax: costWithTax,
        sale_price: salePrice,
        tax_rate: taxRate,
        profit_margin_percent: profitMarginPercent,
        min_stock: minStock,
        active: parseBoolean(textValue(formData, "active")),
        image_url: imageUrl || null,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", productId);

    if (error) {
      return errorState;
    }

    await syncDefaultSaleUnitPrice({
      productId,
      salePrice,
      tenantId: tenant.id,
    });

    revalidatePath("/productos");
    revalidatePath("/stock");

    return {
      ok: true,
      message: "Producto guardado.",
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
        error instanceof Error ? `Necesitan revisión. ${error.message}` : errorState.message,
    };
  }
}

export async function createProductAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const name = textValue(formData, "name");
  const sku = codeValue(formData, "sku");
  const customCode = optionalCodeValue(formData, "customCode");
  const barcode = optionalCodeValue(formData, "barcode");
  const description = textValue(formData, "description");
  const unit = textValue(formData, "unit") || "unidad";
  const active = textValue(formData, "active") === "true";

  if (!name) {
    return {
      ok: false,
      message: "El nombre es obligatorio.",
    };
  }

  if (!sku) {
    return {
      ok: false,
      message: "El codigo de catalogo es obligatorio.",
    };
  }

  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"]),
      requireUser(),
    ]);
    const supabase = getSupabaseServerClient();
    const [
      brandId,
      supplierId,
      costWithoutTax,
      costWithTax,
      taxRate,
      profitMarginPercent,
      salePrice,
      stockQuantity,
      minStock,
    ] = await Promise.all([
      validateTenantCatalogId({
        fieldName: textValue(formData, "brandId"),
        label: "La marca",
        table: "brands",
        tenantId: tenant.id,
      }),
      validateTenantCatalogId({
        fieldName: textValue(formData, "supplierId"),
        label: "El proveedor",
        table: "suppliers",
        tenantId: tenant.id,
      }),
      nonNegativeNumberValue({
        fieldName: "costWithoutTax",
        label: "Costo sin IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "costWithTax",
        label: "Costo con IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "taxRate",
        label: "IVA",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "profitMarginPercent",
        label: "Utilidad",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "salePrice",
        label: "Precio venta",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "stockQuantity",
        label: "Stock inicial",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "minStock",
        label: "Stock minimo",
        fallback: 0,
        formData,
      }),
    ]);
    const cleanTaxRate = taxRate ?? 0;
    const cleanProfitMarginPercent = profitMarginPercent ?? 0;
    const cleanStockQuantity = stockQuantity ?? 0;
    const cleanMinStock = minStock ?? 0;
    const finalCostWithTax =
      costWithTax ??
      (costWithoutTax === null ? null : costWithoutTax * (1 + cleanTaxRate / 100));
    const saleUnits = parseSaleUnitsInput(new FormData(), salePrice);
    const { data: productId, error } = await supabase.rpc("create_product_atomic", {
      input_active: active,
      input_barcode: barcode,
      input_brand_id: brandId,
      input_cost_with_tax: finalCostWithTax,
      input_cost_without_tax: costWithoutTax,
      input_custom_code: customCode,
      input_description: description || name,
      input_min_stock: cleanMinStock,
      input_name: name,
      input_normalized_name: normalizeName(name),
      input_profit_margin_percent: cleanProfitMarginPercent,
      input_sale_price: salePrice,
      input_sale_units: saleUnits.map((unit) => ({
        name: unit.name,
        quantityInBaseUnit: unit.quantityInBaseUnit,
        salePrice: unit.salePrice,
        barcode: unit.barcode,
        isDefault: unit.isDefault,
        active: unit.active,
      })),
      input_sku: sku,
      input_stock_quantity: cleanStockQuantity,
      input_supplier_id: supplierId,
      input_tax_rate: cleanTaxRate,
      input_tenant_id: tenant.id,
      input_unit: unit,
      input_user_id: user.id,
    });

    if (error || !productId) {
      const errorMessage = [
        error?.message,
        error?.details,
        error?.hint,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ok: false,
        message: createProductErrorMessage(errorMessage),
      };
    }

    revalidatePath("/stock");
    revalidatePath("/productos");
    revalidatePath("/inicio");

    return {
      ok: true,
      message:
        cleanStockQuantity > 0
          ? "Producto creado correctamente."
          : "Producto creado correctamente. Tiene stock 0 y puede verse con el filtro Todos.",
      barcode: barcode ?? undefined,
      customCode: customCode ?? undefined,
      productId: String(productId),
      sku: sku ?? undefined,
      stockQuantity: cleanStockQuantity,
    };
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

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

export async function updateProductPriceAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const productId = textValue(formData, "productId");
  const salePrice = numberValue(textValue(formData, "salePrice"));

  if (!isUuid(productId)) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  if (!Number.isFinite(salePrice) || salePrice < 0) {
    return {
      ok: false,
      message: "Ingresa un precio valido.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .update({ sale_price: salePrice })
      .eq("tenant_id", tenant.id)
      .eq("id", productId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo actualizar el precio.",
      };
    }

    await syncDefaultSaleUnitPrice({
      productId,
      salePrice,
      tenantId: tenant.id,
    });

    revalidatePath("/productos");
    revalidatePath("/stock");

    return {
      ok: true,
      message: "Precio actualizado correctamente.",
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
      message: "No se pudo actualizar el precio.",
    };
  }
}

export async function updateProductStockCommercialAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const productId = textValue(formData, "productId");
  const name = textValue(formData, "name");
  const requestedCustomCode = optionalCodeValue(formData, "customCode");

  if (!isUuid(productId)) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  if (!name) {
    return {
      ok: false,
      message: "El nombre es obligatorio.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const customCode = await resolveProductCustomCode({
      customCode: requestedCustomCode,
      tenantId: tenant.id,
    });
    const [
      costWithoutTax,
      costWithTax,
      taxRate,
      profitMarginPercent,
      salePrice,
      minStock,
    ] = [
      nonNegativeNumberValue({
        fieldName: "costWithoutTax",
        label: "Costo sin IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "costWithTax",
        label: "Costo con IVA",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "taxRate",
        label: "IVA",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "profitMarginPercent",
        label: "Utilidad",
        fallback: 0,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "salePrice",
        label: "Precio de venta",
        nullable: true,
        formData,
      }),
      nonNegativeNumberValue({
        fieldName: "minStock",
        label: "Stock minimo",
        fallback: 0,
        formData,
      }),
    ];
    const saleUnits = parseSaleUnitsInput(formData, salePrice).map((unit) => ({
      ...unit,
      salePrice: salePrice ?? 0,
    }));
    const supabase = getSupabaseServerClient();
    const [brandId, supplierId] = await Promise.all([
      validateTenantCatalogId({
        fieldName: textValue(formData, "brandId"),
        label: "La marca",
        table: "brands",
        tenantId: tenant.id,
      }),
      validateTenantCatalogId({
        fieldName: textValue(formData, "supplierId"),
        label: "El proveedor",
        table: "suppliers",
        tenantId: tenant.id,
      }),
    ]);
    await ensureProductCodesAvailable({
      customCode,
      productId,
      saleUnits,
      tenantId: tenant.id,
    });
    const { data, error } = await supabase
      .from("products")
      .update({
        brand_id: brandId,
        custom_code: customCode,
        name,
        normalized_name: normalizeName(name),
        supplier_id: supplierId,
        cost_without_tax: costWithoutTax,
        cost_with_tax: costWithTax,
        tax_rate: taxRate,
        profit_margin_percent: profitMarginPercent,
        sale_price: salePrice,
        min_stock: minStock,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", productId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo guardar la gestion del producto.",
      };
    }

    await syncProductSaleUnits({
      productId,
      saleUnits,
      tenantId: tenant.id,
    });

    revalidatePath("/productos");
    revalidatePath("/stock");
    revalidatePath(`/productos/${productId}/stock`);

    return {
      ok: true,
      message: "Datos del producto actualizados.",
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
        error instanceof Error
          ? error.message
          : "No se pudo guardar la gestion del producto.",
    };
  }
}

export async function deactivateProductAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const productId = textValue(formData, "productId");

  if (!isUuid(productId)) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  try {
    await requireUser();
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("id", productId)
      .maybeSingle();

    if (productError) {
      return {
        ok: false,
        message: "No se pudo validar el producto.",
      };
    }

    if (!product) {
      return {
        ok: false,
        message: "El producto no existe para esta ferreteria.",
      };
    }

    const { error } = await supabase
      .from("products")
      .update({
        active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenant.id)
      .eq("id", productId);

    if (error) {
      return {
        ok: false,
        message: "No se pudo eliminar el producto.",
      };
    }

    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Producto eliminado. El historial se conserva.",
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
      message: "No se pudo eliminar el producto.",
    };
  }
}

export async function adjustProductStockAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const productId = textValue(formData, "productId");
  const addStockQuantityText = textValue(formData, "addStockQuantity");
  const stockLoadSaleUnitId = textValue(formData, "stockLoadSaleUnitId");
  const newStockText = textValue(formData, "newStock");
  let newStock = numberValue(newStockText);
  const notes = textValue(formData, "notes") || "Ajuste manual de stock";

  if (!productId) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  if (!addStockQuantityText && !Number.isFinite(newStock)) {
    return {
      ok: false,
      message: "Ingresa un stock valido.",
    };
  }

  if (!addStockQuantityText && newStock < 0) {
    return {
      ok: false,
      message: "El stock debe ser un numero mayor o igual a 0.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();

    if (addStockQuantityText) {
      const addStockQuantity = numberValue(addStockQuantityText);

      if (!Number.isFinite(addStockQuantity) || addStockQuantity <= 0) {
        return {
          ok: false,
          message: "Ingresa una cantidad de carga valida.",
        };
      }

      const productResult = await supabase
        .from("products")
        .select("id,stock_quantity")
        .eq("tenant_id", tenant.id)
        .eq("id", productId)
        .maybeSingle();

      if (productResult.error || !productResult.data) {
        return {
          ok: false,
          message: "No se encontro el producto para ajustar stock.",
        };
      }

      let quantityInBaseUnit = 1;

      if (stockLoadSaleUnitId) {
        const saleUnitResult = await supabase
          .from("product_sale_units")
          .select("quantity_in_base_unit")
          .eq("tenant_id", tenant.id)
          .eq("product_id", productId)
          .eq("id", stockLoadSaleUnitId)
          .eq("active", true)
          .maybeSingle();

        if (saleUnitResult.error || !saleUnitResult.data) {
          return {
            ok: false,
            message: "No se encontro la presentacion de carga.",
          };
        }

        quantityInBaseUnit = Number(
          (saleUnitResult.data as { quantity_in_base_unit: number | null })
            .quantity_in_base_unit ?? 1
        );
      }

      newStock =
        Number((productResult.data as { stock_quantity: number | null }).stock_quantity ?? 0) +
        addStockQuantity * quantityInBaseUnit;
    }

    const { error } = await supabase.rpc("adjust_product_stock", {
      input_product_id: productId,
      input_tenant_id: tenant.id,
      input_new_stock: newStock,
      input_notes: notes,
    });

    if (error) {
      return {
        ok: false,
        message: stockErrorMessage(error.message),
      };
    }

    revalidatePath("/productos");
    revalidatePath("/stock");
    revalidatePath(`/productos/${productId}/stock`);

    return {
      ok: true,
      message: "Stock actualizado correctamente. Se registro el movimiento.",
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
      message: "No se pudo ajustar el stock.",
    };
  }
}
