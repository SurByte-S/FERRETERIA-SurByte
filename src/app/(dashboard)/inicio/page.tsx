import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { navigationItems, quickActions } from "@/components/shell/nav-items";

export default function InicioPage() {
  return (
    <>
      <PageHeader
        title="Inicio"
        description="Accesos grandes para las tareas mas comunes de la ferreteria."
      />

      <section aria-label="Acciones rapidas" className="grid gap-4 xl:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Card key={action.href}>
              <CardHeader>
                <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon className="size-7" aria-hidden="true" />
                </div>
                <CardTitle>{action.title}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="h-12 w-full gap-2 text-base">
                  <Link href={action.href}>
                    <Icon className="size-5" aria-hidden="true" />
                    Abrir {action.title.toLowerCase()}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section aria-label="Todas las secciones" className="mt-8">
        <h2 className="mb-4 text-2xl font-semibold">Todas las secciones</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <Button
                key={item.href}
                asChild
                variant="outline"
                className="h-20 justify-start gap-3 px-4 text-left text-base"
              >
                <Link href={item.href}>
                  <Icon className="size-6" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </>
  );
}
