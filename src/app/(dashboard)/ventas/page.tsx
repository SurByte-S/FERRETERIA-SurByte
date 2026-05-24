import Link from "next/link";
import { AlertTriangle, BarChart3, Eye, Printer, ReceiptText } from "lucide-react";

import { ExportMenuButton } from "@/components/common/export-menu-button";
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
import { cn } from "@/lib/utils";

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
  created_at: string;
  customers: { name: string } | null;
};

type SaleItemRow = {
  id: string;
  sale_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
};

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  stock_quantity: number | null;
  min_stock: number | null;
  sale_price: number | null;
  cost_without_tax: number | null;
  cost_with_tax: number | null;
};

type ProductMovement = {
  code: string;
  estimatedGain: number | null;
  hasCost: boolean;
  id: string;
  minStock: number;
  name: string;
  quantity: number;
  stock: number;
  total: number;
};

type ReplenishmentRow = ProductMovement & {
  suggestion: "Reponer" | "Revisar" | "OK";
};

type RangeOption = "today" | "7" | "15" | "30" | "month";

type DateRange = {
  end: string;
  key: RangeOption;
  label: string;
  start: string;
};

type BusinessSummary = {
  estimatedGain: number | null;
  hasAnyCost: boolean;
  hasMissingCosts: boolean;
  pending: number;
  salesCount: number;
  totalPaid: number;
  totalSold: number;
};

const RANGE_OPTIONS: { key: RangeOption; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7", label: "Ultimos 7 dias" },
  { key: "15", label: "Ultimos 15 dias" },
  { key: "30", label: "Ultimos 30 dias" },
  { key: "month", label: "Este mes" },
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
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
    label: RANGE_OPTIONS.find((option) => option.key === key)?.label ?? "Ultimos 7 dias",
    start: start.toISOString(),
  };
}

function getBarWidth(value: number, max: number) {
  if (value <= 0 || max <= 0) {
    return 0;
  }

  return Math.max((value / max) * 100, 10);
}

function getCurrentCost(product?: ProductRow) {
  const costWithTax = Number(product?.cost_with_tax ?? 0);
  const costWithoutTax = Number(product?.cost_without_tax ?? 0);

  if (costWithTax > 0) {
    return costWithTax;
  }

  if (costWithoutTax > 0) {
    return costWithoutTax;
  }

  return null;
}

function buildProductMovements(
  items: SaleItemRow[],
  productsById: Map<string, ProductRow>
) {
  const movements = new Map<string, ProductMovement>();

  for (const item of items) {
    const product = item.product_id ? productsById.get(item.product_id) : undefined;
    const key = item.product_id ?? `${item.sku ?? ""}-${item.name}`;
    const quantity = Number(item.quantity ?? 0);
    const total = Number(item.total ?? 0);
    const cost = getCurrentCost(product);
    const current = movements.get(key) ?? {
      code: product?.sku ?? item.sku ?? "-",
      estimatedGain: 0,
      hasCost: true,
      id: key,
      minStock: Number(product?.min_stock ?? 0),
      name: product?.name ?? item.name,
      quantity: 0,
      stock: Number(product?.stock_quantity ?? 0),
      total: 0,
    };

    current.quantity += quantity;
    current.total += total;

    if (cost === null) {
      current.hasCost = false;
      current.estimatedGain = null;
    } else if (current.estimatedGain !== null) {
      current.estimatedGain += total - quantity * cost;
    }

    movements.set(key, current);
  }

  return [...movements.values()];
}

function summarizeBusiness(
  sales: SaleRow[],
  movements: ProductMovement[]
): BusinessSummary {
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
  const hasAnyCost = movements.some((movement) => movement.hasCost);
  const hasMissingCosts = movements.some((movement) => !movement.hasCost);
  const estimatedGain = hasAnyCost
    ? movements.reduce(
        (sum, movement) => sum + (movement.estimatedGain ?? 0),
        0
      )
    : null;

  return {
    estimatedGain,
    hasAnyCost,
    hasMissingCosts,
    pending,
    salesCount: sales.length,
    totalPaid,
    totalSold,
  };
}

