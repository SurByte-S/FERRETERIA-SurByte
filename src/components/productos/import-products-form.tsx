"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { importProductsAction } from "@/app/(dashboard)/productos/importar/actions";
import {
  buildProductPreviewRows,
  type ProductCsvPreviewRow,
} from "@/lib/csv/productos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initialState = {
  ok: false,
  title: "",
  summary: {
    creados: 0,
    actualizados: 0,
    omitidos: 0,
    conErrores: 0,
    necesitanRevision: 0,
    mensajes: [] as string[],
  },
};

export function ImportProductsForm() {
  const [state, formAction, pending] = useActionState(
    importProductsAction,
    initialState
  );
  const [fileName, setFileName] = useState("");
  const [previewRows, setPreviewRows] = useState<ProductCsvPreviewRow[]>([]);
  const [previewError, setPreviewError] = useState("");

  const hasPreview = previewRows.length > 0;
  const reviewCount = useMemo(
    () => previewRows.filter((row) => row.status === "revisar").length,
    [previewRows]
  );

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreviewError("");
    setPreviewRows([]);
    setFileName(file?.name ?? "");

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const rows = buildProductPreviewRows(text);

      if (rows.length === 0) {
        setPreviewError("El archivo no tiene filas para mostrar.");
        return;
      }

      setPreviewRows(rows);
    } catch {
      setPreviewError("No se pudo leer el CSV. Elegi otro archivo.");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileSpreadsheet className="size-7" aria-hidden="true" />
          </div>
          <CardTitle>Seleccionar archivo CSV</CardTitle>
          <CardDescription>
            Usa el archivo `productos_normalizados.csv` o uno con las mismas columnas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-5">
            <label className="grid cursor-pointer gap-3 rounded-lg border border-dashed border-border bg-background p-5 text-lg">
              <span className="font-semibold">Archivo de productos</span>
              <input
                name="csvFile"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="text-base file:mr-4 file:h-12 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:text-base file:font-semibold file:text-primary-foreground"
              />
              <span className="text-base text-muted-foreground">
                {fileName || "Todavia no seleccionaste un archivo."}
              </span>
            </label>

            <Button
              type="submit"
              disabled={!hasPreview || pending}
              className="h-14 w-full gap-3 text-lg sm:w-fit sm:px-6"
            >
              <Upload className="size-6" aria-hidden="true" />
              {pending ? "Importando productos..." : "Importar productos"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {previewError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesitan revision</CardTitle>
            <CardDescription>{previewError}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {hasPreview ? (
        <Card>
          <CardHeader>
            <CardTitle>Vista previa</CardTitle>
            <CardDescription>
              Primeras 20 filas. {reviewCount} necesitan revision antes o despues
              de importar.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Fila</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Descripcion</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Marca</th>
                  <th className="p-3">Precio</th>
                  <th className="p-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr key={`${row.rowNumber}-${row.sku}`} className="border-b border-border">
                    <td className="p-3">{row.rowNumber}</td>
                    <td className="p-3 font-mono">{row.sku || "-"}</td>
                    <td className="max-w-[340px] p-3">{row.descripcion || "-"}</td>
                    <td className="p-3">{row.categoria_sugerida || "-"}</td>
                    <td className="p-3">{row.marca_sugerida || "-"}</td>
                    <td className="p-3">{row.precio_publico_ars || "Revisar"}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 font-semibold">
                        {row.status === "lista" ? (
                          <CheckCircle2 className="size-5" aria-hidden="true" />
                        ) : (
                          <AlertTriangle className="size-5" aria-hidden="true" />
                        )}
                        {row.status === "lista" ? "Lista" : "Necesitan revision"}
                      </span>
                      {row.messages.length > 0 ? (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {row.messages.join(". ")}
                        </p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      {state.title ? (
        <Card className={state.ok ? "border-primary/40" : "border-destructive/40"}>
          <CardHeader>
            <CardTitle>{state.title}</CardTitle>
            <CardDescription>
              Resumen claro de la importacion de productos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryBox label="Creados" value={state.summary.creados} />
              <SummaryBox label="Actualizados" value={state.summary.actualizados} />
              <SummaryBox label="Omitidos" value={state.summary.omitidos} />
              <SummaryBox label="Con errores" value={state.summary.conErrores} />
              <SummaryBox
                label="Necesitan revision"
                value={state.summary.necesitanRevision}
              />
            </div>

            {state.summary.mensajes.length > 0 ? (
              <div className="rounded-lg border border-border bg-background p-4">
                <h3 className="text-lg font-semibold">Necesitan revision</h3>
                <ul className="mt-3 grid gap-2 text-base text-muted-foreground">
                  {state.summary.mensajes.slice(0, 20).map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}
