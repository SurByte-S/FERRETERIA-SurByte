import { CustomerForm } from "@/components/clientes/customer-form";
import { PageHeader } from "@/components/shell/page-header";

export default function NuevoClientePage() {
  return (
    <>
      <PageHeader
        title="Nuevo cliente"
        description="Guarda los datos basicos para presupuestos, ventas y cuenta corriente."
        backHref="/clientes"
        backLabel="Volver a clientes"
      />
      <CustomerForm />
    </>
  );
}
