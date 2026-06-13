"use client";

import { useActionState } from "react";
import { FileUp, PackagePlus } from "lucide-react";

import {
  confirmStockCsvAction,
  previewStockCsvAction,
} from "@/app/(dashboard)/stock/actions";
import {
  initialStockCsvState,
} from "@/app/(dashboard)/stock/stock-csv-utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatStockQuantity } from "@/lib/format";

export function StockCsvUploadCard() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewStockCsvAction,
    initialStockCsvState
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmStockCsvAction,
    initialStockCsvState
  );
  const hasPreview =
    previewState.previewRows.length > 0 || previewState.invalidRows.length > 0;
  const hasFinalSummary = confirmState.title === "Carga confirmada";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carga rapida por CSV</CardTitle>
        <CardDescription>
          Subi un archivo con codigo y cantidad para sumar stock automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={previewAction} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-2 text-base font-semibold">
            <span>Archivo CSV</span>
            <input
              type="file"
              name="csvFile"
              accept=".csv,text/csv"
              className="rounded-md border border-input bg-background px-3 py-2 text-base file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground"
            />
          </label>
          <Button type="submit" disabled={previewPending} className="h-10 gap-2 px-4">
            <FileUp className="size-5" aria-hidden="true" />
            {previewPending ? "Leyendo..." : "Ver vista previa"}
          </Button>
        </form>

        <div className="rounded-md border border-border bg-background p-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Formato esperado</p>
          <pre className="mt-2 overflow-x-auto font-mono text-sm leading-5">
{`codigo,cantidad
47783,10
47781,5
33331,20`}
          </pre>
        </div>

        {previewState.message ? (
          <StatusMessage ok={previewState.ok} message={previewState.message} />
        ) : null}

        {hasPreview ? (
          <div className="grid gap-3">
            <SummaryGrid
              updatedProducts={previewState.summary.updatedProducts}
              notFound={previewState.summary.notFound}
              invalidRows={previewState.summary.invalidRows}
              totalQuantity={previewState.summary.totalQuantity}
            />

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-2">Codigo</th>
                    <th className="p-2">Cantidad a sumar</th>
                    <th className="p-2">Producto encontrado</th>
                    <th className="p-2">Stock actual</th>
                    <th className="p-2">Stock final esperado</th>
                    <th className="p-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {previewState.previewRows.map((row) => (
                    <tr key={row.codigo} className="border-t border-border">
                      <td className="p-2 font-mono">{row.codigo}</td>
                      <td className="p-2 font-semibold">
                        {formatStockQuantity(row.cantidad)}
                      </td>
                      <td className="p-2">{row.productName || "-"}</td>
                      <td className="p-2">
                        {row.stockActual === null
                          ? "-"
                          : formatStockQuantity(row.stockActual)}
                      </td>
                      <td className="p-2">
                        {row.stockFinal === null
                          ? "-"
                          : formatStockQuantity(row.stockFinal)}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            row.status === "ok"
                              ? "inline-flex rounded-full border border-emerald-500/40 bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-800"
                              : "inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-sm font-bold text-destructive"
                          }
                        >
                          {row.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {previewState.invalidRows.map((row) => (
                    <tr
                      key={`invalid-${row.rowNumber}`}
                      className="border-t border-border bg-destructive/5"
                    >
                      <td className="p-2 font-mono">{row.codigo || "-"}</td>
                      <td className="p-2">{row.cantidad || "-"}</td>
                      <td className="p-2">-</td>
                      <td className="p-2">-</td>
                      <td className="p-2">-</td>
                      <td className="p-2">
                        <span className="inline-flex rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-sm font-bold text-destructive">
                          Fila {row.rowNumber}: {row.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form action={confirmAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input type="hidden" name="fileName" value={previewState.fileName} />
              <input
                type="hidden"
                name="rows"
                value={previewState.confirmPayload}
              />
              <Button
                type="submit"
                disabled={!previewState.ok || confirmPending}
                className="h-10 gap-2 px-4"
              >
                <PackagePlus className="size-5" aria-hidden="true" />
                {confirmPending ? "Confirmando..." : "Confirmar carga"}
              </Button>
              {!previewState.ok ? (
                <p className="text-sm font-semibold text-muted-foreground">
                  Para confirmar, todas las filas deben estar listas.
                </p>
              ) : null}
            </form>
          </div>
        ) : null}

        {confirmState.message ? (
          <StatusMessage ok={confirmState.ok} message={confirmState.message} />
        ) : null}

        {hasFinalSummary ? (
          <SummaryGrid
            updatedProducts={confirmState.summary.updatedProducts}
            notFound={confirmState.summary.notFound}
            invalidRows={confirmState.summary.invalidRows}
            totalQuantity={confirmState.summary.totalQuantity}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatusMessage({ ok, message }: { ok: boolean; message: string }) {
  return (
    <p
      className={
        ok
          ? "rounded-md border border-emerald-500/40 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"
          : "rounded-md border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900"
      }
    >
      {message}
    </p>
  );
}

function SummaryGrid({
  updatedProducts,
  notFound,
  invalidRows,
  totalQuantity,
}: {
  updatedProducts: number;
  notFound: number;
  invalidRows: number;
  totalQuantity: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-4">
      <SummaryItem label="Actualizados" value={updatedProducts} />
      <SummaryItem label="No encontrados" value={notFound} />
      <SummaryItem label="Filas invalidas" value={invalidRows} />
      <SummaryItem label="Total a sumar" value={formatStockQuantity(totalQuantity)} />
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}
