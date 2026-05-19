import Link from "next/link";
import { PackagePlus } from "lucide-react";

import { adminGroupItems } from "@/components/shell/nav-items";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AjustesPage() {
  const visibleItems = adminGroupItems.filter(
    (item) => item.href !== "/ajustes/configuracion"
  );
  const quickStockItem = {
    title: "Carga rapida de stock",
    href: "/stock/carga-rapida",
    icon: PackagePlus,
    description: "Subir un CSV para sumar cantidades al stock.",
  };
  const items = [...visibleItems, quickStockItem];

  return (
    <>
      <PageHeader
        title="Solo encargado"
        description="Estas opciones son para revisar ventas, clientes o cambiar datos importantes."
        backHref="/inicio"
        backLabel="Volver a vender"
      />

      <section
        aria-label="Solo encargado"
        className="grid max-w-4xl gap-4 md:grid-cols-2"
      >
        {items.map((item, index) => {
          const Icon = item.icon;
          const actionLabel = index === 0 ? "Ver" : "Abrir";

          return (
            <Card key={item.href}>
              <CardHeader>
                <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-6" aria-hidden="true" />
                </div>
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  asChild
                  variant="outline"
                  className="h-14 w-full justify-start gap-2 px-5 text-base"
                >
                  <Link href={item.href}>
                    <Icon className="size-5" aria-hidden="true" />
                    {actionLabel}
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
