"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { reviewOfflineQuoteAction } from "@/app/(dashboard)/configuracion/sincronizacion/review-actions";
import { captureOfflineSession } from "@/lib/offline/offline-session";
import type { OfflineQueueItem } from "@/lib/offline/offline-queue-store";
import type { OfflineQuoteCommercialResult } from "@/lib/offline/validate-quote-commercial";
import type { IssueCode } from "@/lib/offline/quote-commercial-core";
import { QuoteReviewRequest, type ReviewState } from "@/lib/offline/quote-review-request";
import { useOnlineStatus } from "./use-online-status";

const warnings: Record<IssueCode, string> = {
  price_difference: "El precio actual es diferente del guardado.",
  name_difference: "Cambió el nombre comercial.",
  presentation_difference: "Cambió la presentación o su nombre.",
  factor_difference: "Cambió la cantidad de unidades de la presentación.",
  unit_difference: "Cambió la unidad de venta.",
  product_missing: "El producto ya no está disponible.",
  product_inactive: "El producto está inactivo.",
  presentation_missing: "La presentación ya no está disponible para este producto.",
  presentation_inactive: "La presentación está inactiva.",
  presentation_ambiguous: "No se pudo determinar una presentación única.",
  price_missing: "Falta un precio válido en el catálogo.",
  catalog_invalid: "Los datos actuales del catálogo no permiten calcular este renglón.",
  rounding_difference: "La suma de renglones redondeados difiere del total guardado.",
  customer_missing: "El cliente ya no está disponible para esta ferretería.",
  amount_out_of_range: "El importe supera el límite admitido.",
};

function amount(value: string) {
  const [whole, fraction = "00"] = value.split(".");
  return `$ ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}
function delta(current: string, previous: string) {
  const cents = (v: string) => BigInt(v.replace(".", ""));
  const difference = cents(current) - cents(previous);
  const absolute = difference < BigInt(0) ? -difference : difference;
  const value = `${absolute / BigInt(100)}.${String(absolute % BigInt(100)).padStart(2, "0")}`;
  return `${difference > BigInt(0) ? "+" : difference < BigInt(0) ? "−" : ""}${amount(value)}`;
}

export function CommercialReviewResult({ result }: { result: OfflineQuoteCommercialResult }) {
  if (!("lines" in result)) {
    const messages = {
      unauthorized: "La sesión no tiene permiso para revisar este pendiente. Abrí una pantalla nueva y verificá tu cuenta.",
      contract_error: "No se pudo revisar este pendiente: los datos están incompletos, son incompatibles o superan el límite de revisión (50 renglones, 20 combinaciones de producto y presentación, 128.000 caracteres). No se modificó el presupuesto.",
      verification_unavailable: "No se pudo consultar el catálogo o verificar la sesión. Verificá la conexión e intentá nuevamente.",
    };
    return <p role="alert">{messages[result.status]}</p>;
  }
  return <>
    <p className="font-bold" role="status">{result.status === "blocked" ? "Hay problemas que bloquearían el envío." : result.status === "differences" ? "Hay diferencias respecto del presupuesto guardado." : "Sin diferencias comerciales detectadas."}</p>
    <ol className="mt-3 grid gap-3">
      {result.lines.map((line) => <li key={line.position} className="rounded border p-3 text-sm">
        <p className="font-bold">{line.position}. {line.offline.name}</p>
        {line.current && line.current.name !== line.offline.name && <p>Nombre actual: {line.current.name}</p>}
        <p>Presentación guardada: {line.offline.saleUnitName} · Cantidad: {line.offline.quantity} · Factor: {line.offline.factor} · Unidad: {line.offline.unit}</p>
        {line.current && <p>Presentación actual: {line.current.saleUnitName} · Factor: {line.current.factor} · Unidad: {line.current.unit}</p>}
        <dl className="mt-2 grid grid-cols-2 gap-2">
          <div><dt>Precio offline</dt><dd>{amount(line.offline.unitPrice)}</dd></div>
          <div><dt>Precio actual de venta</dt><dd>{line.current ? amount(line.current.effectivePrice) : "No disponible"}</dd></div>
          <div><dt>Importe offline del renglón</dt><dd>{amount(line.offline.total)}</dd></div>
          <div><dt>Importe actual del renglón</dt><dd>{line.current ? amount(line.current.total) : "No disponible"}</dd></div>
          <div><dt>Diferencia del renglón</dt><dd>{line.current ? delta(line.current.total, line.offline.total) : "No calculable"}</dd></div>
          <div><dt>Precio base actual del producto</dt><dd>{line.current?.productPrice !== null && line.current?.productPrice !== undefined ? amount(line.current.productPrice) : "No disponible"}</dd></div>
        </dl>
        {result.issues.filter((issue) => issue.position === line.position).map((issue) => <p key={issue.code} className="mt-2 font-semibold">{issue.blocking ? "Bloqueo: " : "Advertencia: "}{warnings[issue.code]}</p>)}
      </li>)}
    </ol>
    <div className="mt-3 text-sm font-bold">
      <p>Total offline: {amount(result.totals.displayedOffline)}</p>
      <p>Suma de renglones offline redondeados: {amount(result.totals.roundedOfflineLines)}</p>
      <p>Total actualizado: {result.totals.current === null ? "No calculable: hay renglones inválidos." : amount(result.totals.current)}</p>
    </div>
    {result.issues.filter((issue) => !issue.position).map((issue) => <p key={issue.code} className="mt-2 font-semibold">{issue.blocking ? "Bloqueo: " : "Advertencia: "}{warnings[issue.code]}</p>)}
  </>;
}

export function OfflineQuoteReview({ item, tenantId, userId }: { item: OfflineQueueItem; tenantId: string; userId: string }) {
  const online = useOnlineStatus();
  const [state, setState] = useState<ReviewState>({ status: "closed" });
  const [request] = useState(() => new QuoteReviewRequest(setState));
  useEffect(() => () => request.cancel(), [request]);
  const review = () => request.run(
    () => captureOfflineSession(tenantId, userId),
    () => reviewOfflineQuoteAction(JSON.stringify(item)),
  );
  return <div className="mt-3">
    <Button type="button" variant="outline" disabled={!online || state.status === "loading"} onClick={() => void review()}>
      {state.status === "loading" ? "Consultando precios…" : state.status === "closed" ? "Revisar precios" : "Volver a revisar precios"}
    </Button>
    {!online && <p className="mt-2 text-sm">Necesitás conexión para consultar los precios actuales.</p>}
    {state.status !== "closed" && <section aria-label="Revisión comercial" className="mt-3 rounded border p-3">
      <p className="mb-3 text-sm">Solo revisión. La sincronización todavía no está habilitada. El pendiente conserva sus datos originales. Al guardar en una fase futura se usarán los precios actuales, con confirmación explícita; si cambia el catálogo, habrá que revisar nuevamente.</p>
      <p className="mb-3 text-sm text-muted-foreground">Los valores corresponden a esta consulta y pueden cambiar. Esta revisión no reserva precios ni constituye una aprobación.</p>
      {state.status === "loading" && <p role="status">Consultando el catálogo actual…</p>}
      {state.status === "error" && <p role="alert">{state.message}</p>}
      {state.status === "result" && <CommercialReviewResult result={state.result} />}
      <Button type="button" variant="outline" className="mt-3" onClick={() => { request.cancel(); setState({ status: "closed" }); }}>Cerrar revisión</Button>
    </section>}
  </div>;
}
