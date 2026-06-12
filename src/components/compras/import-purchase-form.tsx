"use client";

import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Search,
  Upload,
} from "lucide-react";

import {
  confirmPurchaseImportAction,
  previewPurchaseImportAction,
  type PurchaseImportState,
} from "@/app/(dashboard)/compras/importar/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PurchaseImportDecision, PurchaseImportRow } from "@/lib/purchases/import";

const initialState: PurchaseImportState = {
  ok: false,
  message: "",
  preview: null,
};

const decisionLabels: Record<PurchaseImportDecision, string> = {
  choose_other: "Elegir otro",
  create_new: "Crear nuevo",
  ignore: "Ignorar",
  match_existing: "Es el mismo producto",
};

function formatNumber(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 3,
  }).format(value);
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function nextStatusForDecision(
  row: PurchaseImportRow,
  decision: PurchaseImportDecision
): PurchaseImportRow["status"] {
  if (decision === "ignore") {
    return "ignored";
  }

  if (decision === "create_new") {
    return "new";
  }

  if (decision === "match_existing" && row.candidateProductId) {
    return "safe";
  }

  if (decision === "choose_other") {
    return "doubtful";
  }

  return row.status;
}

export function ImportPurchaseForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewPurchaseImportAction,
    initialState
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmPurchaseImportAction,
    initialState
  );
  const [fileName, setFileName] = useState("");
  const preview = previewState.preview;
  const previewKey = preview
    ? [
        preview.supplierName,
        preview.documentNumber,
        preview.fileName,
        preview.rows.length,
        preview.rows
          .map((row) =>
            [
              row.lineNumber,
              row.sku,
              row.barcode,
              row.supplierSku,
              row.description,
              row.quantity,
              row.unitCostWithTax,
            ].join(":")
          )
          .join("|"),
      ].join("|")
    : "";

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-6" aria-hidden="true" />
          </div>
          <CardTitle>Compra de proveedor</CardTitle>
          <CardDescription>
            Subi el archivo, revisa cada fila y confirma solo cuando no queden dudas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-semibold">
                <span>Proveedor</span>
                <input
                  name="supplierName"
                  defaultValue="Ferremax Quilmes"
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </label>
              <label className="grid gap-2 text-sm font-semibold">
                <span>Comprobante</span>
                <input
                  name="documentNumber"
                  defaultValue="#9-1267"
                  className="h-11 rounded-lg border border-input bg-background px-3 text-base"
                />
              </label>
            </div>

            <label className="grid cursor-pointer gap-3 rounded-lg border border-dashed border-border bg-background p-5">
              <span className="text-base font-bold">Archivo .xlsx o .csv</span>
              <input
                name="purchaseFile"
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) =>
                  setFileName(event.target.files?.[0]?.name ?? "")
                }
                className="text-base file:mr-4 file:h-11 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-base file:font-semibold file:text-primary-foreground"
              />
              <span className="text-sm font-semibold text-muted-foreground">
                {fileName || "Arrastra o selecciona el archivo de compra."}
              </span>
            </label>

            <Button
              type="submit"
              disabled={!fileName || previewPending}
              className="h-11 w-fit gap-2 px-5 text-base"
            >
              <Upload className="size-5" aria-hidden="true" />
              {previewPending ? "Generando dry-run..." : "Generar dry-run"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {previewState.message || confirmState.message ? (
        <p
          className={
            confirmState.ok || previewState.ok
              ? "rounded-lg border border-emerald-500/40 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
              : "rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900"
          }
        >
          {confirmState.message || previewState.message}
        </p>
      ) : null}

      {preview ? (
        <>
          <PurchaseImportReview
            key={previewKey}
            confirmAction={confirmAction}
            confirmPending={confirmPending}
            preview={preview}
          />
        </>
      ) : null}
    </div>
  );
}

function PurchaseImportReview({
  confirmAction,
  confirmPending,
  preview,
}: {
  confirmAction: (payload: FormData) => void;
  confirmPending: boolean;
  preview: NonNullable<PurchaseImportState["preview"]>;
}) {
  const [rows, setRows] = useState<PurchaseImportRow[]>(() => preview.rows);
  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.totalRows += 1;

          if (row.decision !== "ignore") {
            acc.totalUnits += row.quantity;
            acc.totalAmount += row.lineTotal ?? row.quantity * (row.unitCostWithTax ?? 0);
          }

          if (row.status === "safe") acc.safe += 1;
          if (row.status === "new") acc.new += 1;
          if (row.status === "doubtful") acc.doubtful += 1;
          if (row.status === "conflict") acc.conflicts += 1;
          if (row.status === "ignored") acc.ignored += 1;

          return acc;
        },
        {
          conflicts: 0,
          doubtful: 0,
          ignored: 0,
          new: 0,
          safe: 0,
          totalAmount: 0,
          totalRows: 0,
          totalUnits: 0,
        }
      ),
    [rows]
  );
  const canConfirm =
    rows.length > 0 &&
    rows.every((row) => row.status !== "conflict" && row.decision !== "choose_other");

  function updateDecision(rowIndex: number, decision: PurchaseImportDecision) {
    setRows((current) =>
      current.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              decision,
              status: nextStatusForDecision(row, decision),
            }
          : row
      )
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Dry-run</CardTitle>
          <CardDescription>
            {preview.supplierName} - {preview.documentNumber} - {preview.fileName}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <SummaryGrid summary={summary} />
          <form action={confirmAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input type="hidden" name="supplierName" value={preview.supplierName} />
            <input type="hidden" name="documentNumber" value={preview.documentNumber} />
            <input type="hidden" name="fileName" value={preview.fileName} />
            <input type="hidden" name="rows" value={JSON.stringify(rows)} />
            <Button
              type="submit"
              disabled={!canConfirm || confirmPending}
              className="h-11 gap-2 px-5 text-base"
            >
              <CheckCircle2 className="size-5" aria-hidden="true" />
              {confirmPending ? "Confirmando..." : "Confirmar compra"}
            </Button>
            <p className="text-sm font-semibold text-muted-foreground">
              {canConfirm
                ? "La confirmacion suma stock y registra movimientos purchase."
                : "Resolve filas dudosas o en conflicto antes de confirmar."}
            </p>
          </form>
        </CardContent>
      </Card>

      <PurchaseRowsTable rows={rows} onDecision={updateDecision} />
    </>
  );
}

