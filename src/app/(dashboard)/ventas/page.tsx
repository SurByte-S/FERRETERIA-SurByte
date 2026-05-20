import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  Eye,
  Printer,
  ReceiptText,
} from "lucide-react";

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

type VentasPageProps = {
  searchParams: Promise<{
    range?: string;
  }>;
};

type SaleRow = {
  id: string;
  sale_number: number;
  total: number;
  paid_amount: number;
  payment_method: string | null;
  created_at: string;
  customers: { name: string } | null;
};

type RangeDays = 7 | 15 | 30;

type DateRange = {
  days: RangeDays;
  end: string;
  start: string;
};

type DailySale = {
  count: number;
  date: Date;
  dateKey: string;
  label: string;
  paid: number;
  shortDate: string;
  total: number;
};

const RANGE_OPTIONS: { days: RangeDays; label: string }[] = [
  { days: 7, label: "Últimos 7 días" },
  { days: 15, label: "Últimos 15 días" },
  { days: 30, label: "Últimos 30 días" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRangeFromSearchParams(range?: string): DateRange {
  const parsedRange = Number(range);
  const days: RangeDays =
    parsedRange === 15 || parsedRange === 30 ? parsedRange : 7;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const end = new Date();
  end.setHours(23, 59, 59, 999);

  return {
    days,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
  })
    .format(date)
    .replace(".", "");
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function buildDailySales(sales: SaleRow[], range: DateRange) {
  const startDate = new Date(range.start);
  const days: DailySale[] = Array.from({ length: range.days }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      count: 0,
      date,
      dateKey: formatDateKey(date),
      label: dayLabel(date),
      paid: 0,
      shortDate: shortDate(date),
      total: 0,
    };
  });
  const byKey = new Map(days.map((day) => [day.dateKey, day]));

  for (const sale of sales) {
    const key = formatDateKey(new Date(sale.created_at));
    const day = byKey.get(key);

    if (!day) {
      continue;
    }

    day.count += 1;
    day.total += Number(sale.total ?? 0);
    day.paid += Number(sale.paid_amount ?? 0);
  }

  return days;
}

function normalizePaymentMethod(value: string | null) {
  return value?.trim() || "Sin forma de pago";
}

function getBarHeight(total: number, max: number) {
  if (total <= 0 || max <= 0) {
    return 0;
  }

  return Math.max((total / max) * 100, 12);
}

function summarizeSales(sales: SaleRow[]) {
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
    const method = normalizePaymentMethod(sale.payment_method);
    acc[method] = (acc[method] ?? 0) + Number(sale.total ?? 0);
    return acc;
  }, {});

  return {
    averageTicket,
    byPaymentMethod,
    pending,
    totalPaid,
    totalSold,
  };
}

