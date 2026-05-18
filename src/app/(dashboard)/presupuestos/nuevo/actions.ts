"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenant,
  requireTenantRole,
} from "@/lib/tenant";
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
  normalized_name: string;
  description: string | null;
  brands?: { name: string | null } | null;
  categories?: { name: string | null } | null;
  unit: string;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
};

export type PosProductSearchResult = {
  ok: boolean;
  items: QuoteProduct[];
  total: number;
  message?: string;
};

export type SaveQuoteResult = {
  ok: boolean;
  message: string;
  quoteId?: string;
  saleId?: string;
};

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

const CASH_REGISTER_CLOSED_MESSAGE =
  "Caja cerrada. Abrí caja antes de registrar ventas.";

const STOCK_NOT_ENOUGH_MESSAGE =
  "Stock insuficiente. Revisá las cantidades antes de vender.";

function mapProduct(row: ProductRow): QuoteProduct {
  return {
    sku: row.sku,
    code: row.barcode ?? row.sku,
    name: row.name,
    description: row.description ?? row.name,
    brand: row.brands?.name ?? "",
    category: row.categories?.name ?? "",
    unit: row.unit,
    price: row.sale_price ?? 0,
    stockQuantity: row.stock_quantity ?? 0,
    minStock: row.min_stock ?? 0,
    availableForSale: (row.stock_quantity ?? 0) > 0,
  };
}

