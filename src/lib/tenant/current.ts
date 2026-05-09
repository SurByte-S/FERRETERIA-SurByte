import type { Tenant } from "./types";

export function getCurrentTenant(): Tenant {
  return {
    id: process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID ?? "demo",
    slug: process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG ?? "ferreteria-demo",
    name: process.env.NEXT_PUBLIC_DEFAULT_TENANT_NAME ?? "Ferreteria Demo",
  };
}
