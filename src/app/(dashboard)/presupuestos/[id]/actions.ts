"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

type QuoteRow = {
  id: string;
  customer_id: string | null;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  status: string;
};

type QuoteItemRow = {
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total: number;
};

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

export async function convertQuoteToSaleAction({
  quoteId,
  customerId,
  paymentMethod,
  paidAmount,
}: {
  quoteId: string;
  customerId?: string;
  paymentMethod: string;
  paidAmount: number;
}) {
  const cleanPaymentMethod = paymentMethod.trim();

  if (!PAYMENT_METHODS.includes(cleanPaymentMethod)) {
    return {
      ok: false,
      message: "Elegi una forma de pago para convertir la venta.",
    };
  }

  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    return {
      ok: false,
      message: "El monto pagado no puede ser negativo.",
    };
  }

  const cleanCustomerId = customerId?.trim() || null;

  try {
    const tenant = getCurrentTenant();
    const supabase = getSupabaseServerClient();
    const { data: quoteData, error: quoteError } = await supabase
      .from("quotes")
      .select("id,customer_id,subtotal,discount_amount,tax_amount,total,status")
      .eq("tenant_id", tenant.id)
      .eq("id", quoteId)
      .maybeSingle();

    if (quoteError || !quoteData) {
      return {
        ok: false,
        message: "No se encontro el presupuesto.",
      };
    }

    const quote = quoteData as QuoteRow;
    const finalCustomerId = cleanCustomerId ?? quote.customer_id;
    const pendingAmount = Math.max(quote.total - paidAmount, 0);

    if (quote.status === "converted") {
      return {
        ok: true,
        message: "Este presupuesto ya estaba convertido en venta.",
      };
    }

    if (cleanCustomerId) {
      const { data: customerData, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("id", cleanCustomerId)
        .maybeSingle();

      if (customerError || !customerData) {
        return {
          ok: false,
          message: "No se encontro el cliente seleccionado.",
        };
      }
    }

    if (cleanPaymentMethod !== "Cuenta corriente" && paidAmount < quote.total) {
      return {
        ok: false,
        message: "Para esta forma de pago, el monto pagado debe cubrir el total.",
      };
    }

    if (cleanPaymentMethod === "Cuenta corriente" && pendingAmount > 0 && !finalCustomerId) {
      return {
        ok: false,
        message: "Para dejar deuda en cuenta corriente, elegi un cliente.",
      };
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from("quote_items")
      .select("product_id,sku,name,quantity,unit_price,discount_amount,total")
      .eq("tenant_id", tenant.id)
      .eq("quote_id", quoteId);

    if (itemsError || !itemsData || itemsData.length === 0) {
      return {
        ok: false,
        message: "El presupuesto no tiene productos para convertir.",
      };
    }

    const { data: saleData, error: saleError } = await supabase
      .from("sales")
      .insert({
        tenant_id: tenant.id,
        customer_id: finalCustomerId,
        subtotal: quote.subtotal,
        discount_amount: quote.discount_amount,
        tax_amount: quote.tax_amount,
        total: quote.total,
        paid_amount: paidAmount,
        payment_method: cleanPaymentMethod,
      })
      .select("id")
      .single();

    if (saleError || !saleData) {
      return {
        ok: false,
        message: "No se pudo crear la venta.",
      };
    }

    const saleId = (saleData as { id: string }).id;
    const { error: saleItemsError } = await supabase.from("sale_items").insert(
      (itemsData as QuoteItemRow[]).map((item) => ({
        tenant_id: tenant.id,
        sale_id: saleId,
        product_id: item.product_id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount,
        total: item.total,
      }))
    );

    if (saleItemsError) {
      return {
        ok: false,
        message: "Se creo la venta, pero no se pudieron copiar los productos.",
      };
    }

    if (cleanPaymentMethod === "Cuenta corriente" && pendingAmount > 0 && finalCustomerId) {
      const { error: movementError } = await supabase
        .from("customer_account_movements")
        .insert({
          tenant_id: tenant.id,
          customer_id: finalCustomerId,
          sale_id: saleId,
          movement_type: "debit",
          amount: pendingAmount,
          notes: "Saldo pendiente de venta",
        });

      if (movementError) {
        return {
          ok: false,
          message: "Se creo la venta, pero no se pudo registrar la deuda.",
        };
      }
    }

    const { error: updateError } = await supabase
      .from("quotes")
      .update({ status: "converted" })
      .eq("tenant_id", tenant.id)
      .eq("id", quoteId);

    if (updateError) {
      return {
        ok: false,
        message: "Se creo la venta, pero no se pudo actualizar el presupuesto.",
      };
    }

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${quoteId}`);
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);

    return {
      ok: true,
      message: "Presupuesto convertido en venta.",
      saleId,
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo convertir el presupuesto en venta.",
    };
  }
}
