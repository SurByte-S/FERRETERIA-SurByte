import { Users } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function ClientesPage() {
  return (
    <>
      <PageHeader
        title="Clientes"
        description="Guarda datos utiles de compradores frecuentes sin pedir informacion innecesaria."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <EmptyState
        icon={Users}
        title="Clientes preparados"
        text="La estructura ya permite sumar busqueda, historial de compras y cuentas corrientes."
        actionHref="/productos"
        actionLabel="Buscar productos"
      />
    </>
  );
}
