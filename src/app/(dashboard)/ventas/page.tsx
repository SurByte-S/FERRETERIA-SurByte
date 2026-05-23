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
import { cn } from "@/lib/utils";
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

type RangeOption = "today" | "7" | "15" | "30" | "month";

type DateRange = {
  end: string;
  key: RangeOption;
  label: string;
  start: string;
};

type DailySale = {
  average: number;
  count: number;
  date: Date;
  dateKey: string;
  dayName: string;
  paid: number;
  pending: number;
  shortDate: string;
  total: number;
};

type SalesSummary = {
  averageTicket: number;
  byPaymentMethod: Record<string, number>;
  pending: number;
  totalPaid: number;
  totalSold: number;
};

const RANGE_OPTIONS: { key: RangeOption; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7", label: "Últimos 7 días" },
  { key: "15", label: "Últimos 15 días" },
  { key: "30", label: "Últimos 30 días" },
  { key: "month", label: "Este mes" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
    style: "percent",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDayDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dayName(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
  }).format(date);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function normalizeRange(value?: string): RangeOption {
  if (
    value === "today" ||
    value === "15" ||
    value === "30" ||
    value === "month"
  ) {
    return value;
  }

  return "7";
}

function getRangeFromSearchParams(range?: string): DateRange {
  const key = normalizeRange(range);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (key === "month") {
    start.setDate(1);
  } else if (key !== "today") {
    start.setDate(start.getDate() - (Number(key) - 1));
  }

  return {
    end: end.toISOString(),
    key,
    label: RANGE_OPTIONS.find((option) => option.key === key)?.label ?? "Últimos 7 días",
    start: start.toISOString(),
  };
}

function buildDailySales(sales: SaleRow[], range: DateRange) {
  const startDate = new Date(range.start);
  const endDate = new Date(range.end);
  const days: DailySale[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    days.push({
      average: 0,
      count: 0,
      date: new Date(cursor),
      dateKey: formatDateKey(cursor),
      dayName: dayName(cursor),
      paid: 0,
      pending: 0,
      shortDate: shortDate(cursor),
      total: 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const byKey = new Map(days.map((day) => [day.dateKey, day]));

  for (const sale of sales) {
    const key = formatDateKey(new Date(sale.created_at));
    const day = byKey.get(key);

    if (!day) {
      continue;
    }

    const total = Number(sale.total ?? 0);
    const paid = Number(sale.paid_amount ?? 0);

    day.count += 1;
    day.total += total;
    day.paid += paid;
    day.pending += Math.max(total - paid, 0);
  }

  return days.map((day) => ({
    ...day,
    average: day.count > 0 ? day.total / day.count : 0,
  }));
}

function normalizePaymentMethod(value: string | null) {
  return value?.trim() || "Sin forma de pago";
}

function getBarWidth(total: number, max: number) {
  if (total <= 0 || max <= 0) {
    return 0;
  }

  return Math.max((total / max) * 100, 10);
}

function summarizeSales(sales: SaleRow[]): SalesSummary {
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const totalPaid = sales.reduce(
    (sum, sale) => sum + Number(sale.paid_amount ?? 0),
    0
  );
  const pending = sales.reduce((sum, sale) => {
    const total = Number(sale.total ?? 0);
    const paid = Number(sale.paid_amount ?? 0);
    return sum + Math.max(total - paid, 0);
  }, 0);
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
  tone = "default",
}: {
  description: string;
  title: string;
  value: string;
  tone?: "default" | "paid" | "pending";
}) {
  return (
    <Card
      className={cn(
        "min-h-36 border-2 border-border",
        tone === "paid" && "border-emerald-500/40 bg-emerald-50",
        tone === "pending" && "border-destructive/40 bg-destructive/10"
      )}
    >
      <CardContent className="p-4 xl:p-5">
        <p className="text-lg font-bold text-foreground">{title}</p>
        <p className="mt-3 text-3xl font-bold leading-tight text-primary xl:text-4xl">
          {value}
        </p>
        <p className="mt-3 text-base font-medium text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md border border-border bg-secondary p-4 text-lg font-semibold text-foreground">
      <AlertTriangle
        className="mt-0.5 size-6 shrink-0 text-primary"
        aria-hidden="true"
      />
      <p>{children}</p>
    </div>
  );
}

function RangeFilters({ activeRange }: { activeRange: RangeOption }) {
  return (
    <nav aria-label="Período de estadísticas" className="flex flex-wrap gap-3">
      {RANGE_OPTIONS.map((option) => (
        <Button
          key={option.key}
          asChild
          variant={activeRange === option.key ? "default" : "outline"}
          className="h-13 px-5 text-lg xl:h-14"
        >
          <Link href={`/ventas?range=${option.key}`}>{option.label}</Link>
        </Button>
      ))}
    </nav>
  );
}

function SummaryCards({
  salesCount,
  summary,
}: {
  salesCount: number;
  summary: SalesSummary;
}) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <MetricCard
        title="Total vendido"
        description="Ventas registradas en el período"
        value={formatMoney(summary.totalSold)}
      />
      <MetricCard
        title="Total cobrado"
        description="Dinero registrado como pagado"
        tone="paid"
        value={formatMoney(summary.totalPaid)}
      />
      <MetricCard
        title="Pendiente de cobro"
        description="Importe que falta cobrar"
        tone="pending"
        value={formatMoney(summary.pending)}
      />
      <MetricCard
        title="Cantidad de ventas"
        description="Operaciones registradas"
        value={String(salesCount)}
      />
      <MetricCard
        title="Promedio por venta"
        description="Total vendido dividido por ventas"
        value={formatMoney(summary.averageTicket)}
      />
    </section>
  );
}

function DailySalesTable({ days }: { days: DailySale[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Ventas por día</CardTitle>
        <CardDescription className="text-base">
          Planilla diaria para comparar ventas, cobros y pendientes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="bg-muted/70">
              <tr className="border-b border-border">
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Fecha
                </th>
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Día
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Cantidad de ventas
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Total vendido
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Total cobrado
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Pendiente
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Promedio por venta
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day.dateKey}
                  className="border-b border-border last:border-b-0 even:bg-muted/25"
                >
                  <td className="px-4 py-4 text-base font-semibold text-foreground">
                    {formatDayDate(day.date)}
                  </td>
                  <td className="px-4 py-4 text-base capitalize text-foreground">
                    {day.dayName}
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                    {day.count}
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                    {formatMoney(day.total)}
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-emerald-800">
                    {formatMoney(day.paid)}
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-destructive">
                    {formatMoney(day.pending)}
                  </td>
                  <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                    {formatMoney(day.average)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DailySalesChart({ days }: { days: DailySale[] }) {
  const maxTotal = Math.max(...days.map((day) => day.total), 0);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BarChart3 className="size-7" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Gráfico simple de ventas por día</CardTitle>
        <CardDescription className="text-base">
          La barra más larga es el día que más vendió.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          aria-label="Gráfico simple de ventas por día"
          className="grid gap-3"
          role="list"
        >
          {days.map((day) => {
            const width = getBarWidth(day.total, maxTotal);

            return (
              <div
                key={day.dateKey}
                role="listitem"
                className="grid gap-2 rounded-md border border-border bg-background p-3"
              >
                <div className="grid gap-3 md:grid-cols-[170px_minmax(0,1fr)_180px] md:items-center">
                  <div>
                    <p className="text-lg font-bold capitalize text-foreground">
                      {day.dayName}
                    </p>
                    <p className="text-base font-semibold text-foreground">
                      {day.shortDate} - {day.count} venta
                      {day.count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="min-h-11 rounded-md bg-muted p-1">
                    <div
                      aria-label={`${day.shortDate}: ${formatMoney(day.total)}, ${
                        day.count
                      } ventas`}
                      className={
                        day.total > 0
                          ? "flex h-9 items-center rounded-md bg-primary px-3 text-primary-foreground"
                          : "flex h-9 items-center rounded-md border border-dashed border-border bg-card px-3 text-muted-foreground"
                      }
                      style={{ width: day.total > 0 ? `${width}%` : "100%" }}
                    >
                      <span className="truncate text-base font-bold">
                        {formatMoney(day.total)}
                      </span>
                    </div>
                  </div>
                  <p className="text-right text-2xl font-bold text-foreground">
                    {formatMoney(day.total)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentSummary({
  byPaymentMethod,
  totalSold,
}: {
  byPaymentMethod: Record<string, number>;
  totalSold: number;
}) {
  const entries = Object.entries(byPaymentMethod).sort(([, a], [, b]) => b - a);
  const max = Math.max(...entries.map(([, total]) => total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Resumen por forma de pago</CardTitle>
        <CardDescription className="text-base">
          Total vendido agrupado por forma de pago.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead className="bg-muted/70">
              <tr className="border-b border-border">
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Forma de pago
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Total
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Porcentaje del total
                </th>
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Barra
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([method, total]) => {
                const percent = totalSold > 0 ? total / totalSold : 0;
                const width = getBarWidth(total, max);

                return (
                  <tr
                    key={method}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <td className="px-4 py-4 text-base font-bold text-foreground">
                      {method}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                      {formatMoney(total)}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                      {formatPercent(percent)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="h-7 rounded-md bg-muted p-1">
                        <div
                          className="h-5 rounded bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function LatestSales({ sales }: { sales: SaleRow[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ReceiptText className="size-7" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Últimas ventas</CardTitle>
        <CardDescription className="text-base">
          Ventas recientes del período seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead className="bg-muted/70">
              <tr className="border-b border-border">
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Fecha
                </th>
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Nº venta
                </th>
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Cliente
                </th>
                <th className="px-4 py-4 text-base font-bold text-foreground">
                  Forma de pago
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Total
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Pagado
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Pendiente
                </th>
                <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 20).map((sale) => {
                const pending = Math.max(
                  Number(sale.total ?? 0) - Number(sale.paid_amount ?? 0),
                  0
                );

                return (
                  <tr
                    key={sale.id}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <td className="px-4 py-4 text-base font-semibold text-foreground">
                      {formatDate(sale.created_at)}
                    </td>
                    <td className="px-4 py-4 text-base font-bold text-foreground">
                      #{sale.sale_number}
                    </td>
                    <td className="px-4 py-4 text-base text-foreground">
                      {sale.customers?.name ?? "Sin cliente"}
                    </td>
                    <td className="px-4 py-4 text-base text-foreground">
                      {normalizePaymentMethod(sale.payment_method)}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-bold text-foreground">
                      {formatMoney(sale.total)}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-bold text-emerald-800">
                      {formatMoney(sale.paid_amount)}
                    </td>
                    <td className="px-4 py-4 text-right text-base font-bold text-destructive">
                      {formatMoney(pending)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button asChild className="h-11 gap-2 px-4 text-base">
                          <Link href={`/ventas/${sale.id}`}>
                            <Eye className="size-5" aria-hidden="true" />
                            Ver
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                          className="h-11 gap-2 px-4 text-base"
                        >
                          <Link href={`/ventas/${sale.id}`}>
                            <Printer className="size-5" aria-hidden="true" />
                            Imprimir
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
        title="Estadísticas de ventas"
        description="Resumen de ventas, cobros y movimientos del negocio."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="grid gap-5">
        <RangeFilters activeRange={range.key} />

        {salesResult.error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-2xl">
                No se pudieron cargar las estadísticas
              </CardTitle>
              <CardDescription className="text-lg">
                Revisá la conexión a Supabase.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <SummaryCards salesCount={sales.length} summary={summary} />

        {hasNoSales ? (
          <Notice>
            No hay ventas en este período. Probá elegir otro rango de fechas.
          </Notice>
        ) : null}

        {!salesResult.error && !hasNoSales ? (
          <>
            <DailySalesTable days={dailySales} />
            <DailySalesChart days={dailySales} />
            <PaymentSummary
              byPaymentMethod={summary.byPaymentMethod}
              totalSold={summary.totalSold}
            />
            <LatestSales sales={sales} />
          </>
        ) : null}
      </div>
    </>
  );
}
