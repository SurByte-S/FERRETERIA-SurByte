import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { AuthenticatedTenant, TenantRole } from "./types";

type TenantMemberRow = {
  role: TenantRole;
  tenants:
    | {
        id: string;
        slug: string;
        name: string;
      }
    | {
        id: string;
        slug: string;
        name: string;
      }[]
    | null;
};

export async function requireTenant(): Promise<AuthenticatedTenant> {
  const user = await requireUser();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenant_members")
    .select("role,tenants(id,slug,name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    redirect("/sin-ferreteria");
  }

  // TODO: cuando un usuario tenga multiples ferreterias, mostrar selector.
  const membership = (data as unknown as TenantMemberRow[])[0];
  const tenant = Array.isArray(membership.tenants)
    ? membership.tenants[0]
    : membership.tenants;

  if (!tenant) {
    redirect("/sin-ferreteria");
  }

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    role: membership.role,
  };
}