function MetricCard({
  description,
  title,
  value,
}: {
  description: string;
  title: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-bold">{title}</CardTitle>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold leading-tight text-primary">{value}</p>
      </CardContent>
    </Card>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-secondary p-4 text-base font-semibold text-secondary-foreground">
      <AlertTriangle className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}

function RangeFilters({ activeRange }: { activeRange: RangeDays }) {
  return (
    <nav aria-label="Rango de estadísticas" className="flex flex-wrap gap-3">
      {RANGE_OPTIONS.map((option) => (
        <Button
          key={option.days}
          asChild
          variant={activeRange === option.days ? "default" : "outline"}
          className="h-14 px-5 text-lg"
        >
          <Link href={`/ventas?range=${option.days}`}>{option.label}</Link>
        </Button>
      ))}
    </nav>
  );
}

function DailySalesChart({ days }: { days: DailySale[] }) {
  const maxTotal = Math.max(...days.map((day) => day.total), 0);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BarChart3 className="size-8" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Ventas por día</CardTitle>
        <CardDescription className="text-base">
          Cada barra muestra cuanto se vendio y cuantas ventas hubo en ese dia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          aria-label="Gráfico de barras de ventas por día"
          className="grid gap-4"
          role="list"
        >
          {days.map((day) => {
            const width = getBarHeight(day.total, maxTotal);

            return (
              <div
                key={day.dateKey}
                role="listitem"
                className="grid gap-2 rounded-lg border border-border bg-background p-3"
              >
                <div className="grid gap-1 sm:grid-cols-[96px_minmax(0,1fr)_180px] sm:items-center">
                  <div>
                    <p className="text-xl font-bold capitalize text-primary">
                      {day.label}
                    </p>
                    <p className="text-lg font-semibold">{day.shortDate}</p>
                  </div>

                  <div className="min-h-12 rounded-lg bg-muted p-1">
                    <div
                      aria-label={`${day.label} ${day.shortDate}: ${formatMoney(
                        day.total
                      )}, ${day.count} ventas`}
                      className={
                        day.total > 0
                          ? "flex h-10 items-center rounded-md bg-primary px-3 text-primary-foreground"
                          : "flex h-10 items-center rounded-md border border-dashed border-border bg-card px-3 text-muted-foreground"
                      }
                      style={{ width: day.total > 0 ? `${width}%` : "100%" }}
                    >
                      <span className="truncate text-base font-bold">
                        {formatMoney(day.total)}
                      </span>
                    </div>
                  </div>

                  <div className="sm:text-right">
                    <p className="text-2xl font-bold">{formatMoney(day.total)}</p>
                    <p className="text-lg font-semibold text-muted-foreground">
                      {day.count} venta{day.count === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentSummary({ byPaymentMethod }: { byPaymentMethod: Record<string, number> }) {
  const entries = Object.entries(byPaymentMethod);
  const max = Math.max(...entries.map(([, total]) => total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Resumen por forma de pago</CardTitle>
        <CardDescription className="text-base">
          Importes agrupados segun la forma de pago registrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {entries.length === 0 ? (
          <p className="text-lg text-muted-foreground">
            No hay formas de pago para mostrar en este periodo.
          </p>
        ) : (
          entries.map(([method, total]) => {
            const width = max > 0 ? Math.max((total / max) * 100, 8) : 0;

            return (
              <div key={method} className="grid gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xl font-bold">{method}</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatMoney(total)}
                  </p>
                </div>
                <div className="h-5 rounded-full bg-muted">
                  <div
                    className="h-5 rounded-full bg-primary"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function AccountingSummary({
  averageTicket,
  pending,
  totalPaid,
  totalSold,
}: {
  averageTicket: number;
  pending: number;
  totalPaid: number;
  totalSold: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Resumen contable simple</CardTitle>
        <CardDescription className="text-base">
          Pendiente de cobro es plata vendida pero todavia no cobrada completamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SmallMetric label="Ventas del periodo" value={formatMoney(totalSold)} />
          <SmallMetric label="Total cobrado" value={formatMoney(totalPaid)} />
          <SmallMetric label="Pendiente de cobro" value={formatMoney(pending)} />
          <SmallMetric label="Ticket promedio" value={formatMoney(averageTicket)} />
        </div>
        <Notice>
          Ganancia real pendiente: para calcular ganancia real falta cargar el costo
          de compra de cada producto. No se muestra rentabilidad estimada.
        </Notice>
      </CardContent>
    </Card>
  );
}

function SmallMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-lg font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold text-primary">{value}</p>
    </div>
  );
}

function LatestSales({ sales }: { sales: SaleRow[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ReceiptText className="size-8" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Ultimas ventas</CardTitle>
        <CardDescription className="text-base">
          Detalle simple de las ventas del periodo seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="text-lg font-semibold text-muted-foreground">
            No hay ventas en este periodo.
          </p>
        ) : (
          <div className="grid gap-3">
            {sales.slice(0, 20).map((sale) => {
              const pending = Math.max(
                Number(sale.total ?? 0) - Number(sale.paid_amount ?? 0),
                0
              );

              return (
                <div
                  key={sale.id}
                  className="grid gap-3 rounded-lg border border-border bg-background p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </p>
                    <h2 className="mt-1 text-2xl font-bold">
                      Venta #{sale.sale_number}
                    </h2>
                    <p className="text-lg">
                      Cliente: {sale.customers?.name ?? "Sin cliente"}
                    </p>
                    <p className="text-lg">
                      Pago: {normalizePaymentMethod(sale.payment_method)}
                    </p>
                    <p className="text-lg font-semibold">
                      Total: {formatMoney(sale.total)} | Pagado:{" "}
                      {formatMoney(sale.paid_amount)} | Pendiente:{" "}
                      {formatMoney(pending)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button asChild className="h-12 gap-2 px-5 text-lg">
                      <Link href={`/ventas/${sale.id}`}>
                        <Eye className="size-5" aria-hidden="true" />
                        Ver
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-12 gap-2 px-5 text-lg"
                    >
                      <Link href={`/ventas/${sale.id}`}>
                        <Printer className="size-5" aria-hidden="true" />
                        Imprimir
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const params = await searchParams;
  const range = getRangeFromSearchParams(params.range);
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const salesResult = await supabase
    .from("sales")
    .select(
      "id,sale_number,total,paid_amount,payment_method,created_at,customers(name)"
    )
    .eq("tenant_id", tenant.id)
    .gte("created_at", range.start)
    .lte("created_at", range.end)
    .order("created_at", { ascending: false });

  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const dailySales = buildDailySales(sales, range);
  const summary = summarizeSales(sales);
  const hasNoSales = !salesResult.error && sales.length === 0;

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description="Ventas por día, caja y resumen simple del negocio."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="grid gap-5">
        <RangeFilters activeRange={range.days} />

        {salesResult.error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-2xl">No se pudieron cargar las estadísticas</CardTitle>
              <CardDescription className="text-lg">
                Revisá la conexión a Supabase.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        {hasNoSales ? (
          <Notice>No hay ventas en este periodo.</Notice>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            title="Total vendido"
            description="Suma de todas las ventas del periodo."
            value={formatMoney(summary.totalSold)}
          />
          <MetricCard
            title="Cantidad de ventas"
            description="Operaciones registradas."
            value={String(sales.length)}
          />
          <MetricCard
            title="Ticket promedio"
            description="Promedio vendido por operacion."
            value={formatMoney(summary.averageTicket)}
          />
          <MetricCard
            title="Total cobrado"
            description="Dinero registrado como pagado."
            value={formatMoney(summary.totalPaid)}
          />
        </section>

        <DailySalesChart days={dailySales} />

        <PaymentSummary byPaymentMethod={summary.byPaymentMethod} />

        <AccountingSummary
          averageTicket={summary.averageTicket}
          pending={summary.pending}
          totalPaid={summary.totalPaid}
          totalSold={summary.totalSold}
        />

        <LatestSales sales={sales} />
      </div>
    </>
  );
}
