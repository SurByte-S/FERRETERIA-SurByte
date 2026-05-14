import { NewQuoteForm } from "@/components/presupuestos/new-quote-form";
import type { QuoteCustomerOption } from "@/components/presupuestos/quote-types";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;
  const tenant = await requireTenant();
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
        title="Venta rápida"
        description="Buscá por código, nombre o escaneá el código de barras. El cliente es opcional; agregalo solo si necesitás cuenta corriente o seguimiento."
        backHref="/presupuestos"
        backLabel="Volver a presupuestos"
      />
      <NewQuoteForm initialSku={sku} customers={customers} />
    </>
  );
}