function getReplenishmentRows(movements: ProductMovement[]) {
  return movements
    .map<ReplenishmentRow>((movement) => {
      let suggestion: ReplenishmentRow["suggestion"] = "OK";

      if (
        movement.stock <= 0 ||
        (movement.minStock > 0 && movement.stock <= movement.minStock)
      ) {
        suggestion = "Reponer";
      } else if (movement.minStock > 0 && movement.stock <= movement.minStock + movement.quantity) {
        suggestion = "Revisar";
      }

      return { ...movement, suggestion };
    })
    .filter((movement) => movement.suggestion !== "OK")
    .sort((first, second) => {
      const priority = { Reponer: 0, Revisar: 1, OK: 2 };
      return priority[first.suggestion] - priority[second.suggestion];
    })
    .slice(0, 15);
}

function getSaleItemCounts(items: SaleItemRow[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.sale_id, (counts.get(item.sale_id) ?? 0) + 1);
  }

  return counts;
}

function MetricCard({
  description,
  title,
  tone = "default",
  value,
}: {
  description: string;
  title: string;
  tone?: "default" | "good" | "warning";
  value: string;
}) {
  return (
    <Card
      className={cn(
        "min-h-36 border-2 border-border bg-card",
        tone === "good" && "border-emerald-500/40 bg-emerald-50",
        tone === "warning" && "border-destructive/40 bg-destructive/10"
      )}
    >
      <CardContent className="p-4 xl:p-5">
        <p className="text-lg font-bold text-foreground">{title}</p>
        <p className="mt-3 text-3xl font-bold leading-tight text-primary xl:text-4xl">
          {value}
        </p>
        <p className="mt-3 text-base font-semibold text-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

function RangeFilters({ activeRange }: { activeRange: RangeOption }) {
  return (
    <nav aria-label="Periodo del resumen" className="flex flex-wrap gap-3">
      {RANGE_OPTIONS.map((option) => (
        <Button
          key={option.key}
          asChild
          className="h-13 px-5 text-lg xl:h-14"
          variant={activeRange === option.key ? "default" : "outline"}
        >
          <Link href={`/ventas?range=${option.key}`}>{option.label}</Link>
        </Button>
      ))}
    </nav>
  );
}

function CajaDelPeriodo({ summary }: { summary: BusinessSummary }) {
  const gainTitle = summary.hasAnyCost ? "Ganancia estimada" : "Faltan costos";
  const gainValue = summary.hasAnyCost
    ? formatMoney(summary.estimatedGain ?? 0)
    : "Faltan costos";

  return (
    <section className="grid gap-4" aria-labelledby="caja-periodo-title">
      <div>
        <h2 id="caja-periodo-title" className="text-2xl font-bold text-foreground">
          Caja del periodo
        </h2>
        <p className="text-base font-semibold text-foreground">
          Lo principal para revisar plata vendida y cobrada.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          description="Total vendido en ventas registradas"
          title="Vendido"
          value={formatMoney(summary.totalSold)}
        />
        <MetricCard
          description="Dinero marcado como cobrado"
          title="Cobrado"
          tone="good"
          value={formatMoney(summary.totalPaid)}
        />
        <MetricCard
          description={
            summary.hasAnyCost
              ? "Calculada con costo actual del producto"
              : "Cargue costos para poder estimar"
          }
          title={gainTitle}
          tone={summary.hasAnyCost ? "default" : "warning"}
          value={gainValue}
        />
        <MetricCard
          description="Cantidad de operaciones"
          title="Ventas realizadas"
          value={String(summary.salesCount)}
        />
      </div>
      {summary.pending > 0 ? (
        <p className="rounded-md border border-border bg-secondary p-4 text-base font-bold text-foreground">
          Hay ventas pendientes de cobro. Revisar solo si usan cuenta corriente.
        </p>
      ) : null}
    </section>
  );
}

function ImportantNotices({
  hasItems,
  replenishmentCount,
  summary,
}: {
  hasItems: boolean;
  replenishmentCount: number;
  summary: BusinessSummary;
}) {
  const notices: string[] = [];

  if (summary.salesCount === 0) {
    notices.push("No hay ventas en este periodo.");
  }

  if (!hasItems && summary.salesCount > 0) {
    notices.push("No hay detalle suficiente para mostrar productos vendidos.");
  }

  if (summary.hasMissingCosts) {
    notices.push("Hay productos vendidos sin costo cargado.");
  }

  if (summary.hasAnyCost) {
    notices.push("La ganancia es estimada porque usa el costo actual.");
  }

  if (replenishmentCount > 0) {
    notices.push("Hay productos vendidos que quedaron bajo stock.");
  }

  if (notices.length === 0) {
    notices.push("No hay avisos importantes para este periodo.");
  }

  return (
    <Card className="border-2 border-border bg-secondary">
      <CardHeader>
        <div className="flex items-center gap-3">
          <AlertTriangle className="size-7 text-primary" aria-hidden="true" />
          <CardTitle className="text-2xl">Avisos importantes</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3">
          {notices.map((notice) => (
            <li
              key={notice}
              className="rounded-md border border-border bg-card p-3 text-lg font-bold text-foreground"
            >
              {notice}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ProductMovementsTable({ movements }: { movements: ProductMovement[] }) {
  const rows = [...movements]
    .sort((first, second) => second.quantity - first.quantity)
    .slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Productos que se movieron</CardTitle>
        <CardDescription className="text-base font-semibold text-foreground">
          Ordenado por cantidad vendida.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-border bg-muted p-4 text-lg font-bold text-foreground">
            No hay detalle suficiente para mostrar productos vendidos.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead className="bg-muted">
                <tr className="border-b border-border">
                  <TableHead>Producto</TableHead>
                  <TableHead>Codigo</TableHead>
                  <TableHead align="right">Cantidad vendida</TableHead>
                  <TableHead align="right">Total vendido</TableHead>
                  <TableHead align="right">Ganancia estimada</TableHead>
                  <TableHead align="right">Stock actual</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((movement) => (
                  <tr
                    key={movement.id}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <TableCell strong>{movement.name}</TableCell>
                    <TableCell>{movement.code}</TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(movement.quantity)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatMoney(movement.total)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {movement.estimatedGain === null
                        ? "Falta costo"
                        : formatMoney(movement.estimatedGain)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(movement.stock)}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReplenishmentTable({ rows }: { rows: ReplenishmentRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Para reponer</CardTitle>
        <CardDescription className="text-base font-semibold text-foreground">
          Productos vendidos que quedaron sin stock, bajo minimo o cerca del minimo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-border bg-muted p-4 text-lg font-bold text-foreground">
            No hay productos vendidos para reponer en este periodo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead className="bg-muted">
                <tr className="border-b border-border">
                  <TableHead>Producto</TableHead>
                  <TableHead>Codigo</TableHead>
                  <TableHead align="right">Vendido</TableHead>
                  <TableHead align="right">Stock actual</TableHead>
                  <TableHead align="right">Stock minimo</TableHead>
                  <TableHead>Sugerencia</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <TableCell strong>{row.name}</TableCell>
                    <TableCell>{row.code}</TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(row.quantity)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(row.stock)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(row.minStock)}
                    </TableCell>
                    <TableCell strong>
                      <span
                        className={cn(
                          "rounded-md border px-3 py-1 text-base font-bold",
                          row.suggestion === "Reponer"
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-border bg-secondary text-foreground"
                        )}
                      >
                        {row.suggestion}
                      </span>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopMoneyTable({ movements }: { movements: ProductMovement[] }) {
  const rows = [...movements]
    .sort((first, second) => second.total - first.total)
    .slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Productos que mas plata dejaron</CardTitle>
        <CardDescription className="text-base font-semibold text-foreground">
          Plata vendida no siempre significa ganancia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-border bg-muted p-4 text-lg font-bold text-foreground">
            No hay productos vendidos para mostrar.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead className="bg-muted">
                <tr className="border-b border-border">
                  <TableHead>Producto</TableHead>
                  <TableHead align="right">Cantidad vendida</TableHead>
                  <TableHead align="right">Total vendido</TableHead>
                  <TableHead align="right">Ganancia estimada</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((movement) => (
                  <tr
                    key={movement.id}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <TableCell strong>{movement.name}</TableCell>
                    <TableCell align="right" strong>
                      {formatNumber(movement.quantity)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatMoney(movement.total)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {movement.estimatedGain === null
                        ? "Falta costo"
                        : formatMoney(movement.estimatedGain)}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductsChart({ movements }: { movements: ProductMovement[] }) {
  const rows = [...movements]
    .sort((first, second) => second.quantity - first.quantity)
    .slice(0, 10);
  const maxQuantity = Math.max(...rows.map((row) => row.quantity), 0);

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <BarChart3 className="size-7" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Productos mas vendidos</CardTitle>
        <CardDescription className="text-base font-semibold text-foreground">
          Barras simples por cantidad vendida.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded-md border border-border bg-muted p-4 text-lg font-bold text-foreground">
            No hay productos vendidos para graficar.
          </p>
        ) : (
          <div className="grid gap-3" role="list">
            {rows.map((row) => {
              const width = getBarWidth(row.quantity, maxQuantity);

              return (
                <div
                  key={row.id}
                  className="grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[260px_minmax(0,1fr)_190px] md:items-center"
                  role="listitem"
                >
                  <div>
                    <p className="text-lg font-bold text-foreground">{row.name}</p>
                    <p className="text-base font-semibold text-foreground">
                      {row.code}
                    </p>
                  </div>
                  <div className="min-h-11 rounded-md bg-muted p-1">
                    <div
                      aria-label={`${row.name}: ${formatNumber(row.quantity)} vendidos`}
                      className="flex h-9 items-center rounded-md bg-primary px-3 text-primary-foreground"
                      style={{ width: `${width}%` }}
                    >
                      <span className="truncate text-base font-bold">
                        {formatNumber(row.quantity)}
                      </span>
                    </div>
                  </div>
                  <p className="text-right text-xl font-bold text-foreground">
                    {formatMoney(row.total)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LatestSales({
  itemCounts,
  sales,
}: {
  itemCounts: Map<string, number>;
  sales: SaleRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ReceiptText className="size-7" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Resumen de ventas</CardTitle>
        <CardDescription className="text-base font-semibold text-foreground">
          Ultimas ventas del periodo seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sales.length === 0 ? (
          <p className="rounded-md border border-border bg-muted p-4 text-lg font-bold text-foreground">
            No hay ventas en este periodo.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead className="bg-muted">
                <tr className="border-b border-border">
                  <TableHead>Fecha</TableHead>
                  <TableHead>N venta</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead align="right">Total</TableHead>
                  <TableHead align="right">Cobrado</TableHead>
                  <TableHead align="right">Productos</TableHead>
                  <TableHead align="right">Acciones</TableHead>
                </tr>
              </thead>
              <tbody>
                {sales.slice(0, 20).map((sale) => (
                  <tr
                    key={sale.id}
                    className="border-b border-border last:border-b-0 even:bg-muted/25"
                  >
                    <TableCell>{formatDate(sale.created_at)}</TableCell>
                    <TableCell strong>#{sale.sale_number}</TableCell>
                    <TableCell>{sale.customers?.name ?? "Sin cliente"}</TableCell>
                    <TableCell align="right" strong>
                      {formatMoney(sale.total)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {formatMoney(sale.paid_amount)}
                    </TableCell>
                    <TableCell align="right" strong>
                      {itemCounts.get(sale.id) ?? 0}
                    </TableCell>
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
                          className="h-11 gap-2 px-4 text-base"
                          variant="outline"
                        >
                          <Link href={`/ventas/${sale.id}`}>
                            <Printer className="size-5" aria-hidden="true" />
                            Imprimir
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableHead({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "px-4 py-4 text-base font-bold text-foreground",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}

function TableCell({
  align = "left",
  children,
  strong = false,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-4 py-4 text-base text-foreground",
        strong && "font-bold",
        align === "right" && "text-right"
      )}
    >
      {children}
    </td>
  );
}

async function loadSaleItems(tenantId: string, saleIds: string[]) {
  if (saleIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("sale_items")
    .select("id,sale_id,product_id,sku,name,quantity,unit_price,total")
    .eq("tenant_id", tenantId)
    .in("sale_id", saleIds);

  if (error) {
    return [];
  }

  return (data ?? []) as unknown as SaleItemRow[];
}

async function loadProducts(tenantId: string, productIds: string[]) {
  const uniqueIds = [...new Set(productIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return new Map<string, ProductRow>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,sku,name,stock_quantity,min_stock,sale_price,cost_without_tax,cost_with_tax"
    )
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds);

  if (error) {
    return new Map<string, ProductRow>();
  }

  const rows = (data ?? []) as unknown as ProductRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

export default async function VentasPage({ searchParams }: VentasPageProps) {
  const params = await searchParams;
  const range = getRangeFromSearchParams(params.range);
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const salesResult = await supabase
    .from("sales")
    .select("id,sale_number,total,paid_amount,created_at,customers(name)")
    .eq("tenant_id", tenant.id)
    .gte("created_at", range.start)
    .lte("created_at", range.end)
    .order("created_at", { ascending: false });

  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const saleItems = await loadSaleItems(
    tenant.id,
    sales.map((sale) => sale.id)
  );
  const products = await loadProducts(
    tenant.id,
    saleItems
      .map((item) => item.product_id)
      .filter((id): id is string => Boolean(id))
  );
  const movements = buildProductMovements(saleItems, products);
  const summary = summarizeBusiness(sales, movements);
  const replenishmentRows = getReplenishmentRows(movements);
  const itemCounts = getSaleItemCounts(saleItems);
  const exportQuery = `range=${range.key}`;

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          backHref="/inicio"
          backLabel="Volver al inicio"
          description="Plata vendida, productos que se movieron y reposicion sugerida."
          title="Resumen del negocio"
        />
        <div className="lg:pt-1">
          <ExportMenuButton
            csvHref={`/api/export/estadisticas?format=csv&${exportQuery}`}
            label="Exportar resumen"
            pdfHref={`/api/export/estadisticas?format=pdf&${exportQuery}`}
          />
        </div>
      </div>

      <div className="grid gap-5">
        <RangeFilters activeRange={range.key} />

        {salesResult.error ? (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-2xl">
                No se pudo cargar el resumen
              </CardTitle>
              <CardDescription className="text-lg font-semibold text-foreground">
                Revise la conexion antes de tomar decisiones.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <CajaDelPeriodo summary={summary} />
        <ImportantNotices
          hasItems={saleItems.length > 0}
          replenishmentCount={replenishmentRows.length}
          summary={summary}
        />

        {!salesResult.error ? (
          <>
            <ProductMovementsTable movements={movements} />
            <ReplenishmentTable rows={replenishmentRows} />
            <TopMoneyTable movements={movements} />
            <ProductsChart movements={movements} />
            <LatestSales itemCounts={itemCounts} sales={sales} />
          </>
        ) : null}
      </div>
    </>
  );
}
