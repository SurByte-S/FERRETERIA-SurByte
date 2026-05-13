"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";
import type {
  QuoteCustomer,
  QuoteLine,
  QuoteProduct,
} from "@/components/presupuestos/quote-types";

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  sale_price: number | null;
};

export type SaveQuoteResult = {
  ok: boolean;
  message: string;
  quoteId?: string;
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

function getSaveQuoteErrorMessage(message?: string) {
  if (!message) {
    return "No se pudo guardar el presupuesto.";
  }

  if (message.includes("TENANT_NOT_FOUND")) {
    return "No se encontro la ferreteria configurada.";
  }

  if (message.includes("QUOTE_WITHOUT_ITEMS")) {
    return "Agrega al menos un producto antes de guardar.";
  }

  if (message.includes("QUOTE_ITEMS_INVALID")) {
    return "Revisa las cantidades de los productos.";
  }

  if (message.includes("QUOTE_PRODUCTS_NOT_FOUND")) {
    return "Hay productos que ya no estan disponibles. Revisa el presupuesto.";
  }

  if (message.includes("CUSTOMER_NOT_FOUND")) {
    return "No se encontro el cliente seleccionado.";
  }

  return "No se pudo guardar el presupuesto. Intenta nuevamente.";
}

export async function searchQuoteProductsAction(
  rawSearch: string
): Promise<QuoteProduct[]> {
  const search = cleanSearch(rawSearch);

  if (!search) {
    return [];
  }

  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,barcode,name,description,unit,sale_price")
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
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,barcode,name,description,unit,sale_price")
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

export async function saveQuoteAction({
  customer,
  lines,
}: {
  customer: QuoteCustomer;
  lines: QuoteLine[];
}): Promise<SaveQuoteResult> {
  const cleanLines = lines.filter((line) => line.quantity > 0);

  if (cleanLines.length === 0) {
    return {
      ok: false,
      message: "Agrega al menos un producto antes de guardar.",
    };
  }

  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_quote_with_items", {
      input_tenant_id: tenant.id,
      input_customer_id: customer.id?.trim() || null,
      input_customer_name: customer.name.trim() || null,
      input_customer_phone: customer.phone.trim() || null,
      input_customer_email: customer.email.trim() || null,
      input_customer_address: customer.address.trim() || null,
      input_items: cleanLines.map((line) => ({
        sku: line.sku,
        quantity: line.quantity,
      })),
      input_notes: "Presupuesto creado desde mostrador",
    });

    if (error || !data) {
      return {
        ok: false,
        message: getSaveQuoteErrorMessage(error?.message),
      };
    }

    const quoteId = data as string;
    revalidatePath("/presupuestos");

    return {
      ok: true,
      message: "Presupuesto guardado.",
      quoteId,
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo guardar el presupuesto. Intenta nuevamente.",
    };
  }
}
