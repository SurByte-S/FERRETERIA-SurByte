"use server";

import { revalidatePath } from "next/cache";

import { normalizeName, parseBoolean, parseNullableNumber } from "@/lib/csv/productos";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

export type ProductActionState = {
  ok: boolean;
  message: string;
};

const errorState = {
  ok: false,
  message: "Necesitan revisión. No se pudo guardar el producto.",
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function stockErrorMessage(message?: string) {
  if (message?.includes("STOCK_NOTE_REQUIRED")) {
    return "Escribi un motivo para ajustar el stock.";
  }

  if (message?.includes("PRODUCT_NOT_FOUND")) {
    return "No se encontro el producto.";
  }

  return "No se pudo ajustar el stock.";
}

function safePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function ensureBrand(tenantId: string, name: string) {
  if (!name) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from("brands")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .maybeSingle();

  if (existingError) {
    throw new Error("No se pudo revisar la marca.");
  }

  if (existing) {
    return (existing as { id: string }).id;
  }

  const { data: created, error: createError } = await supabase
    .from("brands")
    .insert({ tenant_id: tenantId, name, active: true })
    .select("id")
    .single();

  if (createError) {
    throw new Error("No se pudo crear la marca.");
  }

  return (created as { id: string }).id;
}

async function uploadProductImage({
  tenantId,
  sku,
  file,
}: {
  tenantId: string;
  sku: string;
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
  const path = `${tenantId}/${safePathPart(sku)}/foto.${extension}`;
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
  const tenant = getCurrentTenant();
  const currentSku = textValue(formData, "currentSku");
  const nextSku = textValue(formData, "sku");
  const name = textValue(formData, "name");
  const barcode = textValue(formData, "barcode");
  const unit = textValue(formData, "unit") || "unidad";
  const categoryId = textValue(formData, "categoryId");
  const brandName = textValue(formData, "brand");
  const imageFile = formData.get("image");
  let imageUrl = textValue(formData, "currentImageUrl");

  if (!currentSku || !nextSku || !name) {
    return {
      ok: false,
      message: "Necesitan revisión. Nombre y código son obligatorios.",
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const brandId = await ensureBrand(tenant.id, brandName);

    if (imageFile instanceof File && imageFile.size > 0) {
      imageUrl = await uploadProductImage({
        tenantId: tenant.id,
        sku: nextSku,
        file: imageFile,
      });
    }

    const { error } = await supabase
      .from("products")
      .update({
        sku: nextSku,
        barcode: barcode || null,
        name,
        description: name,
        normalized_name: normalizeName(name),
        category_id: categoryId || null,
        brand_id: brandId,
        unit,
        cost_with_tax: parseNullableNumber(textValue(formData, "cost")),
        sale_price: parseNullableNumber(textValue(formData, "salePrice")),
        min_stock: parseNullableNumber(textValue(formData, "minStock")) ?? 0,
        active: parseBoolean(textValue(formData, "active")),
        image_url: imageUrl || null,
      })
      .eq("tenant_id", tenant.id)
      .eq("sku", currentSku);

    if (error) {
      return errorState;
    }

    revalidatePath("/productos");

    return {
      ok: true,
      message: "Producto guardado.",
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? `Necesitan revisión. ${error.message}` : errorState.message,
    };
  }
}

export async function adjustProductStockAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const tenant = getCurrentTenant();
  const productId = textValue(formData, "productId");
  const newStock = Number(textValue(formData, "newStock"));
  const notes = textValue(formData, "notes");

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

  if (!notes) {
    return {
      ok: false,
      message: "Escribi un motivo para ajustar el stock.",
    };
  }

  try {
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
    revalidatePath(`/productos/${productId}/stock`);

    return {
      ok: true,
      message: "Stock actualizado. Se registro el movimiento.",
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo ajustar el stock.",
    };
  }
}
