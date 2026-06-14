"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
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
const EPSILON = 0.000001;

const CASH_REGISTER_CLOSED_MESSAGE =
  "Caja cerrada. Abrí caja antes de registrar ventas.";

const STOCK_NOT_ENOUGH_MESSAGE =
  "Stock insuficiente. Revisá las cantidades antes de vender.";

type DeleteQuoteActionResult = {
  ok: boolean;
  message: string;
};

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

  if (message.includes("CASH_REGISTER_CLOSED")) {
    return CASH_REGISTER_CLOSED_MESSAGE;
  }

  if (message.includes("STOCK_NOT_ENOUGH")) {
    return STOCK_NOT_ENOUGH_MESSAGE;
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
  paidAmount: number | string | null | undefined;
}) {
  const cleanPaymentMethod = paymentMethod.trim();
  const normalizedPaidAmount =
    cleanPaymentMethod === "Cuenta corriente" &&
    (paidAmount === "" || paidAmount === null || paidAmount === undefined)
      ? 0
      : Number(paidAmount);

  if (!PAYMENT_METHODS.includes(cleanPaymentMethod)) {
    return {
      ok: false,
      message: "Elegi una forma de pago para convertir la venta.",
    };
  }

  if (!Number.isFinite(normalizedPaidAmount) || normalizedPaidAmount < 0) {
    return {
      ok: false,
      message: "El monto pagado no puede ser negativo.",
    };
  }

  if (cleanPaymentMethod === "Cuenta corriente" && !customerId?.trim()) {
    return {
      ok: false,
      message: "Para vender a cuenta corriente, elegi un cliente.",
    };
  }

  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin", "seller"]),
      requireUser(),
    ]);
    const supabase = getSupabaseServerClient();
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("total")
      .eq("tenant_id", tenant.id)
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (quoteError || !quote) {
      return {
        ok: false,
        message: "No se encontro el presupuesto.",
      };
    }

    const total = Number((quote as { total: number }).total ?? 0);

    if (normalizedPaidAmount - total > EPSILON) {
      return {
        ok: false,
        message: "El monto pagado no puede superar el total.",
      };
    }

    console.info("[sale-payload-diagnostic]", {
      source: "convertQuoteToSaleAction",
      paymentMethod: cleanPaymentMethod,
      rawPaidAmount: paidAmount,
      normalizedPaidAmount,
      total,
      customerId: customerId?.trim() || null,
    });

    const { data, error } = await supabase.rpc("convert_quote_to_sale", {
      input_quote_id: quoteId,
      input_tenant_id: tenant.id,
      input_created_by: user.id,
      input_customer_id: customerId?.trim() || null,
      input_payment_method: cleanPaymentMethod,
      input_paid_amount: normalizedPaidAmount,
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

export async function deleteQuoteAction(
  _previousState: DeleteQuoteActionResult,
  formData: FormData
): Promise<DeleteQuoteActionResult> {
  const quoteId = String(formData.get("quoteId") ?? "").trim();

  if (!quoteId) {
    return {
      ok: false,
      message: "No se encontro el presupuesto.",
    };
  }

  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin"]),
      requireUser(),
    ]);
    const supabase = getSupabaseServerClient();
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();

    if (quoteError) {
      return {
        ok: false,
        message: "No se pudo validar el presupuesto.",
      };
    }

    if (!quote) {
      return {
        ok: false,
        message: "El presupuesto no existe para esta ferreteria.",
      };
    }

    const { error } = await supabase
      .from("quotes")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", quoteId);

    if (error) {
      return {
        ok: false,
        message: "No se pudo eliminar el presupuesto.",
      };
    }

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${quoteId}`);

    return {
      ok: true,
      message: "Presupuesto eliminado. El historial se conserva.",
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
      message: "No se pudo eliminar el presupuesto.",
    };
  }
}
