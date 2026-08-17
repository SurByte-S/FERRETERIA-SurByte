"use server";

import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export type ConfigActionState = {
  ok: boolean;
  message: string;
};

const DUPLICATE_BRAND_MESSAGE = "Ya existe una marca con ese nombre.";
const DUPLICATE_SUPPLIER_MESSAGE = "Ya existe un proveedor con ese nombre.";

function textValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalText(formData: FormData, key: string) {
  const value = textValue(formData, key);
  return value || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function actionErrorMessage(error: unknown, fallback: string) {
  if (isRedirectError(error)) {
    throw error;
  }

  if (isTenantRoleForbiddenError(error)) {
    return FORBIDDEN_ACTION_MESSAGE;
  }

  return fallback;
}

function isDuplicateError(errorMessage: string, label: "brand" | "supplier") {
  const normalized = errorMessage.toLowerCase();

  if (label === "brand") {
    return (
      normalized.includes("brands_tenant_id_name_key") ||
      normalized.includes("duplicate key value")
    );
  }

  return (
    normalized.includes("suppliers_tenant_id_name_key") ||
    normalized.includes("duplicate key value")
  );
}

export async function updateTenantBusinessAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const name = textValue(formData, "name");

  if (!name) {
    return {
      ok: false,
      message: "El nombre de la ferreteria es obligatorio.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("tenants")
      .update({
        name,
        business_name: optionalText(formData, "business_name"),
        tax_id: optionalText(formData, "tax_id"),
        phone: optionalText(formData, "phone"),
        email: optionalText(formData, "email"),
        address: optionalText(formData, "address"),
        logo_url: optionalText(formData, "logo_url"),
      })
      .eq("id", tenant.id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudieron guardar los datos del negocio.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/datos");
    revalidatePath("/inicio");

    return {
      ok: true,
      message: "Datos del negocio guardados.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(
        error,
        "No se pudieron guardar los datos del negocio."
      ),
    };
  }
}

async function brandExists({
  brandId,
  name,
  tenantId,
}: {
  brandId?: string;
  name: string;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("brands")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .limit(1);

  if (brandId) {
    query = query.neq("id", brandId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudo validar la marca.");
  }

  return (data ?? []).length > 0;
}

export async function createBrandConfigAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const name = textValue(formData, "name");

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre de la marca.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);

    if (await brandExists({ name, tenantId: tenant.id })) {
      return {
        ok: false,
        message: DUPLICATE_BRAND_MESSAGE,
      };
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("brands").insert({
      tenant_id: tenant.id,
      name,
      active: true,
    });

    if (error) {
      return {
        ok: false,
        message: isDuplicateError(error.message, "brand")
          ? DUPLICATE_BRAND_MESSAGE
          : "No se pudo crear la marca.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/marcas");
    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Marca creada.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(error, "No se pudo crear la marca."),
    };
  }
}

export async function updateBrandConfigAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const brandId = textValue(formData, "brandId");
  const name = textValue(formData, "name");

  if (!isUuid(brandId)) {
    return {
      ok: false,
      message: "No se encontro la marca.",
    };
  }

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre de la marca.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);

    if (await brandExists({ brandId, name, tenantId: tenant.id })) {
      return {
        ok: false,
        message: DUPLICATE_BRAND_MESSAGE,
      };
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .update({ name })
      .eq("tenant_id", tenant.id)
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error && isDuplicateError(error.message, "brand")
          ? DUPLICATE_BRAND_MESSAGE
          : "No se pudo actualizar la marca.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/marcas");
    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Marca actualizada.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(error, "No se pudo actualizar la marca."),
    };
  }
}

export async function setBrandActiveConfigAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const brandId = textValue(formData, "brandId");
  const active = textValue(formData, "active") === "true";

  if (!isUuid(brandId)) {
    return {
      ok: false,
      message: "No se encontro la marca.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brands")
      .update({ active })
      .eq("tenant_id", tenant.id)
      .eq("id", brandId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: "No se pudo cambiar el estado de la marca.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/marcas");
    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: active ? "Marca activada." : "Marca desactivada.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(
        error,
        "No se pudo cambiar el estado de la marca."
      ),
    };
  }
}

async function supplierExists({
  supplierId,
  name,
  tenantId,
}: {
  supplierId?: string;
  name: string;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("suppliers")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .limit(1);

  if (supplierId) {
    query = query.neq("id", supplierId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("No se pudo validar el proveedor.");
  }

  return (data ?? []).length > 0;
}

export async function createSupplierConfigAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const name = textValue(formData, "name");

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre del proveedor.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);

    if (await supplierExists({ name, tenantId: tenant.id })) {
      return {
        ok: false,
        message: DUPLICATE_SUPPLIER_MESSAGE,
      };
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase.from("suppliers").insert({
      tenant_id: tenant.id,
      name,
      phone: optionalText(formData, "phone"),
      email: optionalText(formData, "email"),
      address: optionalText(formData, "address"),
      notes: optionalText(formData, "notes"),
    });

    if (error) {
      return {
        ok: false,
        message: isDuplicateError(error.message, "supplier")
          ? DUPLICATE_SUPPLIER_MESSAGE
          : "No se pudo crear el proveedor.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/proveedores");
    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Proveedor creado.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(error, "No se pudo crear el proveedor."),
    };
  }
}

export async function updateSupplierConfigAction(
  _previousState: ConfigActionState,
  formData: FormData
): Promise<ConfigActionState> {
  const supplierId = textValue(formData, "supplierId");
  const name = textValue(formData, "name");

  if (!isUuid(supplierId)) {
    return {
      ok: false,
      message: "No se encontro el proveedor.",
    };
  }

  if (!name) {
    return {
      ok: false,
      message: "Escribi el nombre del proveedor.",
    };
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin"]);

    if (await supplierExists({ supplierId, name, tenantId: tenant.id })) {
      return {
        ok: false,
        message: DUPLICATE_SUPPLIER_MESSAGE,
      };
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("suppliers")
      .update({
        name,
        phone: optionalText(formData, "phone"),
        email: optionalText(formData, "email"),
        address: optionalText(formData, "address"),
        notes: optionalText(formData, "notes"),
      })
      .eq("tenant_id", tenant.id)
      .eq("id", supplierId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error && isDuplicateError(error.message, "supplier")
          ? DUPLICATE_SUPPLIER_MESSAGE
          : "No se pudo actualizar el proveedor.",
      };
    }

    revalidatePath("/configuracion");
    revalidatePath("/configuracion/proveedores");
    revalidatePath("/stock");
    revalidatePath("/productos");

    return {
      ok: true,
      message: "Proveedor actualizado.",
    };
  } catch (error) {
    return {
      ok: false,
      message: actionErrorMessage(error, "No se pudo actualizar el proveedor."),
    };
  }
}
