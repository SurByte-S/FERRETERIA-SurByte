import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { OfflineCatalogSearch } from "@/components/pwa/offline-catalog-search";
import { Button } from "@/components/ui/button";
import { requireTenant } from "@/lib/tenant";

export default async function OfflineStockPage() {
  const tenant = await requireTenant("stock-offline-page");

  return (
    <main className="grid gap-4">
      <Button asChild variant="outline" className="h-9 w-fit gap-1.5 px-3 text-sm">
        <Link href="/stock">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver a Stock
        </Link>
      </Button>
      <OfflineCatalogSearch tenantId={tenant.id} tenantName={tenant.name} />
    </main>
  );
}
