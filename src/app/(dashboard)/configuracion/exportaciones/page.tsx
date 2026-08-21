import Link from "next/link";
import { Download } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

const exportSections = [
  {
    title: "Stock completo",
    description: "Productos activos, códigos y precios.",
    href: "/api/export/stock?format=pdf",
  },
  {
    title: "Clientes",
    description: "Listado de clientes registrados.",
    href: "/api/export/clientes?format=pdf",
  },
  {
    title: "Ventas de hoy",
    description: "Ventas registradas durante el día.",
    href: "/api/export/ventas?period=today&format=pdf",
  },
  {
    title: "Ventas del mes",
    description: "Ventas registradas durante el mes.",
    href: "/api/export/ventas?period=month&format=pdf",
  },
] as const;

export default async function ConfiguracionExportacionesPage() {
  await requireConfigurationTenant("/configuracion/exportaciones");

  return (
    <>
      <PageHeader
        title="Exportaciones"
        description="Listado de reportes disponibles."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <section
        aria-label="Exportaciones disponibles"
        className="max-w-5xl overflow-hidden rounded-md border border-border bg-card shadow-sm"
      >
        <div className="hidden grid-cols-[minmax(160px,220px)_minmax(0,1fr)_180px] border-b border-border bg-secondary px-4 py-3 text-sm font-bold uppercase tracking-normal text-muted-foreground md:grid">
          <span>Reporte</span>
          <span>Detalle</span>
          <span className="text-right">Acción</span>
        </div>
        <div className="divide-y divide-border">
          {exportSections.map((section) => (
            <div
              key={section.href}
              className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_180px] md:items-center"
            >
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground md:hidden">
                  Reporte
                </p>
                <p className="text-base font-bold text-foreground">
                  {section.title}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground md:hidden">
                  Detalle
                </p>
                <p className="text-base font-semibold text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <div className="md:flex md:justify-end">
                <Button
                  asChild
                  className="h-12 w-full justify-center gap-2 px-4 text-base font-semibold md:w-auto"
                >
                  <Link href={section.href}>
                    <Download className="size-5" aria-hidden="true" />
                    Descargar PDF
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
