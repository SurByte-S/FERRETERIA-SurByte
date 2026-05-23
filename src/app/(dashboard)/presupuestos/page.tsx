import Link from "next/link";
import { Eye, Printer, ShoppingCart } from "lucide-react";

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
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const quotes = ((data ?? []) as unknown as QuoteRow[]);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Consultá presupuestos guardados, imprimilos o abrí el detalle."
        eyebrow=""
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="no-print mb-6">
        <Button asChild className="h-11 gap-2 px-5 text-base xl:h-14 xl:gap-3 xl:px-6 xl:text-lg">
          <Link href="/inicio">
            <ShoppingCart className="size-6" aria-hidden="true" />
            Ir a vender
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
            <Button asChild className="h-11 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
              <Link href="/inicio">
                <ShoppingCart className="size-6" aria-hidden="true" />
                Ir a vender
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {quotes.map((quote) => (
            <Card key={quote.id} className="min-h-[88px] rounded-lg">
              <CardContent className="grid min-h-[88px] gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs leading-tight text-muted-foreground">
                    {formatDate(quote.created_at)}
                  </p>
                  <h2 className="truncate text-lg font-bold leading-tight">
                    Presupuesto #{quote.quote_number}
                  </h2>
                  <p className="truncate text-sm font-semibold leading-tight text-muted-foreground">
                    Cliente: {quote.customers?.name ?? "Sin cliente"} · Estado:{" "}
                    {statusLabel(quote.status)}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_80px_130px] md:flex md:flex-wrap md:items-center md:justify-end">
                  <p className="inline-flex h-10 w-[130px] items-center justify-center whitespace-nowrap rounded-md border border-border bg-background px-3 text-base font-bold">
                    {formatMoney(quote.total)}
                  </p>
                  <Button asChild className="h-10 min-w-[80px] gap-2 px-3 text-sm">
                    <Link href={`/presupuestos/${quote.id}`}>
                      <Eye className="size-4" aria-hidden="true" />
                      Ver
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 w-[130px] gap-2 px-3 text-sm">
                    <Link href={`/presupuestos/${quote.id}?print=1`}>
                      <Printer className="size-4" aria-hidden="true" />
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
