import { requireTenant } from "./require-tenant";
import type { AuthenticatedTenant, TenantRole } from "./types";

export const FORBIDDEN_ACTION_MESSAGE =
  "No tenes permiso para hacer esta accion.";

export class TenantRoleForbiddenError extends Error {
  constructor() {
    super(FORBIDDEN_ACTION_MESSAGE);
    this.name = "TenantRoleForbiddenError";
  }
}

export function isTenantRoleForbiddenError(
  error: unknown
): error is TenantRoleForbiddenError {
  return error instanceof TenantRoleForbiddenError;
}

export async function requireTenantRole(
  allowedRoles: TenantRole[]
): Promise<AuthenticatedTenant> {
  const tenant = await requireTenant();

  if (!allowedRoles.includes(tenant.role)) {
    throw new TenantRoleForbiddenError();
  }

  return tenant;
}

