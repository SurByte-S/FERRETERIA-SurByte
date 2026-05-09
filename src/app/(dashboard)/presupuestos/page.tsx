import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PresupuestoSimple } from "@/components/presupuestos/presupuesto-simple";

export default function PresupuestosPage() {
  return (
    <>
      <PageHeader
        title="Presupuesto"
        description="Arma una propuesta clara para el cliente antes de confirmar una venta."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <PresupuestoSimple />
        <EmptyState
          icon={ClipboardList}
          title="Paso inicial"
          text="Esta pantalla deja preparado el flujo para agregar productos y calcular totales."
          actionHref="/ventas"
          actionLabel="Ir a ventas"
        />
      </div>
    </>
  );
}