function cleanSearch(value: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .replace(/\s+/g, " ");
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

function getConvertQuoteErrorMessage(message?: string) {
  if (!message) {
    return "No se pudo registrar la venta.";
  }

  if (message.includes("QUOTE_NOT_FOUND")) {
    return "No se encontro el presupuesto guardado.";
  }

  if (message.includes("QUOTE_ALREADY_CONVERTED")) {
    return "Este presupuesto ya estaba convertido en venta.";
  }

  if (message.includes("QUOTE_WITHOUT_ITEMS")) {
    return "El presupuesto no tiene productos para vender.";
  }

  if (message.includes("PAYMENT_METHOD_INVALID")) {
    return "Elegi una forma de pago valida.";
  }

  if (message.includes("PAID_AMOUNT_INVALID")) {
    return "El monto pagado no puede ser negativo.";
  }

  if (message.includes("PAID_AMOUNT_TOO_LOW")) {
    return "Para esta forma de pago, el monto pagado debe cubrir el total.";
  }

  if (message.includes("CUSTOMER_REQUIRED_FOR_CREDIT")) {
    return "Para dejar deuda en cuenta corriente, elegi un cliente.";
  }

  if (message.includes("CASH_REGISTER_CLOSED")) {
    return CASH_REGISTER_CLOSED_MESSAGE;
  }

  if (message.includes("STOCK_NOT_ENOUGH")) {
    return STOCK_NOT_ENOUGH_MESSAGE;
  }

  return "No se pudo registrar la venta.";
}

async function hasOpenCashRegister(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const { data, error } = await supabase
    .from("cash_register_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function searchQuoteProductsAction(
  rawSearch: string,
  includeOutOfStock = false
): Promise<QuoteProduct[]> {
  const search = cleanSearch(rawSearch);

  if (!search) {
    return [];
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(
        `sku.ilike.%${search}%,barcode.ilike.%${search}%,name.ilike.%${search}%,normalized_name.ilike.%${search}%,description.ilike.%${search}%`
      )
      .order("name")
      .limit(30);

    if (!includeOutOfStock) {
      query = query.gt("stock_quantity", 0);
    }

    const { data, error } = await query;

    if (error) {
      return [];
    }

    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  } catch {
    return [];
  }
}

export async function searchProductsForPosAction(
  rawSearch: string,
  includeOutOfStock = false,
  page = 1,
  pageSize = 40
): Promise<PosProductSearchResult> {
  const search = cleanSearch(rawSearch);

  if (!search) {
    return {
      ok: true,
      items: [],
      total: 0,
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const safeSearch = search.replace(/[%_]/g, "");
    const from = Math.max(0, page - 1) * pageSize;
    const to = from + Math.min(Math.max(pageSize, 1), 60) - 1;
    const [matchingBrands, matchingCategories] = await Promise.all([
      supabase
        .from("brands")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .ilike("name", `%${safeSearch}%`),
      supabase
        .from("categories")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .ilike("name", `%${safeSearch}%`),
    ]);
    const brandIds = ((matchingBrands.data ?? []) as { id: string }[]).map(
      (item) => item.id
    );
    const categoryIds = (
      (matchingCategories.data ?? []) as { id: string }[]
    ).map((item) => item.id);
    const searchParts = [
      `sku.ilike.%${safeSearch}%`,
      `barcode.ilike.%${safeSearch}%`,
      `name.ilike.%${safeSearch}%`,
      `normalized_name.ilike.%${safeSearch}%`,
      `description.ilike.%${safeSearch}%`,
    ];

    if (brandIds.length > 0) {
      searchParts.push(`brand_id.in.(${brandIds.join(",")})`);
    }

    if (categoryIds.length > 0) {
      searchParts.push(`category_id.in.(${categoryIds.join(",")})`);
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock,brands(name),categories(name)",
        { count: "exact" }
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(searchParts.join(","))
      .order("name")
      .range(from, to);

    if (!includeOutOfStock) {
      query = query.gt("stock_quantity", 0);
    }

    const { data, error, count } = await query;

    if (error) {
      return {
        ok: false,
        items: [],
        total: 0,
        message: "No se pudieron buscar productos. Revisa la conexion.",
      };
    }

    return {
      ok: true,
      items: ((data ?? []) as unknown as ProductRow[]).map(mapProduct),
      total: count ?? 0,
    };
  } catch {
    return {
      ok: false,
      items: [],
      total: 0,
      message: "No se pudieron buscar productos. Intenta nuevamente.",
    };
  }
}

export async function getQuoteProductBySkuAction(
  rawSku: string,
  includeOutOfStock = false
): Promise<QuoteProduct | null> {
  const sku = cleanSearch(rawSku);

  if (!sku) {
    return null;
  }

  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const selectFields =
      "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock";
    let skuQuery = supabase
      .from("products")
      .select(selectFields)
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .ilike("sku", sku);

    if (!includeOutOfStock) {
      skuQuery = skuQuery.gt("stock_quantity", 0);
    }

    const skuResult = await skuQuery.limit(1).maybeSingle();

    if (!skuResult.error && skuResult.data) {
      return mapProduct(skuResult.data as unknown as ProductRow);
    }

    let barcodeQuery = supabase
      .from("products")
      .select(selectFields)
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .ilike("barcode", sku);

    if (!includeOutOfStock) {
      barcodeQuery = barcodeQuery.gt("stock_quantity", 0);
    }

    const barcodeResult = await barcodeQuery.limit(1).maybeSingle();

    if (barcodeResult.error || !barcodeResult.data) {
      return null;
    }

    return mapProduct(barcodeResult.data as unknown as ProductRow);
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
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message: "No se pudo guardar el presupuesto. Intenta nuevamente.",
    };
  }
}

export async function saveQuoteAndConvertToSaleAction({
  customer,
  lines,
  paymentMethod,
  paidAmount,
}: {
  customer: QuoteCustomer;
  lines: QuoteLine[];
  paymentMethod: string;
  paidAmount: number;
}): Promise<SaveQuoteResult> {
  const cleanPaymentMethod = paymentMethod.trim();

  if (!PAYMENT_METHODS.includes(cleanPaymentMethod)) {
    return {
      ok: false,
      message: "Elegi una forma de pago para registrar la venta.",
    };
  }

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return {
      ok: false,
      message: "Revisa el monto pagado.",
    };
  }

  const cleanLines = lines.filter((line) => line.quantity > 0);

  if (cleanLines.length === 0) {
    return {
      ok: false,
      message: "Agrega al menos un producto antes de vender.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();

    if (!(await hasOpenCashRegister(tenant.id, supabase))) {
      return {
        ok: false,
        message: CASH_REGISTER_CLOSED_MESSAGE,
      };
    }

    const { data: quoteData, error: quoteError } = await supabase.rpc(
      "create_quote_with_items",
      {
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
        input_notes: "Venta creada desde mostrador",
      }
    );

    if (quoteError || !quoteData) {
      return {
        ok: false,
        message: getSaveQuoteErrorMessage(quoteError?.message),
      };
    }

    const quoteId = quoteData as string;
    const { data: saleData, error: saleError } = await supabase.rpc(
      "convert_quote_to_sale",
      {
        input_quote_id: quoteId,
        input_tenant_id: tenant.id,
        input_customer_id: customer.id?.trim() || null,
        input_payment_method: cleanPaymentMethod,
        input_paid_amount: paidAmount,
      }
    );

    if (saleError || !saleData) {
      revalidatePath("/presupuestos");
      revalidatePath(`/presupuestos/${quoteId}`);

      return {
        ok: false,
        message: `${getConvertQuoteErrorMessage(
          saleError?.message
        )} El presupuesto quedo guardado para revisarlo.`,
        quoteId,
      };
    }

    const saleId = saleData as string;

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${quoteId}`);
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);

    return {
      ok: true,
      message: "Venta registrada.",
      quoteId,
      saleId,
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
      message: "No se pudo registrar la venta. Intenta nuevamente.",
    };
  }
}
