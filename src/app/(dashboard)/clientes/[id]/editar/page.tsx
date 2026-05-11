import { notFound } from "next/navigation";

import { CustomerForm, type CustomerFormValue } from "@/components/clientes/customer-form";
import { PageHeader } from "@/components/shell/page-header";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

type EditCustomerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarClientePage({ params }: EditCustomerPageProps) {
  const { id } = await params;
  const tenant = getCurrentTenant();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,email,address,notes")
    .eq("tenant_id", tenant.id)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const customer = data as unknown as CustomerFormValue;

  return (
    <>
      <PageHeader
        title="Editar cliente"
        description="Actualiza los datos de contacto sin tocar su historial."
        backHref={`/clientes/${customer.id}`}
        backLabel="Volver al cliente"
      />
      <CustomerForm customer={customer} />
    </>
  );
}
