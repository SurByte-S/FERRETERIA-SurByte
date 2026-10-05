"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  clearDiscardedOfflineQueueItems,
  clearSyncedOfflineQueueItems,
  discardOfflineQueueItem,
  listOfflineQueueItems,
  type OfflineQueueItem,
  type OfflineQueueItemStatus,
  type OfflineQueueItemType,
} from "@/lib/offline/offline-queue-store";

type OfflineSyncPanelProps = {
  tenantId: string;
  tenantName: string;
};

const typeLabels: Record<OfflineQueueItemType, string> = {
  quote_create: "Presupuesto nuevo",
  quote_update: "Presupuesto actualizado",
  sale_create: "Venta",
};

const statusLabels: Record<OfflineQueueItemStatus, string> = {
  pending: "Pendiente",
  syncing: "Sincronizando",
  failed: "Con error",
  synced: "Sincronizada",
  discarded: "Descartada",
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function displayValue(value: string | null | undefined) {
  const cleanValue = value?.trim();

  return cleanValue ? cleanValue : "-";
}

export function OfflineSyncPanel({
  tenantId,
  tenantName,
}: OfflineSyncPanelProps) {
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const nextItems = await listOfflineQueueItems(tenantId);
      setItems(nextItems);
    } catch {
      setItems([]);
      setMessage("No se pudo leer la cola offline de este equipo.");
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    let isMounted = true;

    listOfflineQueueItems(tenantId)
      .then((nextItems) => {
        if (isMounted) {
          setItems(nextItems);
        }
      })
      .catch(() => {
        if (isMounted) {
          setItems([]);
          setMessage("No se pudo leer la cola offline de este equipo.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  const summary = useMemo(() => {
    return items.reduce(
      (current, item) => {
        if (item.status === "pending" || item.status === "syncing") {
          current.pending += 1;
        }

        if (item.status === "failed") {
          current.failed += 1;
        }

        return current;
      },
      { failed: 0, pending: 0 }
    );
  }, [items]);

  const hasDiscardedItems = items.some((item) => item.status === "discarded");
  const hasSyncedItems = items.some((item) => item.status === "synced");

  async function discardItem(item: OfflineQueueItem) {
    const confirmed = window.confirm(
      "Esta operacion pendiente se descartara de este equipo. No se enviara al sistema."
    );

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    setMessage(null);

    try {
      await discardOfflineQueueItem(item.id, tenantId);
      await loadItems();
      setMessage("Operacion descartada.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo descartar la operacion."
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function clearDiscardedItems() {
    const confirmed = window.confirm(
      "Se eliminaran definitivamente las operaciones descartadas de este equipo."
    );

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    setMessage(null);

    try {
      const deletedCount = await clearDiscardedOfflineQueueItems(tenantId);
      await loadItems();
      setMessage(`Operaciones descartadas eliminadas: ${deletedCount}.`);
    } catch {
      setMessage("No se pudieron limpiar las operaciones descartadas.");
    } finally {
      setIsMutating(false);
    }
  }

  async function clearSyncedItems() {
    const confirmed = window.confirm(
      "Se eliminaran definitivamente las operaciones ya sincronizadas de este equipo."
    );

    if (!confirmed) {
      return;
    }

    setIsMutating(true);
    setMessage(null);

    try {
      const deletedCount = await clearSyncedOfflineQueueItems(tenantId);
      await loadItems();
      setMessage(`Operaciones sincronizadas eliminadas: ${deletedCount}.`);
    } catch {
      setMessage("No se pudieron limpiar las operaciones sincronizadas.");
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-muted-foreground">{tenantName}</p>
            <h2 className="mt-1 text-xl font-bold leading-tight">
              Operaciones pendientes
            </h2>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              Esta pantalla va a mostrar operaciones guardadas sin internet.
              Todavia no se sincroniza automaticamente.
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              En esta fase todavia no se crean presupuestos offline.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadItems()}
            disabled={isLoading || isMutating}
            className="h-10 w-full justify-center gap-2 px-4 text-sm font-semibold md:w-auto"
          >
            {isLoading ? (
              <RefreshCw className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="size-4" aria-hidden="true" />
            )}
            Actualizar lista
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm font-bold">
          <span className="rounded-md border border-border bg-secondary px-3 py-1">
            Pendientes: {summary.pending}
          </span>
          <span className="rounded-md border border-border bg-secondary px-3 py-1">
            Fallidas: {summary.failed}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {hasDiscardedItems ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void clearDiscardedItems()}
              disabled={isLoading || isMutating}
              className="h-9 px-3 text-sm font-semibold"
            >
              Limpiar descartadas
            </Button>
          ) : null}
          {hasSyncedItems ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => void clearSyncedItems()}
              disabled={isLoading || isMutating}
              className="h-9 px-3 text-sm font-semibold"
            >
              Limpiar sincronizadas
            </Button>
          ) : null}
        </div>

        <p className="mt-3 text-sm font-semibold text-muted-foreground">
          Reintento disponible en proxima version.
        </p>

        {message ? (
          <p className="mt-3 text-sm font-bold text-foreground">{message}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        {items.length === 0 && !isLoading ? (
          <div className="p-6">
            <p className="text-base font-bold">
              No hay operaciones pendientes en este equipo.
            </p>
          </div>
        ) : null}

        {isLoading ? (
          <div className="p-6">
            <p className="text-base font-bold text-muted-foreground">
              Cargando operaciones guardadas...
            </p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50 text-left text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Fecha</th>
                  <th className="px-3 py-3">Intentos</th>
                  <th className="px-3 py-3">Ultimo error</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const canDiscard =
                    item.status === "pending" || item.status === "failed";

                  return (
                    <tr key={item.id} className="align-top">
                      <td className="px-3 py-3 font-bold">
                        {typeLabels[item.type]}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {statusLabels[item.status]}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {item.attempt_count}
                      </td>
                      <td className="max-w-xl px-3 py-3 font-semibold text-muted-foreground">
                        {displayValue(item.last_error)}
                      </td>
                      <td className="px-3 py-3">
                        {canDiscard ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void discardItem(item)}
                            disabled={isLoading || isMutating}
                            className="h-8 px-3 text-sm font-semibold"
                          >
                            Descartar
                          </Button>
                        ) : (
                          <span className="text-sm font-semibold text-muted-foreground">
                            -
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
