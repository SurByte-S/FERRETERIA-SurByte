import { requireConfigurationTenant } from "../access";
import {
  BusinessForm,
  type TenantBusinessConfig,
} from "../configuracion-forms";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";

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

export default async function ConfiguracionDatosPage() {
  const tenant = await requireConfigurationTenant("/configuracion/datos");
  const business = await loadTenantBusiness(tenant.id);

  return (
    <>
      <PageHeader
        title="Datos del negocio"
        eyebrow=""
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-4xl gap-4 pb-6">
        <BusinessForm tenant={business} />
      </div>
    </>
  );
}

async function loadTenantBusiness(
  tenantId: string
): Promise<TenantBusinessConfig> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
    .eq("id", tenantId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("No se pudieron cargar los datos del negocio.");
  }

  return data as TenantBusinessRow;
}
