import Link from "next/link";

import { configurationItems } from "@/components/shell/nav-items";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AjustesConfiguracionPage() {
  return (
    <>
      <PageHeader
        title="Editar datos"
        description="Cambiar productos, precios o datos de la ferreteria."
        backHref="/ajustes"
        backLabel="Volver a encargado"
      />

      <section
        aria-label="Editar datos"
        className="grid max-w-3xl gap-4 md:grid-cols-2"
      >
        {configurationItems.map((item) => {
          const Icon = item.icon;

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
                    Editar
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
