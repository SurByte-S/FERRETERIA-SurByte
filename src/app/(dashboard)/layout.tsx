import { connection } from "next/server";

import { DashboardShell } from "@/components/shell/dashboard-shell";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type TenantBrandRow = {
  business_name: string | null;
  logo_url: string | null;
  name: string | null;
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const user = await requireUser("/dashboard-layout");
  const tenant = await requireTenant("/dashboard-layout");
  const tenantBrand = await loadTenantBrand({
    fallbackName: tenant.name,
    tenantId: tenant.id,
  });

  return (
    <DashboardShell
      tenantBrand={tenantBrand}
      tenantRole={tenant.role}
      userEmail={user.email}
    >
      {children}
    </DashboardShell>
  );
}

async function loadTenantBrand({
  fallbackName,
  tenantId,
}: {
  fallbackName: string;
  tenantId: string;
}) {
  const fallbackBrand = {
    logoUrl: null,
    name: fallbackName || ferreteriaGuemesBrand.brandName,
  };

  try {
    const supabase = getSupabaseServerClient("/dashboard-layout-brand");
    const { data, error } = await supabase
      .from("tenants")
      .select("name,business_name,logo_url")
      .eq("id", tenantId)
      .maybeSingle();

    if (error || !data) {
      return fallbackBrand;
    }

    const row = data as TenantBrandRow;
    const name =
      row.business_name?.trim() ||
      row.name?.trim() ||
      fallbackBrand.name;

    return {
      logoUrl: row.logo_url?.trim() || null,
      name,
    };
  } catch {
    return fallbackBrand;
  }
}