function SummaryGrid({
  summary,
}: {
  summary: {
    conflicts: number;
    doubtful: number;
    ignored: number;
    new: number;
    safe: number;
    totalAmount: number;
    totalRows: number;
    totalUnits: number;
  };
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryBox label="Filas" value={summary.totalRows} />
      <SummaryBox label="Unidades" value={formatNumber(summary.totalUnits)} />
      <SummaryBox label="Total calculado" value={formatMoney(summary.totalAmount)} />
      <SummaryBox label="Seguros" value={summary.safe} />
      <SummaryBox label="Nuevos" value={summary.new} />
      <SummaryBox label="Dudosos" value={summary.doubtful} />
      <SummaryBox label="Conflictos" value={summary.conflicts} />
      <SummaryBox label="Ignorados" value={summary.ignored} />
    </div>
  );
}

function PurchaseRowsTable({
  onDecision,
  rows,
}: {
  onDecision: (rowIndex: number, decision: PurchaseImportDecision) => void;
  rows: PurchaseImportRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Filas revisadas</CardTitle>
        <CardDescription>
          Elegi una decision por fila antes de confirmar.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3">Fila</th>
              <th className="p-3">Descripcion</th>
              <th className="p-3">Cantidad</th>
              <th className="p-3">Costo</th>
              <th className="p-3">Candidato</th>
              <th className="p-3">Stock actual</th>
              <th className="p-3">Stock proyectado</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Decision</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.lineNumber}-${row.description}`} className="border-b border-border align-top">
                <td className="p-3 font-mono">{row.lineNumber}</td>
                <td className="max-w-[320px] p-3">
                  <p className="font-semibold">{row.description}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Prov: {row.supplierSku || "-"} | SKU: {row.sku || "-"} | Barras: {row.barcode || "-"}
                  </p>
                  {row.messages.length > 0 ? (
                    <p className="mt-2 text-xs font-semibold text-yellow-900">
                      {row.messages.join(" ")}
                    </p>
                  ) : null}
                </td>
                <td className="p-3">{formatNumber(row.quantity)}</td>
                <td className="p-3">{formatMoney(row.unitCostWithTax)}</td>
                <td className="p-3">
                  {row.candidateSku ? (
                    <>
                      <p className="font-mono font-semibold">{row.candidateSku}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.matchMethod} {row.matchConfidence}%
                      </p>
                    </>
                  ) : (
                    "Producto nuevo"
                  )}
                </td>
                <td className="p-3">{formatNumber(row.candidateStock)}</td>
                <td className="p-3">{formatNumber(row.projectedStock)}</td>
                <td className="p-3">
                  <StatusPill row={row} />
                </td>
                <td className="p-3">
                  <div className="grid gap-2">
                    {(
                      [
                        "match_existing",
                        "create_new",
                        "choose_other",
                        "ignore",
                      ] as const
                    ).map((decision) => (
                      <Button
                        key={decision}
                        type="button"
                        variant={row.decision === decision ? "default" : "outline"}
                        onClick={() => onDecision(index, decision)}
                        disabled={decision === "match_existing" && !row.candidateProductId}
                        className="h-9 justify-start px-3 text-xs"
                      >
                        {decision === "choose_other" ? (
                          <Search className="mr-1 size-4" aria-hidden="true" />
                        ) : null}
                        {decisionLabels[decision]}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function StatusPill({ row }: { row: PurchaseImportRow }) {
  const label =
    row.status === "safe"
      ? "Seguro"
      : row.status === "new"
        ? "Nuevo"
        : row.status === "doubtful"
          ? "Dudoso"
          : row.status === "ignored"
            ? "Ignorado"
            : "Conflicto";

  return (
    <span
      className={
        row.status === "conflict" || row.status === "doubtful"
          ? "inline-flex items-center gap-2 rounded-lg border border-yellow-500/40 bg-yellow-50 px-3 py-2 font-semibold text-yellow-900"
          : "inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-2 font-semibold text-emerald-800"
      }
    >
      {row.status === "conflict" || row.status === "doubtful" ? (
        <AlertTriangle className="size-4" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-4" aria-hidden="true" />
      )}
      {label}
    </span>
  );
}

function SummaryBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
