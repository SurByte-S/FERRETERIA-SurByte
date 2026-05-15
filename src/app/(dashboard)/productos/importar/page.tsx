import { ShieldAlert, TriangleAlert } from "lucide-react";

import { ImportProductsForm } from "@/components/productos/import-products-form";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import {
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

export default async function ImportarProductosPage() {
  try {
    await requireTenantRole(["owner", "admin"]);
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return (
        <>
          <PageHeader
            title="Importar productos"
            description="Esta herramienta es solo para encargados."
            backHref="/stock"
            backLabel="Volver a Stock"
          />
          <EmptyState
            icon={ShieldAlert}
            title="No tenes permiso para importar productos."
            text="La importacion modifica muchos productos a la vez. Pedile a un encargado que lo haga."
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
        title="Importar productos"
        description="Carga un CSV, revisa una vista previa y actualiza el catalogo sin duplicar SKU."
        backHref="/productos"
        backLabel="Volver a productos"
      />
      <Card className="border-amber-300 bg-amber-50 text-amber-950">
        <CardContent className="flex gap-3 p-5 text-lg font-semibold">
          <TriangleAlert className="mt-1 size-6 shrink-0" aria-hidden="true" />
          <p>
            La importacion modifica productos en cantidad. Usar solo si estas
            seguro.
          </p>
        </CardContent>
      </Card>
      <ImportProductsForm />
    </>
  );
}
