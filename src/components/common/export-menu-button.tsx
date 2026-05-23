import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ExportMenuButton({
  csvHref,
  label = "Exportar Excel/PDF",
  pdfHref,
}: {
  csvHref: string;
  label?: string;
  pdfHref: string;
}) {
  return (
    <details className="group relative inline-block text-left">
      <summary className="list-none [&::-webkit-details-marker]:hidden">
        <Button
          type="button"
          variant="outline"
          className="h-12 gap-2 px-4 text-base xl:h-14 xl:px-5 xl:text-lg"
          asChild
        >
          <span>
            <Download className="size-5" aria-hidden="true" />
            {label}
          </span>
        </Button>
      </summary>
      <div className="absolute right-0 z-30 mt-2 grid min-w-48 overflow-hidden rounded-md border border-border bg-card p-1 shadow-lg">
        <a
          href={csvHref}
          className="rounded px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Descargar Excel/CSV
        </a>
        <a
          href={pdfHref}
          className="rounded px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Ver PDF / Imprimir
        </a>
      </div>
    </details>
  );
}
