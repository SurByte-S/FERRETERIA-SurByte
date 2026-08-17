import { redirect } from "next/navigation";

import {
  ConfiguracionForms,
  type BrandConfigItem,
  type SupplierConfigItem,
  type TenantBusinessConfig,
} from "./configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isTenantRoleForbiddenError, requireTenantRole } from "@/lib/tenant";

type TenantBusinessRow = {
  name: string;
  slug: string;
  business_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
};

type BrandRow = {
  id: string;
  name: string;
  active: boolean | null;
};

type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type ProductBrandRow = {
  brand_id: string | null;
};

export default async function ConfiguracionPage() {
  const tenant = await requireConfigurationTenant();
  const result = await loadConfigurationData(tenant.id);

  return (
    <>
      <PageHeader
        title="Configuracion"
        description="Datos del negocio, marcas y proveedores."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <ConfiguracionForms
        tenant={result.tenant}
        brands={result.brands}
        suppliers={result.suppliers}
      />
    </>
  );
}

async function requireConfigurationTenant() {
  try {
    return await requireTenantRole(["owner", "admin"], "/configuracion");
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      redirect("/inicio");
    }

    throw error;
  }
}

async function loadConfigurationData(tenantId: string): Promise<{
  tenant: TenantBusinessConfig;
  brands: BrandConfigItem[];
  suppliers: SupplierConfigItem[];
}> {
  const supabase = getSupabaseServerClient();
  const [tenantResult, brandsResult, suppliersResult, productBrandsResult] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("brands")
        .select("id,name,active")
        .eq("tenant_id", tenantId)
        .order("active", { ascending: false })
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,name,phone,email,address,notes")
        .eq("tenant_id", tenantId)
        .order("name"),
      supabase
        .from("products")
        .select("brand_id")
        .eq("tenant_id", tenantId)
        .not("brand_id", "is", null),
    ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error("No se pudieron cargar los datos del negocio.");
  }

  if (brandsResult.error) {
    throw new Error("No se pudieron cargar las marcas.");
  }

  if (suppliersResult.error) {
    throw new Error("No se pudieron cargar los proveedores.");
  }

  const brandCounts = ((productBrandsResult.data ?? []) as ProductBrandRow[]).reduce(
    (counts, row) => {
      if (row.brand_id) {
        counts.set(row.brand_id, (counts.get(row.brand_id) ?? 0) + 1);
      }

      return counts;
    },
    new Map<string, number>()
  );
  const tenant = tenantResult.data as TenantBusinessRow;

  return {
    tenant,
    brands: ((brandsResult.data ?? []) as BrandRow[]).map((brand) => ({
      id: brand.id,
      name: brand.name,
      active: brand.active !== false,
      productsCount: brandCounts.get(brand.id) ?? 0,
    })),
    suppliers: ((suppliersResult.data ?? []) as SupplierRow[]).map(
      (supplier) => ({
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        notes: supplier.notes,
      })
    ),
  };
}
