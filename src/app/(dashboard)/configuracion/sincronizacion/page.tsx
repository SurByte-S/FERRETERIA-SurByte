import { OfflineSyncPanel } from "@/components/pwa/offline-sync-panel";
import { PageHeader } from "@/components/shell/page-header";

import { requireConfigurationTenant } from "../access";

export default async function ConfiguracionSincronizacionPage() {
  const tenant = await requireConfigurationTenant(
    "/configuracion/sincronizacion"
  );

  return (
    <>
      <PageHeader
        title="Sincronizacion sin internet"
        description="Revisa operaciones guardadas en este equipo para sincronizar cuando vuelva internet."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <div className="mb-4 max-w-4xl rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <p className="text-sm font-semibold text-muted-foreground">
          Todavia no se crean presupuestos offline en esta fase y todavia no se
          sincroniza automaticamente.
        </p>
      </div>

      <OfflineSyncPanel tenantId={tenant.id} tenantName={tenant.name} />
    </>
  );
}
