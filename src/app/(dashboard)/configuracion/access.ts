import { redirect } from "next/navigation";

import { isTenantRoleForbiddenError, requireTenantRole } from "@/lib/tenant";

export async function requireConfigurationTenant(source = "/configuracion") {
  try {
    return await requireTenantRole(["owner", "admin"], source);
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      redirect("/inicio");
    }

    throw error;
  }
}
