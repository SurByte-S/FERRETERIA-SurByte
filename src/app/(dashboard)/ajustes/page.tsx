import {
  InvoiceSettingsForm,
  type InvoiceSettingsFormValues,
} from "@/components/ajustes/invoice-settings-form";
import { PageHeader } from "@/components/shell/page-header";
import { defaultInvoiceSettings } from "@/lib/brand/ferreteria-guemes";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type TenantBusinessRow = {
  name: string;
  business_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type InvoiceSettingsRow = {
  fantasy_name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  iva_condition: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  receipt_footer: string | null;
  receipt_message: string | null;
};

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function buildInitialValues(
  tenantDetails: TenantBusinessRow | null,
  settings: InvoiceSettingsRow | null
): InvoiceSettingsFormValues {
  return {
    fantasyName:
      clean(settings?.fantasy_name) ||
      clean(tenantDetails?.name) ||
      defaultInvoiceSettings.fantasyName,
    legalName:
      clean(settings?.legal_name) ||
      clean(tenantDetails?.business_name) ||
      defaultInvoiceSettings.legalName,
    taxId:
      clean(settings?.tax_id) ||
      clean(tenantDetails?.tax_id) ||
      defaultInvoiceSettings.taxId,
    ivaCondition:
      clean(settings?.iva_condition) || defaultInvoiceSettings.ivaCondition,
    address:
      clean(settings?.address) ||
      clean(tenantDetails?.address) ||
      defaultInvoiceSettings.address,
    city: clean(settings?.city) || defaultInvoiceSettings.city,
    province: clean(settings?.province) || defaultInvoiceSettings.province,
    phone:
      clean(settings?.phone) ||
      clean(tenantDetails?.phone) ||
      defaultInvoiceSettings.phone,
    email:
      clean(settings?.email) ||
      clean(tenantDetails?.email) ||
      defaultInvoiceSettings.email,
    receiptFooter:
      clean(settings?.receipt_footer) || defaultInvoiceSettings.receiptFooter,
    receiptMessage:
      clean(settings?.receipt_message) || defaultInvoiceSettings.receiptMessage,
  };
}

export default async function AjustesPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [settingsResult, tenantResult] = await Promise.all([
    supabase
      .from("tenant_invoice_settings")
      .select(
        "fantasy_name,legal_name,tax_id,iva_condition,address,city,province,phone,email,receipt_footer,receipt_message"
      )
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    supabase
      .from("tenants")
      .select("name,business_name,tax_id,phone,email,address")
      .eq("id", tenant.id)
      .maybeSingle(),
  ]);
  const initialValues = buildInitialValues(
    tenantResult.data as TenantBusinessRow | null,
    settingsResult.data as InvoiceSettingsRow | null
  );

  return (
    <>
      <PageHeader
        title="Datos de factura"
        description="Datos que aparecen al imprimir ventas, presupuestos y comprobantes."
        backHref="/inicio"
        backLabel="Volver a vender"
      />

      <InvoiceSettingsForm initialValues={initialValues} />
    </>
  );
}
