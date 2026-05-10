"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";
import type { QuoteProduct } from "@/components/presupuestos/quote-types";

type ProductRow = {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  sale_price: number | null;
};

function mapProduct(row: ProductRow): QuoteProduct {
  return {
    sku: row.sku,
    code: row.barcode ?? row.sku,
    description: row.description ?? row.name,
    unit: row.unit,
    price: row.sale_price ?? 0,
  };
}

function cleanSearch(value: string) {
  return value.trim().replace(/[%_]/g, "");
}

export async function searchQuoteProductsAction(
  rawSearch: string
): Promise<QuoteProduct[]> {
  const search = cleanSearch(rawSearch);

  if (!search) {
    return [];
  }

  try {
    const tenant = getCurrentTenant();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("sku,barcode,name,description,unit,sale_price")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(
        `sku.ilike.%${search}%,barcode.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%`
      )
      .order("name")
      .limit(12);

    if (error) {
      return [];
    }

    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  } catch {
    return [];
  }
}

export async function getQuoteProductBySkuAction(
  rawSku: string
): Promise<QuoteProduct | null> {
  const sku = rawSku.trim();

  if (!sku) {
    return null;
  }

  try {
    const tenant = getCurrentTenant();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("sku,barcode,name,description,unit,sale_price")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(`sku.eq.${sku},barcode.eq.${sku}`)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapProduct(data as unknown as ProductRow);
  } catch {
    return null;
  }
}
