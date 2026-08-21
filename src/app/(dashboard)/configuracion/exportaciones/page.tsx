import Link from "next/link";
import { Download, FileText, Package, Users } from "lucide-react";

import { requireConfigurationTenant } from "../access";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const exportSections = [
  {
    title: "Stock",
    description: "Listado de productos activos, precios y cantidades.",
    href: "/api/export/stock?format=pdf",
    actionLabel: "Descargar stock",
    icon: Package,
  },
  {
    title: "Clientes",
    description: "Listado de clientes con datos de contacto.",
    href: "/api/export/clientes?format=pdf",
    actionLabel: "Descargar clientes",
    icon: Users,
  },
  {
    title: "Ventas de hoy",
    description: "Resumen y detalle de ventas registradas hoy.",
    href: "/api/export/ventas?period=today&format=pdf",
    actionLabel: "Descargar ventas de hoy",
    icon: FileText,
  },
  {
    title: "Ventas del mes",
    description: "Resumen y detalle de ventas del mes actual.",
    href: "/api/export/ventas?period=month&format=pdf",
    actionLabel: "Descargar ventas del mes",
    icon: FileText,
  },
] as const;

export default async function ConfiguracionExportacionesPage() {
  await requireConfigurationTenant("/configuracion/exportaciones");

  return (
    <>
      <PageHeader
        title="Exportaciones"
        description="Descargas administrativas en PDF."
        backHref="/configuracion"
        backLabel="Volver a Configuracion"
      />

      <section
        aria-label="Exportaciones disponibles"
        className="grid max-w-5xl gap-4 pb-6 md:grid-cols-2 xl:grid-cols-4"
      >
        {exportSections.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.href} className="flex min-h-[220px] flex-col">
              <CardHeader>
                <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-secondary text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  asChild
                  className="h-14 w-full justify-center gap-2 px-4 text-base font-semibold"
                >
                  <Link href={section.href}>
                    <Download className="size-5" aria-hidden="true" />
                    {section.actionLabel}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>
    </>
  );
}
