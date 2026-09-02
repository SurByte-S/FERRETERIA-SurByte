"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw } from "lucide-react";

import {
  OFFLINE_ACTION_MESSAGE,
  isBrowserOffline,
} from "@/components/pwa/use-online-status";
import { Button } from "@/components/ui/button";
import {
  countOfflineProducts,
  getOfflineCatalogMeta,
  saveOfflineCatalog,
  type OfflineCatalogMeta,
  type OfflineCatalogProduct,
} from "@/lib/offline/catalog-store";

type OfflineCatalogPanelProps = {
  tenantId: string;
  tenantName: string;
};

type OfflineCatalogResponse = {
  products: OfflineCatalogProduct[];
  nextOffset: number | null;
  hasMore: boolean;
  tenant: {
    id: string;
    name: string;
  };
  generatedAt: string;
};

function formatSavedAt(value: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function OfflineCatalogPanel({
  tenantId,
  tenantName,
}: OfflineCatalogPanelProps) {
  const [meta, setMeta] = useState<OfflineCatalogMeta | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMeta() {
      try {
        const [storedMeta, storedCount] = await Promise.all([
          getOfflineCatalogMeta(tenantId),
          countOfflineProducts(tenantId),
        ]);

        if (!isMounted) {
          return;
        }

        if (storedMeta) {
          setMeta({
            ...storedMeta,
            product_count: storedCount,
          });
        }
      } catch {
        if (isMounted) {
          setMeta(null);
        }
      }
    }

    loadMeta();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  async function updateCatalog() {
    if (isBrowserOffline()) {
      setMessage(OFFLINE_ACTION_MESSAGE);
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setProgress("Descargando productos...");

    try {
      const products: OfflineCatalogProduct[] = [];
      let offset = 0;
      let generatedAt: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const response = await fetch(
          `/api/offline/catalog?offset=${offset}&pageSize=1000`,
          { cache: "no-store" }
        );

        if (!response.ok) {
          throw new Error("No se pudo descargar el catalogo.");
        }

        const payload = (await response.json()) as OfflineCatalogResponse;

        if (payload.tenant.id !== tenantId) {
          throw new Error("El catalogo recibido no corresponde al negocio actual.");
        }

        products.push(...payload.products);
        generatedAt = payload.generatedAt;
        setProgress(`Descargando productos... ${products.length}`);
        hasMore = payload.hasMore && payload.nextOffset !== null;
        offset = payload.nextOffset ?? offset;
      }

      setProgress("Guardando catalogo...");

      const nextMeta = await saveOfflineCatalog({
        tenant: {
          id: tenantId,
          name: tenantName,
        },
        products,
        generatedAt,
      });

      setMeta(nextMeta);
      setMessage("Catalogo actualizado para usar sin internet.");
    } catch {
      setMessage("No se pudo actualizar el catalogo offline.");
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-bold leading-tight">
              Catalogo sin internet
            </h2>
          </div>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Guarda una copia de productos en este equipo para consultar cuando no
            haya conexion.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
            {meta ? (
              <>
                <span>Ultima actualizacion: {formatSavedAt(meta.saved_at)}</span>
                <span>Productos guardados: {meta.product_count}</span>
              </>
            ) : (
              <span>Todavia no hay catalogo guardado en este equipo.</span>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-foreground">
            Precio y stock pueden cambiar si no actualizas el catalogo.
          </p>
          {message ? (
            <p className="mt-2 text-sm font-bold text-foreground">{message}</p>
          ) : null}
          {progress ? (
            <p className="mt-2 text-sm font-bold text-primary">{progress}</p>
          ) : null}
        </div>
        <Button
          type="button"
          onClick={updateCatalog}
          disabled={isSaving}
          className="h-12 w-full justify-center gap-2 px-5 text-base font-semibold md:w-auto"
        >
          <RefreshCw
            className={isSaving ? "size-5 animate-spin" : "size-5"}
            aria-hidden="true"
          />
          {isSaving
            ? "Actualizando catalogo"
            : "Actualizar catalogo para usar sin internet"}
        </Button>
      </div>
    </section>
  );
}
