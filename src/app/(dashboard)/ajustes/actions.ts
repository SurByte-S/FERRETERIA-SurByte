"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type InvoiceSettingsActionState = {
  ok: boolean;
  message: string;
};

function nullableText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

export async function saveInvoiceSettingsAction(
  _previousState: InvoiceSettingsActionState,
  formData: FormData
): Promise<InvoiceSettingsActionState> {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("tenant_invoice_settings").upsert(
      {
        tenant_id: tenant.id,
        fantasy_name: nullableText(formData, "fantasyName"),
        legal_name: nullableText(formData, "legalName"),
        tax_id: nullableText(formData, "taxId"),
        iva_condition: nullableText(formData, "ivaCondition"),
        address: nullableText(formData, "address"),
        city: nullableText(formData, "city"),
        province: nullableText(formData, "province"),
        phone: nullableText(formData, "phone"),
        email: nullableText(formData, "email"),
        receipt_footer: nullableText(formData, "receiptFooter"),
        receipt_message: nullableText(formData, "receiptMessage"),
      },
      { onConflict: "tenant_id" }
    );

    if (error) {
      return {
        ok: false,
        message: "No se pudieron guardar los datos de factura.",
      };
    }

    revalidatePath("/ajustes");
    revalidatePath("/ventas");
    revalidatePath("/presupuestos");

    return {
      ok: true,
      message: "Datos de factura guardados.",
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
      message: "No se pudieron guardar los datos de factura.",
    };
  }
}
