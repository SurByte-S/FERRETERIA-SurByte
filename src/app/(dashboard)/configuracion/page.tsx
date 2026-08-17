import Link from "next/link";
import { BadgeCheck, Building2, Factory, FileClock } from "lucide-react";

import { requireConfigurationTenant } from "./access";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const configurationSections = [
  {
    title: "Datos del negocio",
    description: "Nombre, CUIT, telefono, direccion y logo URL.",
    href: "/configuracion/datos",
    actionLabel: "Modificar datos",
    icon: Building2,
  },
  {
    title: "Marcas",
    description: "Crear, buscar, editar y activar/desactivar marcas.",
    href: "/configuracion/marcas",
    actionLabel: "Entrar",
    icon: BadgeCheck,
  },
  {
    title: "Proveedores",
    description: "Crear, buscar y editar proveedores.",
    href: "/configuracion/proveedores",
    actionLabel: "Entrar",
    icon: Factory,
  },
  {
    title: "Facturacion e impresion",
    description: "Datos fiscales y tamano A4/A5/Ticket.",
    href: "/configuracion/facturacion",
    actionLabel: "Configurar",
    icon: FileClock,
  },
] as const;

export default async function ConfiguracionPage() {
  await requireConfigurationTenant("/configuracion");

  return (
    <>
      <PageHeader
        title="Configuracion"
        description="Administra los datos principales de tu ferreteria."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <section
        aria-label="Opciones de configuracion"
        className="grid max-w-5xl gap-4 pb-6 md:grid-cols-2 xl:grid-cols-4"
      >
        {configurationSections.map((section) => {
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
                  className="h-12 w-full justify-start gap-2 px-4 text-base"
                >
                  <Link href={section.href}>
                    <Icon className="size-5" aria-hidden="true" />
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
