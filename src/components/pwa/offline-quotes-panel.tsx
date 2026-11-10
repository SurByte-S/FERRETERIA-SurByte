"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useOnlineStatus } from "@/components/pwa/use-online-status";
import { Button } from "@/components/ui/button";
import {
  countOfflineQuoteCreateItems,
  listOfflineQuoteCreateItems,
  type OfflineQueueItem,
} from "@/lib/offline/offline-queue-store";
import { validateOfflineQuoteCreatePayload } from "@/lib/offline/offline-quote-create";

type OfflineQuotesPanelProps = {
  tenantId: string;
  userId: string;
  canView: boolean;
  refreshKey?: number;
};

const LIST_LIMIT = 50;
const statusLabels: Partial<Record<OfflineQueueItem["status"], string>> = {
  pending: "Pendiente",
  failed: "Con error",
  syncing: "Sincronizando",
};

function formatDate(value: string) {
  if (typeof value !== "string") {
    return "Fecha no disponible";
  }

  const date = new Date(value);

  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : "Fecha no disponible";
}

function QuoteSummary({ item }: { item: OfflineQueueItem }) {
  let payload: ReturnType<typeof validateOfflineQuoteCreatePayload> | null = null;

  try {
    payload = validateOfflineQuoteCreatePayload(item.payload);
  } catch {
    // Keep unreadable records visible without exposing their raw contents.
  }

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap justify-between gap-2 text-sm font-bold">
        <span>{formatDate(item.created_at)}</span>
        <span>{statusLabels[item.status] ?? "Estado no disponible"}</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Referencia local: {typeof item.id === "string" ? item.id.slice(0, 8) : "No disponible"}
      </p>
      {payload ? (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="break-words font-bold">{payload.customer.name || "Sin cliente"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Renglones</dt>
            <dd className="font-bold">{payload.lines.length}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total guardado</dt>
            <dd className="font-bold">
              {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(payload.total)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm font-semibold">No se pudieron leer los datos de este presupuesto</p>
      )}
      {item.status === "syncing" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Solo es un estado registrado. Esta version no ejecuta sincronizacion.
        </p>
      ) : null}
    </li>
  );
}

export function OfflineQuotesPanel(props: OfflineQuotesPanelProps) {
  if (!props.canView) {
    return null;
  }

  // Remount on identity changes so old data/errors never reach the new render.
  // This does not detect account changes in tabs retaining stale server props:
  // session invalidation needs a separate security phase before real sync.
  // The POS must already be loaded; this does not enable full offline reloads.
  return <AuthorizedOfflineQuotesPanel key={`${props.tenantId}:${props.userId}`} {...props} />;
}

function AuthorizedOfflineQuotesPanel({
  tenantId,
  userId,
  refreshKey = 0,
}: OfflineQuotesPanelProps) {
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOnline = useOnlineStatus();
  const [isOpen, setIsOpen] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [snapshot, setSnapshot] = useState({
    key: "",
    count: null as number | null,
    items: [] as OfflineQueueItem[],
    hasMore: false,
    error: false,
  });
  const readKey = `${refreshKey}:${reloadVersion}:${isOpen}`;
  const isLoading = snapshot.key !== readKey;

  useEffect(() => {
    let cancelled = false;
    const request = isOpen
      ? listOfflineQuoteCreateItems(tenantId, userId, { limit: LIST_LIMIT })
      : countOfflineQuoteCreateItems(tenantId, userId).then((total) => ({
          total, items: [] as OfflineQueueItem[], hasMore: false,
        }));

    request.then((result) => {
      if (!cancelled) {
        setSnapshot({ key: readKey, count: result.total, items: result.items, hasMore: result.hasMore, error: false });
      }
    }).catch(() => {
      if (!cancelled) {
        setSnapshot({ key: readKey, count: null, items: [], hasMore: false, error: true });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tenantId, userId, isOpen, readKey]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        setReloadVersion((current) => current + 1);
      }
    }

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  function openPanel() {
    dialogRef.current?.showModal();
    setIsOpen(true);
  }

  function onClose() {
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        onClick={openPanel}
        aria-haspopup="dialog"
        className="h-11 w-full px-3 text-sm font-bold sm:w-auto"
      >
        {snapshot.error
          ? "Presupuestos pendientes: No disponible"
          : `Presupuestos pendientes (${snapshot.count ?? "..."})`}
      </Button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={onClose}
        className="m-auto max-h-[90dvh] w-[95vw] max-w-3xl overflow-y-auto rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xl backdrop:bg-black/50 sm:p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-bold">Presupuestos pendientes</h2>
          <Button type="button" variant="outline" onClick={() => dialogRef.current?.close()} className="h-10 px-4">
            Cerrar
          </Button>
        </div>
        <p id={descriptionId} className="mt-3 text-sm font-semibold">
          Guardado solamente en este equipo. Todavia no esta sincronizado con el sistema.
        </p>
        <div className="my-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-bold">{isOnline ? "Con conexion" : "Sin conexion"}</span>
          <Button type="button" variant="outline" disabled={isLoading} onClick={() => setReloadVersion((current) => current + 1)} className="h-10 px-3">
            Actualizar lista
          </Button>
        </div>
        {isLoading ? (
          <p role="status" className="py-4 text-sm">Leyendo presupuestos de este equipo...</p>
        ) : snapshot.error ? (
          <p role="alert" className="py-4 text-sm font-bold">No se pudieron leer los presupuestos pendientes de este equipo.</p>
        ) : (
          <>
            {snapshot.count === 0 ? (
              <p className="py-4 text-sm">No tenes presupuestos pendientes guardados en este equipo.</p>
            ) : null}
            {snapshot.hasMore ? (
              <p className="mb-3 text-sm font-semibold">
                Mostrando los {snapshot.items.length} mas recientes de {snapshot.count} presupuestos pendientes.
              </p>
            ) : null}
            <ul className="grid gap-3">
              {snapshot.items.map((item) => <QuoteSummary key={item.id} item={item} />)}
            </ul>
          </>
        )}
      </dialog>
    </>
  );
}
