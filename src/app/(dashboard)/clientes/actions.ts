"use server";

import { revalidatePath } from "next/cache";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type CustomerActionResult = {
  ok: boolean;
  message: string;
  customerId?: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const clean = cleanText(value);
  return clean || null;
}

export async function createCustomerAction(formData: FormData): Promise<CustomerActionResult> {
  const name = cleanText(formData.get("name"));

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre del cliente.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenant.id,
        name,
        phone: optionalText(formData.get("phone")),
        email: optionalText(formData.get("email")),
        address: optionalText(formData.get("address")),
        notes: optionalText(formData.get("notes")),
      })
      .select("id")
      .single();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo guardar el cliente.",
      };
    }

    const customerId = (data as { id: string }).id;
    revalidatePath("/clientes");

    return {
      ok: true,
      message: "Cliente guardado.",
      customerId,
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
      message: "No se pudo guardar el cliente.",
    };
  }
}

export async function updateCustomerAction(
  customerId: string,
  formData: FormData
): Promise<CustomerActionResult> {
  const name = cleanText(formData.get("name"));

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre del cliente.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("customers")
      .update({
        name,
        phone: optionalText(formData.get("phone")),
        email: optionalText(formData.get("email")),
        address: optionalText(formData.get("address")),
        notes: optionalText(formData.get("notes")),
      })
      .eq("tenant_id", tenant.id)
      .eq("id", customerId);

    if (error) {
      return {
        ok: false,
        message: "No se pudo actualizar el cliente.",
      };
    }

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);

    return {
      ok: true,
      message: "Cliente actualizado.",
      customerId,
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
      message: "No se pudo actualizar el cliente.",
    };
  }
}

export async function registerCustomerPaymentAction(
  customerId: string,
  formData: FormData
): Promise<CustomerActionResult> {
  const amount = Number(formData.get("amount"));
  const notes = optionalText(formData.get("notes")) ?? "Pago registrado";

  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      ok: false,
      message: "Ingresa un importe mayor a cero.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("customer_account_movements").insert({
      tenant_id: tenant.id,
      customer_id: customerId,
      sale_id: null,
      movement_type: "payment",
      amount,
      notes,
    });

    if (error) {
      return {
        ok: false,
        message: "No se pudo registrar el pago.",
      };
    }

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);

    return {
      ok: true,
      message: "Pago registrado.",
      customerId,
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
      message: "No se pudo registrar el pago.",
    };
  }
}
