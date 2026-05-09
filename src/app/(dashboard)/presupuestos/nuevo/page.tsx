import { NewQuoteForm } from "@/components/presupuestos/new-quote-form";
import { PageHeader } from "@/components/shell/page-header";

export default async function NuevoPresupuestoPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;

  return (
    <>
      <PageHeader
        title="Nuevo presupuesto"
        description="Carga cliente, busca productos y revisa el total sin cambiar de pantalla."
        backHref="/presupuestos"
        backLabel="Volver a presupuestos"
      />
      <NewQuoteForm initialSku={sku} />
    </>
  );
}
