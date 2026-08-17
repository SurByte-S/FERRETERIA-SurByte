import Link from "next/link";

import { requireConfigurationTenant } from "../access";
import {
  FacturacionForm,
  type TenantInvoiceSettingsConfig,
} from "../facturacion-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase";

type TenantFiscalFallbackRow = {
  name: string;
  business_name: string | null;
  tax_id: string | null;
  address: string | null;
};

type TenantInvoiceSettingsRow = {
  legal_name: string | null;
  cuit: string | null;
  iva_condition: string | null;
  fiscal_address: string | null;
  sale_point: string | null;
  gross_income: string | null;
  activity_start_date: string | null;
  invoice_footer_text: string | null;
  print_paper_size: "ticket_80mm" | "a5" | "a4" | null;
};

export default async function ConfiguracionFacturacionPage() {
  const tenant = await requireConfigurationTenant("/configuracion/facturacion");
  const settings = await loadInvoiceSettings(tenant.id);

  return (
    <>
      <PageHeader
        title="Facturacion e impresion"
        description="Configura los datos fiscales y el tamano preferido de comprobante."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="grid max-w-4xl gap-4 pb-6">
        <div>
          <Button asChild variant="outline" className="h-11 gap-2 px-4 text-base">
            <Link href="/configuracion">Volver a Configuracion</Link>
          </Button>
        </div>
        <p className="rounded-md border border-primary/30 bg-card p-3 text-sm font-semibold text-muted-foreground">
          Estos datos quedaran guardados. La aplicacion del tamano de impresion
          a los comprobantes se hara en una proxima etapa.
        </p>
        <FacturacionForm settings={settings} />
      </div>
    </>
  );
}

async function loadInvoiceSettings(
  tenantId: string
): Promise<TenantInvoiceSettingsConfig> {
  const supabase = getSupabaseServerClient();
  const [tenantResult, settingsResult] = await Promise.all([
    supabase
      .from("tenants")
      .select("name,business_name,tax_id,address")
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenant_invoice_settings")
      .select(
        "legal_name,cuit,iva_condition,fiscal_address,sale_point,gross_income,activity_start_date,invoice_footer_text,print_paper_size"
      )
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  if (tenantResult.error || !tenantResult.data) {
    throw new Error("No se pudieron cargar los datos del negocio.");
  }

  if (settingsResult.error) {
    throw new Error("No se pudo cargar la configuracion fiscal.");
  }

  const tenant = tenantResult.data as TenantFiscalFallbackRow;
  const settings = settingsResult.data as TenantInvoiceSettingsRow | null;

  return {
    legal_name: settings?.legal_name ?? tenant.business_name ?? tenant.name,
    cuit: settings?.cuit ?? tenant.tax_id ?? "",
    iva_condition: settings?.iva_condition ?? "",
    fiscal_address: settings?.fiscal_address ?? tenant.address ?? "",
    sale_point: settings?.sale_point ?? "",
    gross_income: settings?.gross_income ?? "",
    activity_start_date: settings?.activity_start_date ?? "",
    invoice_footer_text: settings?.invoice_footer_text ?? "",
    print_paper_size: settings?.print_paper_size ?? "a4",
  };
}
