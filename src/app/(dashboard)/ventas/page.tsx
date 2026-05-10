import { ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export default function VentasPage() {
  return (
    <>
      <PageHeader
        title="Ventas"
        description="Registra operaciones del mostrador con pasos simples y visibles."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <EmptyState
        icon={ShoppingCart}
        title="Ventas preparadas"
        text="Aca se conectara el registro simple de ventas cuando el modulo este listo."
        actionHref="/clientes"
        actionLabel="Ver clientes"
      />
    </>
  );
}
