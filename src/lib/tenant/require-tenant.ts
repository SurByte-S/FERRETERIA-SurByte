import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  logServerAuthInfo,
  logServerError,
  logServerWarn,
} from "@/lib/server-log";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getSupabaseServerEnv } from "@/lib/supabase/env";
import type { AuthenticatedTenant, TenantRole } from "./types";

type TenantMemberRow = {
  tenant_id?: string;
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

export async function requireTenant(
  source = "requireTenant"
): Promise<AuthenticatedTenant> {
  const user = await requireUser(source);
  const env = getSupabaseServerEnv(source);

  if (!env.ok) {
    logServerError("Redirecting due to missing Supabase server env", {
      source,
      userId: user.id,
      missing: env.missing.join(","),
    });
    redirect("/sin-ferreteria?reason=config");
  }

  const supabase = getSupabaseServerClient(source);
  const { data, error } = await supabase
    .from("tenant_members")
    .select("tenant_id,role,tenants(id,slug,name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    logServerWarn("Tenant membership not found", {
      source,
      userId: user.id,
      error: error?.message,
      rows: data?.length ?? 0,
    });
    redirect("/sin-ferreteria?reason=tenant");
  }

  const memberships = data as unknown as TenantMemberRow[];

  if (memberships.length > 1) {
    logServerWarn("Multiple active tenant memberships found", {
      source,
      userId: user.id,
      rows: memberships.length,
      tenantIds: memberships
        .map((membership) => membership.tenant_id)
        .filter(Boolean)
        .join(","),
    });
    redirect("/sin-ferreteria?reason=multiple-tenants");
  }

  const membership = memberships[0];
  const tenant = Array.isArray(membership.tenants)
    ? membership.tenants[0]
    : membership.tenants;

  if (!tenant) {
    logServerWarn("Tenant membership has no active tenant", {
      source,
      userId: user.id,
      role: membership.role,
    });
    redirect("/sin-ferreteria?reason=tenant");
  }

  logServerAuthInfo("Tenant found", {
    source,
    userId: user.id,
    tenantId: tenant.id,
    role: membership.role,
  });

  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    role: membership.role,
  };
}

