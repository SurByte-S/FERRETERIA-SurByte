"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];

function getConvertErrorMessage(message?: string) {
  if (!message) {
    return "No se pudo convertir el presupuesto en venta.";
  }

  if (message.includes("QUOTE_NOT_FOUND")) {
    return "No se encontro el presupuesto.";
  }

  if (message.includes("QUOTE_ALREADY_CONVERTED")) {
    return "Este presupuesto ya estaba convertido en venta.";
  }

  if (message.includes("QUOTE_WITHOUT_ITEMS")) {
    return "El presupuesto no tiene productos para convertir.";
  }

  if (message.includes("PAYMENT_METHOD_INVALID")) {
    return "Elegi una forma de pago valida.";
  }

  if (message.includes("PAID_AMOUNT_INVALID")) {
    return "El monto pagado no puede ser negativo.";
  }

  if (message.includes("CUSTOMER_NOT_FOUND")) {
    return "No se encontro el cliente seleccionado.";
  }

  if (message.includes("PAID_AMOUNT_TOO_LOW")) {
    return "Para esta forma de pago, el monto pagado debe cubrir el total.";
  }

  if (message.includes("CUSTOMER_REQUIRED_FOR_CREDIT")) {
    return "Para dejar deuda en cuenta corriente, elegi un cliente.";
  }

  return "No se pudo convertir el presupuesto en venta.";
}

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

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("convert_quote_to_sale", {
      input_quote_id: quoteId,
      input_tenant_id: tenant.id,
      input_customer_id: customerId?.trim() || null,
      input_payment_method: cleanPaymentMethod,
      input_paid_amount: paidAmount,
    });

    if (error || !data) {
      return {
        ok: false,
        message: getConvertErrorMessage(error?.message),
      };
    }

    const saleId = data as string;

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${quoteId}`);
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);

    return {
      ok: true,
      message: "Presupuesto convertido en venta.",
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
      message: "No se pudo convertir el presupuesto en venta.",
    };
  }
}
