import Link from "next/link";

import { ExportMenuButton } from "@/components/common/export-menu-button";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type SaleRow = {
  total: number | null;
  paid_amount: number | null;
  payment_method: string | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export default async function EstadisticasPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const salesResult = await supabase
    .from("sales")
    .select("total,paid_amount,payment_method")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(1000);
  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const totalPaid = sales.reduce(
    (sum, sale) => sum + Number(sale.paid_amount ?? 0),
    0
  );
  const pending = sales.reduce(
    (sum, sale) =>
      sum + Math.max(Number(sale.total ?? 0) - Number(sale.paid_amount ?? 0), 0),
    0
  );
  const averageTicket = sales.length > 0 ? totalSold / sales.length : 0;
  const byPaymentMethod = sales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method?.trim() || "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + Number(sale.total ?? 0);
    return acc;
  }, {});

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Estadísticas"
          description="Resumen de ventas, cobros y movimientos del negocio."
          backHref="/inicio"
          backLabel="Volver al inicio"
          eyebrow=""
        />
        <ExportMenuButton
          csvHref="/api/export/estadisticas?format=csv"
          pdfHref="/api/export/estadisticas?format=pdf"
        />
      </div>

      {salesResult.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>No se pudieron cargar las estadísticas</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Total vendido" value={formatMoney(totalSold)} />
            <MetricCard label="Total cobrado" value={formatMoney(totalPaid)} />
            <MetricCard label="Pendiente" value={formatMoney(pending)} />
            <MetricCard label="Cantidad de ventas" value={String(sales.length)} />
            <MetricCard label="Ticket promedio" value={formatMoney(averageTicket)} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Formas de pago</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {Object.entries(byPaymentMethod).length === 0 ? (
                <p className="text-base font-semibold text-muted-foreground">
                  Todavía no hay ventas para resumir.
                </p>
              ) : (
                Object.entries(byPaymentMethod).map(([method, total]) => (
                  <div
                    key={method}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <span className="font-semibold">{method}</span>
                    <span className="font-bold">{formatMoney(total)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="h-11 w-fit px-4 text-base">
            <Link href="/ventas">Ver estadísticas detalladas por período</Link>
          </Button>
        </div>
      )}
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
