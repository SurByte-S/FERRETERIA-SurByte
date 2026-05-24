import Link from "next/link";

import { historyItems } from "@/components/shell/nav-items";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HistorialPage() {
  return (
    <>
      <PageHeader
        title="Revisar ventas y clientes"
        description="Consulta ventas, presupuestos y clientes guardados."
        backHref="/ajustes"
        backLabel="Volver a datos de factura"
      />

      <section
        aria-label="Revisar ventas y clientes"
        className="grid max-w-4xl gap-4 md:grid-cols-3"
      >
        {historyItems.map((item) => {
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
                    Ver
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
