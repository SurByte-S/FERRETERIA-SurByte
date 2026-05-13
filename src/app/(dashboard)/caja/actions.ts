"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

export type CashActionState = {
  ok: boolean;
  message: string;
};

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function moneyValue(formData: FormData, key: string) {
  return Number(textValue(formData, key));
}

export async function openCashSessionAction(
  _previousState: CashActionState,
  formData: FormData
): Promise<CashActionState> {
  const openingAmount = moneyValue(formData, "openingAmount");
  const notes = textValue(formData, "notes");

  if (!Number.isFinite(openingAmount) || openingAmount < 0) {
    return {
      ok: false,
      message: "Ingresa un monto inicial valido.",
    };
  }

  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data: openSession } = await supabase
      .from("cash_register_sessions")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("status", "open")
      .maybeSingle();

    if (openSession) {
      return {
        ok: false,
        message: "Ya hay una caja abierta.",
      };
    }

    const { error } = await supabase.from("cash_register_sessions").insert({
      tenant_id: tenant.id,
      opening_amount: openingAmount,
      expected_cash_amount: openingAmount,
      status: "open",
      notes: notes || null,
    });

    if (error) {
      return {
        ok: false,
        message: "No se pudo abrir la caja.",
      };
    }

    revalidatePath("/caja");

    return {
      ok: true,
      message: "Caja abierta.",
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo abrir la caja.",
    };
  }
}

export async function closeCashSessionAction(
  _previousState: CashActionState,
  formData: FormData
): Promise<CashActionState> {
  const sessionId = textValue(formData, "sessionId");
  const countedAmount = moneyValue(formData, "countedAmount");
  const notes = textValue(formData, "notes");

  if (!sessionId) {
    return {
      ok: false,
      message: "No se encontro la caja abierta.",
    };
  }

  if (!Number.isFinite(countedAmount) || countedAmount < 0) {
    return {
      ok: false,
      message: "Ingresa el efectivo contado.",
    };
  }

  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data: session, error: sessionError } = await supabase
      .from("cash_register_sessions")
      .select("id,opening_amount,status")
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .eq("status", "open")
      .maybeSingle();

    if (sessionError || !session) {
      return {
        ok: false,
        message: "No se encontro la caja abierta.",
      };
    }

    const { data: cashSales, error: salesError } = await supabase
      .from("sales")
      .select("paid_amount")
      .eq("tenant_id", tenant.id)
      .eq("cash_session_id", sessionId)
      .eq("payment_method", "Efectivo");

    if (salesError) {
      return {
        ok: false,
        message: "No se pudieron calcular las ventas en efectivo.",
      };
    }

    const openingAmount = Number(
      (session as { opening_amount: number }).opening_amount
    );
    const cashSalesTotal = ((cashSales ?? []) as { paid_amount: number }[]).reduce(
      (sum, sale) => sum + Number(sale.paid_amount ?? 0),
      0
    );
    const expectedAmount = openingAmount + cashSalesTotal;
    const differenceAmount = countedAmount - expectedAmount;
    const { error } = await supabase
      .from("cash_register_sessions")
      .update({
        expected_cash_amount: expectedAmount,
        counted_cash_amount: countedAmount,
        difference_amount: differenceAmount,
        status: "closed",
        closed_at: new Date().toISOString(),
        notes: notes || null,
      })
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .eq("status", "open");

    if (error) {
      return {
        ok: false,
        message: "No se pudo cerrar la caja.",
      };
    }

    revalidatePath("/caja");

    return {
      ok: true,
      message: `Caja cerrada. Diferencia de caja: ${new Intl.NumberFormat(
        "es-AR",
        {
          style: "currency",
          currency: "ARS",
          maximumFractionDigits: 2,
        }
      ).format(differenceAmount)}.`,
    };
  } catch {
    return {
      ok: false,
      message: "No se pudo cerrar la caja.",
    };
  }
}
