import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PresupuestoSimple } from "@/components/presupuestos/presupuesto-simple";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PresupuestosPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;

  return (
    <>
      <PageHeader
        title="Presupuesto"
        description="Arma una propuesta clara para el cliente antes de confirmar una venta."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />
      <div className="mb-6">
        <Button asChild className="h-14 gap-3 px-6 text-lg">
          <Link href={sku ? `/presupuestos/nuevo?sku=${encodeURIComponent(sku)}` : "/presupuestos/nuevo"}>
            <ClipboardList className="size-6" aria-hidden="true" />
            Nuevo presupuesto
          </Link>
        </Button>
      </div>
      {sku ? (
        <Card className="mb-6 border-primary/40">
          <CardHeader>
            <CardTitle>Producto seleccionado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg">
              Se inicio el presupuesto con el producto codigo{" "}
              <span className="font-mono font-semibold">{sku}</span>.
            </p>
          </CardContent>
        </Card>
      ) : null}
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
