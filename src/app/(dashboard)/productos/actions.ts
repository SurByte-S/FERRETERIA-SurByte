"use server";

import { revalidatePath } from "next/cache";

import { normalizeName, parseBoolean, parseNullableNumber } from "@/lib/csv/productos";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

export type ProductActionState = {
  ok: boolean;
  message: string;
};

const initialError = {
  ok: false,
  message: "Necesitan revision. No se pudo guardar el producto.",
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

async function ensureCatalogItem(
  table: "categories" | "brands",
  tenantId: string,
  name: string
) {
  if (!name) {
    return null;
  }

  const supabase = getSupabaseServerClient();
  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .maybeSingle();

  if (existingError) {
    throw new Error("No se pudo revisar categoria o marca.");
  }

  if (existing) {
    return (existing as { id: string }).id;
  }

  const { data: created, error: createError } = await supabase
    .from(table)
    .insert({ tenant_id: tenantId, name, active: true })
    .select("id")
    .single();

  if (createError) {
    throw new Error("No se pudo crear categoria o marca.");
  }

  return (created as { id: string }).id;
}

export async function updateProductAction(
  _previousState: ProductActionState,
  formData: FormData
): Promise<ProductActionState> {
  const tenant = getCurrentTenant();
  const sku = textValue(formData, "sku");
  const description = textValue(formData, "description");
  const categoryName = textValue(formData, "category");
  const brandName = textValue(formData, "brand");
  const unit = textValue(formData, "unit") || "unidad";

  if (!sku || !description) {
    return {
      ok: false,
      message: "Necesitan revision. La descripcion es obligatoria.",
    };
  }

  try {
    const supabase = getSupabaseServerClient();
    const [categoryId, brandId] = await Promise.all([
      ensureCatalogItem("categories", tenant.id, categoryName),
      ensureCatalogItem("brands", tenant.id, brandName),
    ]);

    const { error } = await supabase
      .from("products")
      .update({
        name: description,
        description,
        normalized_name: normalizeName(description),
        category_id: categoryId,
        brand_id: brandId,
        unit,
        cost_with_tax: parseNullableNumber(textValue(formData, "cost")),
        sale_price: parseNullableNumber(textValue(formData, "salePrice")),
        stock_quantity: parseNullableNumber(textValue(formData, "stock")) ?? 0,
        min_stock: parseNullableNumber(textValue(formData, "minStock")) ?? 0,
        active: parseBoolean(textValue(formData, "active")),
      })
      .eq("tenant_id", tenant.id)
      .eq("sku", sku);

    if (error) {
      return initialError;
    }

    revalidatePath("/productos");

    return {
      ok: true,
      message: "Producto guardado correctamente.",
    };
  } catch {
    return initialError;
  }
}
