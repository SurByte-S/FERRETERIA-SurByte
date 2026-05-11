"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";
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
    const tenant = getCurrentTenant();
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
      message: "Agregá al menos un producto antes de guardar.",
    };
  }

  try {
    const tenant = getCurrentTenant();
    const supabase = getSupabaseServerClient();
    const skus = cleanLines.map((line) => line.sku);
    const { data: products, error: productsError } = await supabase
      .from("products")
      .select("id,sku,name,description,sale_price")
      .eq("tenant_id", tenant.id)
      .in("sku", skus);

    if (productsError || !products || products.length !== skus.length) {
      return {
        ok: false,
        message: "Hay productos que ya no están disponibles. Revisá el presupuesto.",
      };
    }

    const productMap = new Map(
      (
        products as {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          sale_price: number | null;
        }[]
      ).map((product) => [product.sku, product])
    );
    const subtotal = cleanLines.reduce((sum, line) => {
      const product = productMap.get(line.sku);
      return sum + line.quantity * (product?.sale_price ?? 0);
    }, 0);
    let customerId: string | null = null;

    if (customer.id) {
      const { data: existingCustomer, error: existingCustomerError } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("id", customer.id)
        .maybeSingle();

      if (existingCustomerError || !existingCustomer) {
        return {
          ok: false,
          message: "No se encontro el cliente seleccionado.",
        };
      }

      customerId = (existingCustomer as { id: string }).id;
    } else if (customer.name.trim()) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenant.id,
          name: customer.name.trim(),
          phone: customer.phone.trim() || null,
          email: customer.email.trim() || null,
          address: customer.address.trim() || null,
        })
        .select("id")
        .single();

      if (customerError || !customerData) {
        return {
          ok: false,
          message: "No se pudo guardar el cliente. Revisá los datos.",
        };
      }

      customerId = (customerData as { id: string }).id;
    }

    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .insert({
        tenant_id: tenant.id,
        customer_id: customerId,
        status: "draft",
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total: subtotal,
        notes: "Presupuesto creado desde mostrador",
      })
      .select("id")
      .single();

    if (quoteError || !quoteData) {
      return {
        ok: false,
        message: "No se pudo guardar el presupuesto.",
      };
    }

    const quoteId = (quoteData as { id: string }).id;
    const { error: itemsError } = await supabase.from("quote_items").insert(
      cleanLines.map((line) => {
        const product = productMap.get(line.sku);
        const price = product?.sale_price ?? 0;

        return {
          tenant_id: tenant.id,
          quote_id: quoteId,
          product_id: product?.id ?? null,
          sku: line.sku,
          name: product?.description ?? product?.name ?? line.description,
          quantity: line.quantity,
          unit_price: price,
          discount_amount: 0,
          total: line.quantity * price,
        };
      })
    );

    if (itemsError) {
      return {
        ok: false,
        message: "Se guardó el encabezado, pero no los productos. Revisá el presupuesto.",
      };
    }

    revalidatePath("/presupuestos");

    return {
      ok: true,
      message: "Presupuesto guardado.",
      quoteId,
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo guardar el presupuesto. Intentá nuevamente.",
    };
  }
}
