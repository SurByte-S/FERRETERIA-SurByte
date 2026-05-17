import Link from "next/link";
import { Eye, Printer, ReceiptText, WalletCards } from "lucide-react";

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

type SaleRow = {
  id: string;
  sale_number: number;
  total: number;
  paid_amount: number;
  payment_method: string | null;
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

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

export default async function VentasPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const range = todayRange();
  const [salesResult, todayResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id,sale_number,total,paid_amount,payment_method,created_at,customers(name)")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sales")
      .select("total,paid_amount,payment_method,created_at")
      .eq("tenant_id", tenant.id)
      .gte("created_at", range.start)
      .lt("created_at", range.end),
  ]);

  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const todaySales = (todayResult.data ?? []) as unknown as Pick<
    SaleRow,
    "total" | "paid_amount" | "payment_method"
  >[];
  const totalToday = todaySales.reduce((sum, sale) => sum + sale.total, 0);
  const totalsByMethod = todaySales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method ?? "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + sale.total;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Ventas"
        description="Consulta ventas guardadas y revisa la caja del dia."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <section className="mb-4 grid gap-3 xl:mb-6 xl:grid-cols-3 xl:gap-4">
        <Card className="border-primary/40">
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <WalletCards className="size-6" aria-hidden="true" />
            </div>
            <CardTitle>Caja de hoy</CardTitle>
            <CardDescription>Total vendido en el dia.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold xl:text-4xl">{formatMoney(totalToday)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cantidad de ventas</CardTitle>
            <CardDescription>Operaciones registradas hoy.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold xl:text-4xl">{todaySales.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por forma de pago</CardTitle>
            <CardDescription>Resumen simple para cerrar caja.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {Object.keys(totalsByMethod).length === 0 ? (
              <p className="text-base text-muted-foreground">
                Todavia no hay ventas registradas hoy.
              </p>
            ) : (
              Object.entries(totalsByMethod).map(([method, total]) => (
                <div
                  key={method}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <span className="font-semibold">{method}</span>
                  <span className="text-lg font-bold">{formatMoney(total)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {salesResult.error || todayResult.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesita revision</CardTitle>
            <CardDescription>
              No se pudieron cargar las ventas. Revisa la conexion a Supabase.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : sales.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ReceiptText className="size-6" aria-hidden="true" />
            </div>
            <CardTitle>No hay ventas guardadas</CardTitle>
            <CardDescription>
              Las ventas aparecen aca cuando convertis un presupuesto en venta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-11 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
              <Link href="/presupuestos">
                <ReceiptText className="size-6" aria-hidden="true" />
                Ver presupuestos
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sales.map((sale) => {
            const pendingAmount = Math.max(sale.total - sale.paid_amount, 0);

            return (
              <Card key={sale.id}>
                <CardContent className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:p-5">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </p>
                    <h2 className="mt-1 text-xl font-bold xl:text-2xl">
                      Venta #{sale.sale_number}
                    </h2>
                    <p className="mt-2 text-lg">
                      Cliente: {sale.customers?.name ?? "Sin cliente"}
                    </p>
                    <p className="text-base text-muted-foreground">
                      Pago: {sale.payment_method ?? "Sin forma de pago"} - Pagado:{" "}
                      {formatMoney(sale.paid_amount)}
                    </p>
                    {pendingAmount > 0 ? (
                      <p className="text-base font-semibold text-destructive">
                        Saldo pendiente: {formatMoney(pendingAmount)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                    <p className="rounded-lg border border-border bg-background p-3 text-xl font-bold xl:p-4 xl:text-2xl">
                      {formatMoney(sale.total)}
                    </p>
                    <Button asChild className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-5 xl:text-lg">
                      <Link href={`/ventas/${sale.id}`}>
                        <Eye className="size-6" aria-hidden="true" />
                        Ver
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-5 xl:text-lg"
                    >
                      <Link href={`/ventas/${sale.id}?print=1`}>
                        <Printer className="size-6" aria-hidden="true" />
                        Imprimir
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
