"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { normalizeName, parseBoolean } from "@/lib/csv/productos";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type ProductActionState = {
  ok: boolean;
  message: string;
};

type CatalogTable = "brands" | "suppliers";

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

function numberValue(value: string) {
  return Number(value.replace(",", "."));
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
  const currentSku = textValue(formData, "currentSku");
  const nextSku = textValue(formData, "sku");
  const name = textValue(formData, "name");
  const description = textValue(formData, "description");
  const barcode = textValue(formData, "barcode");
  const unit = textValue(formData, "unit") || "unidad";
  const imageFile = formData.get("image");
  let imageUrl = textValue(formData, "currentImageUrl");

  if (!productId || !currentSku || !nextSku || !name) {
    return {
      ok: false,
      message: "Necesitan revisión. Nombre y código son obligatorios.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const [
      costWithoutTax,
      costWithTax,
      taxRate,
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
        barcode: barcode || null,
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
        min_stock: minStock,
        active: parseBoolean(textValue(formData, "active")),
        image_url: imageUrl || null,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", productId)
      .eq("sku", currentSku);

    if (error) {
      return errorState;
    }

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
  const sku = textValue(formData, "sku");
  const barcode = textValue(formData, "barcode");
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
      message: "El SKU o codigo interno es obligatorio.",
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
    const { data: existingSku, error: skuError } = await supabase
      .from("products")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("sku", sku)
      .maybeSingle();

    if (skuError) {
      return {
        ok: false,
        message: "No se pudo revisar si el SKU ya existe.",
      };
    }

    if (existingSku) {
      return {
        ok: false,
        message: "Ya existe un producto con ese SKU en esta ferreteria.",
      };
    }

    const cleanTaxRate = taxRate ?? 0;
    const cleanStockQuantity = stockQuantity ?? 0;
    const cleanMinStock = minStock ?? 0;
    const finalCostWithTax =
      costWithTax ??
      (costWithoutTax === null ? null : costWithoutTax * (1 + cleanTaxRate / 100));
    const { data: product, error: insertError } = await supabase
      .from("products")
      .insert({
        tenant_id: tenant.id,
        sku,
        barcode: barcode || null,
        name,
        normalized_name: normalizeName(name),
        description: description || name,
        brand_id: brandId,
        supplier_id: supplierId,
        unit,
        cost_without_tax: costWithoutTax,
        cost_with_tax: finalCostWithTax,
        sale_price: salePrice,
        tax_rate: cleanTaxRate,
        stock_quantity: cleanStockQuantity,
        min_stock: cleanMinStock,
        active,
      })
      .select("id")
      .single();

    if (insertError || !product) {
      return {
        ok: false,
        message: "No se pudo crear el producto.",
      };
    }

    if (cleanStockQuantity > 0) {
      const { error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          tenant_id: tenant.id,
          product_id: (product as { id: string }).id,
          movement_type: "initial",
          quantity: cleanStockQuantity,
          unit_cost: finalCostWithTax,
          notes: "Stock inicial al crear producto",
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

    return {
      ok: true,
      message: "Producto creado correctamente.",
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

  if (!isUuid(productId)) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const [
      costWithoutTax,
      costWithTax,
      taxRate,
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
    const { data, error } = await supabase
      .from("products")
      .update({
        brand_id: brandId,
        supplier_id: supplierId,
        cost_without_tax: costWithoutTax,
        cost_with_tax: costWithTax,
        tax_rate: taxRate,
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
  const newStock = numberValue(textValue(formData, "newStock"));
  const notes = textValue(formData, "notes") || "Ajuste manual de stock";

  if (!productId) {
    return {
      ok: false,
      message: "No se encontro el producto.",
    };
  }

  if (!Number.isFinite(newStock)) {
    return {
      ok: false,
      message: "Ingresa un stock valido.",
    };
  }

  if (!Number.isInteger(newStock) || newStock < 0) {
    return {
      ok: false,
      message: "El stock debe ser un numero entero, sin coma ni decimales.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
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
