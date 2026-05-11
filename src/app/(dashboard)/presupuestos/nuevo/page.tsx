import { NewQuoteForm } from "@/components/presupuestos/new-quote-form";
import type { QuoteCustomerOption } from "@/components/presupuestos/quote-types";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;
  const tenant = getCurrentTenant();
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("customers")
    .select("id,name,phone,email,address")
    .eq("tenant_id", tenant.id)
    .order("name")
    .limit(300);
  const customers = (data ?? []) as unknown as QuoteCustomerOption[];

  return (
    <>
      <PageHeader
        title="Nuevo presupuesto"
        description="Carga cliente, busca productos y revisa el total sin cambiar de pantalla."
        backHref="/presupuestos"
        backLabel="Volver a presupuestos"
      />
      <NewQuoteForm initialSku={sku} customers={customers} />
    </>
  );
}
