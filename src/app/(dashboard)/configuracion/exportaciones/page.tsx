import Link from "next/link";
import { Download } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase";

const exportSections = [
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

type ExportacionesPageProps = {
  searchParams: Promise<{
    categoryId?: string;
  }>;
};

type CategoryOption = {
  id: string;
  name: string;
};

export default async function ConfiguracionExportacionesPage({
  searchParams,
}: ExportacionesPageProps) {
  const params = await searchParams;
  const tenant = await requireConfigurationTenant("/configuracion/exportaciones");
  const categories = await loadCategories(tenant.id);
  const selectedCategoryId = categories.some(
    (category) => category.id === params.categoryId
  )
    ? params.categoryId ?? ""
    : "";
  const stockPdfHref = stockExportHref("pdf", selectedCategoryId);
  const stockCsvHref = stockExportHref("csv", selectedCategoryId);

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
          <div className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(160px,220px)_minmax(0,1fr)_180px] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground md:hidden">
                Reporte
              </p>
              <p className="text-base font-bold text-foreground">
                Stock por categoria
              </p>
            </div>
            <div className="grid gap-3">
              <p className="text-xs font-bold uppercase text-muted-foreground md:hidden">
                Detalle
              </p>
              <p className="text-base font-semibold text-muted-foreground">
                Productos activos, codigos y precios.
              </p>
              <form
                action="/configuracion/exportaciones"
                className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
              >
                <label className="grid gap-2 text-sm font-semibold text-foreground">
                  <span>Categoria</span>
                  <select
                    name="categoryId"
                    defaultValue={selectedCategoryId}
                    className="h-11 min-w-0 rounded-lg border border-input bg-background px-3 text-base"
                  >
                    <option value="">Todas las categorias</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 px-4 text-base"
                >
                  Aplicar
                </Button>
              </form>
            </div>
            <div className="grid gap-2 md:justify-end">
              <Button
                asChild
                className="h-12 w-full justify-center gap-2 px-4 text-base font-semibold md:w-auto"
              >
                <Link href={stockPdfHref}>
                  <Download className="size-5" aria-hidden="true" />
                  Exportar PDF
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 w-full justify-center gap-2 px-4 text-base font-semibold md:w-auto"
              >
                <Link href={stockCsvHref}>
                  <Download className="size-5" aria-hidden="true" />
                  Exportar CSV
                </Link>
              </Button>
            </div>
          </div>
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

async function loadCategories(tenantId: string): Promise<CategoryOption[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .order("name");

  if (error) {
    throw new Error("No se pudieron cargar las categorias.");
  }

  return (data ?? []) as CategoryOption[];
}

function stockExportHref(format: "csv" | "pdf", categoryId: string) {
  const params = new URLSearchParams({ format });

  if (categoryId) {
    params.set("categoryId", categoryId);
  }

  return `/api/export/stock?${params.toString()}`;
}
