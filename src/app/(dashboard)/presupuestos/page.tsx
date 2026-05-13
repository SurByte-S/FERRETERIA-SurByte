import Link from "next/link";
import { ClipboardList, Eye, Printer } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type QuoteRow = {
  id: string;
  quote_number: number;
  status: string;
  total: number;
  created_at: string;
  customers: { name: string } | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    issued: "Emitido",
    cancelled: "Cancelado",
    converted: "Convertido en venta",
  };

  return labels[status] ?? status;
}

export default async function PresupuestosPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("quotes")
    .select("id,quote_number,status,total,created_at,customers(name)")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const quotes = ((data ?? []) as unknown as QuoteRow[]);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Consultá presupuestos guardados, imprimilos o abrí el detalle."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="no-print mb-6">
        <Button asChild className="h-14 gap-3 px-6 text-lg">
          <Link href="/presupuestos/nuevo">
            <ClipboardList className="size-6" aria-hidden="true" />
            Nuevo presupuesto
          </Link>
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesitan revisión</CardTitle>
            <CardDescription>
              No se pudieron cargar los presupuestos. Revisá la conexión.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : quotes.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No hay presupuestos guardados</CardTitle>
            <CardDescription>
              Creá el primer presupuesto desde el mostrador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-14 gap-2 px-6 text-lg">
              <Link href="/presupuestos/nuevo">
                <ClipboardList className="size-6" aria-hidden="true" />
                Nuevo presupuesto
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {quotes.map((quote) => (
            <Card key={quote.id}>
              <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(quote.created_at)}
                  </p>
                  <h2 className="mt-1 text-2xl font-bold">
                    Presupuesto #{quote.quote_number}
                  </h2>
                  <p className="mt-2 text-lg">
                    Cliente: {quote.customers?.name ?? "Sin cliente"}
                  </p>
                  <p className="text-base text-muted-foreground">
                    Estado: {statusLabel(quote.status)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-[auto_auto_auto] lg:justify-end">
                  <p className="rounded-lg border border-border bg-background p-4 text-2xl font-bold">
                    {formatMoney(quote.total)}
                  </p>
                  <Button asChild className="h-14 gap-2 px-5 text-lg">
                    <Link href={`/presupuestos/${quote.id}`}>
                      <Eye className="size-6" aria-hidden="true" />
                      Ver
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-14 gap-2 px-5 text-lg">
                    <Link href={`/presupuestos/${quote.id}?print=1`}>
                      <Printer className="size-6" aria-hidden="true" />
                      Imprimir
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
