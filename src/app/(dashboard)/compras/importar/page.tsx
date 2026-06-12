import { ShieldAlert, TriangleAlert } from "lucide-react";

import { ImportPurchaseForm } from "@/components/compras/import-purchase-form";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export default async function ImportarCompraPage() {
  try {
    await requireTenantRole(["owner", "admin"]);
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return (
        <>
          <PageHeader
            title="Importar compra"
            description="Esta herramienta es solo para encargados."
            backHref="/stock"
            backLabel="Volver a Stock"
          />
          <EmptyState
            icon={ShieldAlert}
            title="No tenes permiso para importar compras."
            text="La importacion de compras puede sumar stock. Pedile a un encargado que lo haga."
            actionHref="/stock"
            actionLabel="Ir a Stock"
          />
        </>
      );
    }

    throw error;
  }

  return (
    <>
      <PageHeader
        title="Importar compra"
        description="Revisa proveedor, comprobante y productos antes de sumar stock."
        backHref="/stock"
        backLabel="Volver a Stock"
      />
      <Card className="border-amber-300 bg-amber-50 text-amber-950">
        <CardContent className="flex gap-3 p-5 text-base font-semibold">
          <TriangleAlert className="mt-1 size-5 shrink-0" aria-hidden="true" />
          <p>
            El dry-run no modifica stock. La compra solo se aplica cuando un
            encargado confirma filas sin conflictos.
          </p>
        </CardContent>
      </Card>
      <ImportPurchaseForm />
    </>
  );
}
