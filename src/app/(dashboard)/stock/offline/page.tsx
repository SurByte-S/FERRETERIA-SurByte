import { OfflineCatalogSearch } from "@/components/pwa/offline-catalog-search";
import { PageHeader } from "@/components/shell/page-header";
import { requireTenant } from "@/lib/tenant";

export default async function StockOfflinePage() {
  const tenant = await requireTenant("/stock/offline");

  return (
    <>
      <PageHeader
        title="Catalogo offline"
        eyebrow=""
        backHref="/stock"
        backLabel="Volver a Stock"
      />

      <OfflineCatalogSearch tenantId={tenant.id} tenantName={tenant.name} />
    </>
  );
}
