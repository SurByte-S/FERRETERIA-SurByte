"use client";

import { useActionState, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
} from "lucide-react";

import {
  confirmProductsImportAction,
  previewProductsImportAction,
  type ImportPreviewRow,
  type ImportState,
} from "@/app/(dashboard)/productos/importar/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState: ImportState = {
  ok: false,
  title: "",
  canConfirm: false,
  confirmPayload: "",
  fileName: "",
  previewRows: [],
  stockMode: "preserve",
  summary: {
    creados: 0,
    actualizados: 0,
    omitidos: 0,
    conErrores: 0,
    necesitanRevision: 0,
    mensajes: [],
  },
};

export function ImportProductsForm() {
  const [previewState, previewAction, previewPending] = useActionState(
    previewProductsImportAction,
    initialState
  );
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmProductsImportAction,
    initialState
  );
  const [fileName, setFileName] = useState("");
  const latestState = confirmState.title ? confirmState : previewState;
  const previewRows = latestState.previewRows;
  const hasPreview = previewRows.length > 0;
  const errorCount = useMemo(
    () => previewRows.filter((row) => row.status === "error").length,
    [previewRows]
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>Seleccionar archivo</CardTitle>
          <CardDescription>
            CSV, XLS o XLSX con las columnas normalizadas del catalogo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="grid gap-5">
            <label className="grid cursor-pointer gap-3 rounded-lg border border-dashed border-border bg-background p-5 text-lg">
              <span className="font-semibold">Archivo de productos</span>
              <input
                name="productFile"
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) =>
                  setFileName(event.target.files?.[0]?.name ?? "")
                }
                className="text-base file:mr-4 file:h-12 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-base file:font-semibold file:text-primary-foreground"
              />
              <span className="text-base text-muted-foreground">
                {fileName || "Todavia no seleccionaste un archivo."}
              </span>
            </label>

            <fieldset className="grid gap-3 rounded-lg border border-border bg-background p-4">
              <legend className="px-1 text-base font-bold">Stock en productos existentes</legend>
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm font-semibold">
                <input
                  type="radio"
                  name="stockMode"
                  value="preserve"
                  defaultChecked
                  className="mt-1 size-4"
                />
                <span>
                  Preservar stock actual. El stock del archivo solo se usa al crear productos nuevos.
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border border-yellow-500/40 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
                <input
                  type="radio"
                  name="stockMode"
                  value="set"
                  className="mt-1 size-4"
                />
                <span>
                  Ajustar stock de existentes al valor del archivo y registrar movimientos.
                </span>
              </label>
            </fieldset>

            <Button
              type="submit"
              disabled={!fileName || previewPending}
              className="h-11 w-full gap-2 text-base sm:w-fit sm:px-5 xl:h-14 xl:gap-3 xl:px-6 xl:text-lg"
            >
              <Upload className="size-6" aria-hidden="true" />
              {previewPending ? "Preparando vista previa..." : "Preparar vista previa"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {latestState.title ? (
        <Card className={latestState.ok ? "border-primary/40" : "border-destructive/40"}>
          <CardHeader>
            <CardTitle>{latestState.title}</CardTitle>
            <CardDescription>
              {latestState.fileName
                ? `${latestState.fileName} - ${
                    latestState.stockMode === "set"
                      ? "ajusta stock de existentes"
                      : "preserva stock de existentes"
                  }`
                : "Resumen de la importacion"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <SummaryGrid state={latestState} />

            {latestState.summary.mensajes.length > 0 ? (
              <div className="rounded-lg border border-border bg-background p-4">
                <h3 className="text-lg font-semibold">Necesitan revision</h3>
                <ul className="mt-3 grid gap-2 text-base text-muted-foreground">
                  {latestState.summary.mensajes.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {previewState.canConfirm && !confirmState.title ? (
              <form action={confirmAction} className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  type="hidden"
                  name="payload"
                  value={previewState.confirmPayload}
                />
                <Button
                  type="submit"
                  disabled={confirmPending}
                  className="h-11 gap-2 px-5 text-base"
                >
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  {confirmPending ? "Confirmando..." : "Confirmar importacion"}
                </Button>
                <p className="text-sm font-semibold text-muted-foreground">
                  La confirmacion vuelve a validar contra la base antes de escribir.
                </p>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {hasPreview ? (
        <PreviewTable rows={previewRows} errorCount={errorCount} />
      ) : null}
    </div>
  );
}

function SummaryGrid({ state }: { state: ImportState }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
      <SummaryBox label="Creados" value={state.summary.creados} />
      <SummaryBox label="Actualizados" value={state.summary.actualizados} />
      <SummaryBox label="Omitidos" value={state.summary.omitidos} />
      <SummaryBox label="Con errores" value={state.summary.conErrores} />
      <SummaryBox
        label="Necesitan revision"
        value={state.summary.necesitanRevision}
      />
    </div>
  );
}

function PreviewTable({
  errorCount,
  rows,
}: {
  errorCount: number;
  rows: ImportPreviewRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vista previa revisada</CardTitle>
        <CardDescription>
          Primeras {rows.length} filas revisadas. {errorCount} con error.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm xl:min-w-[980px] xl:text-base">
          <thead>
            <tr className="border-b border-border">
              <th className="p-3">Fila</th>
              <th className="p-3">Accion</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Codigo</th>
              <th className="p-3">Descripcion</th>
              <th className="p-3">Stock archivo</th>
              <th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.sku}`} className="border-b border-border">
                <td className="p-3">{row.rowNumber}</td>
                <td className="p-3 font-semibold">{actionLabel(row.action)}</td>
                <td className="p-3 font-mono">{row.sku || "-"}</td>
                <td className="p-3 font-mono">{row.codigo || "-"}</td>
                <td className="max-w-[320px] p-3 xl:max-w-[420px]">
                  {row.descripcion || "-"}
                </td>
                <td className="p-3">{row.stockInicial}</td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-semibold">
                    {row.status === "lista" ? (
                      <CheckCircle2 className="size-5" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="size-5" aria-hidden="true" />
                    )}
                    {row.status === "lista" ? "Lista" : "Necesita revision"}
                  </span>
                  {row.messages.length > 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {row.messages.join(" ")}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function actionLabel(action: ImportPreviewRow["action"]) {
  if (action === "crear") {
    return "Crear";
  }

  if (action === "actualizar") {
    return "Actualizar";
  }

  return "Omitir";
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
