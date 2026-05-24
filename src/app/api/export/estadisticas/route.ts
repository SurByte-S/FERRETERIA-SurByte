import { createSimplePdf, pdfResponse } from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type RangeOption = "today" | "7" | "15" | "30" | "month";

type DateRange = {
  end: string;
  key: RangeOption;
  label: string;
  start: string;
};

type SaleExportRow = {
  id: string;
  sale_number: number | null;
  total: number | null;
  paid_amount: number | null;
  created_at: string;
  customers: { name: string } | null;
};

type SaleItemExportRow = {
  sale_id: string;
  product_id: string | null;
  sku: string | null;
  name: string;
  quantity: number | null;
  total: number | null;
};

type ProductExportRow = {
  id: string;
  sku: string;
  name: string;
  stock_quantity: number | null;
  min_stock: number | null;
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

type Summary = {
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

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const params = new URL(request.url).searchParams;
    const format = params.get("format") ?? "csv";
    const range = getRangeFromSearchParams(params.get("range") ?? undefined);
    const sales = await loadSales(tenant.id, range);
    const items = await loadSaleItems(
      tenant.id,
      sales.map((sale) => sale.id)
    );
    const products = await loadProducts(
      tenant.id,
      items
        .map((item) => item.product_id)
        .filter((id): id is string => Boolean(id))
    );
    const movements = buildProductMovements(items, products);
    const summary = summarize(sales, movements);
    const replenishmentRows = getReplenishmentRows(movements);
    const itemCounts = getSaleItemCounts(items);
    const date = new Date().toISOString().slice(0, 10);
    const generatedAt = new Date().toLocaleString("es-AR");
    const filenameBase = `resumen-negocio-${date}`;

    if (format === "pdf") {
      return pdfResponse({
        filename: `${filenameBase}.pdf`,
        pdf: createSimplePdf({
          title: "Resumen del negocio",
          subtitle: tenant.name,
          meta: [
            `Periodo: ${range.label}`,
            `Fecha de generacion: ${generatedAt}`,
            summary.hasAnyCost
              ? "La ganancia es estimada porque usa el costo actual."
              : "Faltan costos para estimar ganancia.",
          ],
          sections: [
            {
              title: "Caja del periodo",
              lines: [
                `Vendido: ${formatMoney(summary.totalSold)}`,
                `Cobrado: ${formatMoney(summary.totalPaid)}`,
                `Ganancia estimada: ${
                  summary.hasAnyCost
                    ? formatMoney(summary.estimatedGain ?? 0)
                    : "Faltan costos"
                }`,
                `Ventas realizadas: ${summary.salesCount}`,
                summary.pending > 0
                  ? `Hay ventas pendientes de cobro: ${formatMoney(summary.pending)}`
                  : "No hay pendientes de cobro en el periodo.",
              ],
            },
            {
              title: "Avisos importantes",
              lines: buildNotices(summary, items.length > 0, replenishmentRows.length),
            },
            {
              title: "Productos que se movieron",
              lines: movements
                .sort((first, second) => second.quantity - first.quantity)
                .slice(0, 15)
                .map(
                  (movement) =>
                    `${movement.name} | ${movement.code} | ${formatNumber(
                      movement.quantity
                    )} vendidos | ${formatMoney(movement.total)} | ${
                      movement.estimatedGain === null
                        ? "Falta costo"
                        : formatMoney(movement.estimatedGain)
                    } | Stock ${formatNumber(movement.stock)}`
                ),
            },
            {
              title: "Para reponer",
              lines:
                replenishmentRows.length > 0
                  ? replenishmentRows.map(
                      (row) =>
                        `${row.name} | ${row.code} | vendido ${formatNumber(
                          row.quantity
                        )} | stock ${formatNumber(row.stock)} | minimo ${formatNumber(
                          row.minStock
                        )} | ${row.suggestion}`
                    )
                  : ["No hay productos vendidos para reponer en este periodo."],
            },
            {
              title: "Productos que mas plata dejaron",
              lines: movements
                .sort((first, second) => second.total - first.total)
                .slice(0, 15)
                .map(
                  (movement) =>
                    `${movement.name} | cantidad ${formatNumber(
                      movement.quantity
                    )} | ${formatMoney(movement.total)} | ${
                      movement.estimatedGain === null
                        ? "Falta costo"
                        : formatMoney(movement.estimatedGain)
                    }`
                ),
            },
          ],
          table: {
            headers: ["Fecha", "N venta", "Cliente", "Total", "Cobrado", "Productos"],
            rows: sales.slice(0, 100).map((sale) => [
              formatDate(sale.created_at),
              sale.sale_number ? `#${sale.sale_number}` : "-",
              sale.customers?.name ?? "Sin cliente",
              formatMoney(Number(sale.total ?? 0)),
              formatMoney(Number(sale.paid_amount ?? 0)),
              itemCounts.get(sale.id) ?? 0,
            ]),
          },
        }),
      });
    }

    return csvResponse({
      csv: createResumenCsv({
        itemCounts,
        movements,
        range,
        replenishmentRows,
        sales,
        summary,
      }),
      filename: `${filenameBase}.csv`,
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
    }

    return new Response(
      error instanceof Error ? error.message : "No se pudo exportar el resumen.",
      { status: 500 }
    );
  }
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

async function loadSales(tenantId: string, range: DateRange) {
  const supabase = getSupabaseServerClient();
  const rows: SaleExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sales")
      .select("id,sale_number,total,paid_amount,created_at,customers(name)")
      .eq("tenant_id", tenantId)
      .gte("created_at", range.start)
      .lte("created_at", range.end)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudieron exportar las ventas.");
    }

    const batch = (data ?? []) as unknown as SaleExportRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }
  }
}

async function loadSaleItems(tenantId: string, saleIds: string[]) {
  if (saleIds.length === 0) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const rows: SaleItemExportRow[] = [];
  const chunkSize = 500;

  for (let index = 0; index < saleIds.length; index += chunkSize) {
    const { data, error } = await supabase
      .from("sale_items")
      .select("sale_id,product_id,sku,name,quantity,total")
      .eq("tenant_id", tenantId)
      .in("sale_id", saleIds.slice(index, index + chunkSize));

    if (error) {
      throw new Error("No se pudieron exportar los productos vendidos.");
    }

    rows.push(...((data ?? []) as unknown as SaleItemExportRow[]));
  }

  return rows;
}

async function loadProducts(tenantId: string, productIds: string[]) {
  const uniqueIds = [...new Set(productIds)];

  if (uniqueIds.length === 0) {
    return new Map<string, ProductExportRow>();
  }

  const supabase = getSupabaseServerClient();
  const rows: ProductExportRow[] = [];
  const chunkSize = 500;

  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const { data, error } = await supabase
      .from("products")
      .select("id,sku,name,stock_quantity,min_stock,cost_without_tax,cost_with_tax")
      .eq("tenant_id", tenantId)
      .in("id", uniqueIds.slice(index, index + chunkSize));

    if (error) {
      throw new Error("No se pudieron exportar los datos de productos.");
    }

    rows.push(...((data ?? []) as unknown as ProductExportRow[]));
  }

  return new Map(rows.map((row) => [row.id, row]));
}

function buildProductMovements(
  items: SaleItemExportRow[],
  productsById: Map<string, ProductExportRow>
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

function getCurrentCost(product?: ProductExportRow) {
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

function summarize(sales: SaleExportRow[], movements: ProductMovement[]): Summary {
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

function getSaleItemCounts(items: SaleItemExportRow[]) {
  const counts = new Map<string, number>();

  for (const item of items) {
    counts.set(item.sale_id, (counts.get(item.sale_id) ?? 0) + 1);
  }

  return counts;
}

function buildNotices(
  summary: Summary,
  hasItems: boolean,
  replenishmentCount: number
) {
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

  return notices.length > 0
    ? notices
    : ["No hay avisos importantes para este periodo."];
}

function createResumenCsv({
  itemCounts,
  movements,
  range,
  replenishmentRows,
  sales,
  summary,
}: {
  itemCounts: Map<string, number>;
  movements: ProductMovement[];
  range: DateRange;
  replenishmentRows: ReplenishmentRow[];
  sales: SaleExportRow[];
  summary: Summary;
}) {
  const rows: CsvValue[][] = [];
  const movedRows = [...movements].sort(
    (first, second) => second.quantity - first.quantity
  );
  const moneyRows = [...movements].sort(
    (first, second) => second.total - first.total
  );

  rows.push(["Caja del periodo"]);
  rows.push(["Periodo", range.label]);
  rows.push(["Vendido", formatMoney(summary.totalSold)]);
  rows.push(["Cobrado", formatMoney(summary.totalPaid)]);
  rows.push([
    "Ganancia estimada",
    summary.hasAnyCost ? formatMoney(summary.estimatedGain ?? 0) : "Faltan costos",
  ]);
  rows.push(["Ventas realizadas", summary.salesCount]);
  rows.push(["Pendiente de cobro", formatMoney(summary.pending)]);
  rows.push([]);

  rows.push(["Productos que se movieron"]);
  rows.push([
    "Producto",
    "Codigo",
    "Cantidad vendida",
    "Total vendido",
    "Ganancia estimada",
    "Stock actual",
  ]);
  rows.push(
    ...movedRows.slice(0, 15).map((movement) => [
      movement.name,
      movement.code,
      formatNumber(movement.quantity),
      formatMoney(movement.total),
      movement.estimatedGain === null
        ? "Falta costo"
        : formatMoney(movement.estimatedGain),
      formatNumber(movement.stock),
    ])
  );
  rows.push([]);

  rows.push(["Para reponer"]);
  rows.push([
    "Producto",
    "Codigo",
    "Vendido",
    "Stock actual",
    "Stock minimo",
    "Sugerencia",
  ]);
  rows.push(
    ...replenishmentRows.map((row) => [
      row.name,
      row.code,
      formatNumber(row.quantity),
      formatNumber(row.stock),
      formatNumber(row.minStock),
      row.suggestion,
    ])
  );
  rows.push([]);

  rows.push(["Productos que mas plata dejaron"]);
  rows.push(["Producto", "Cantidad vendida", "Total vendido", "Ganancia estimada"]);
  rows.push(
    ...moneyRows.slice(0, 15).map((movement) => [
      movement.name,
      formatNumber(movement.quantity),
      formatMoney(movement.total),
      movement.estimatedGain === null
        ? "Falta costo"
        : formatMoney(movement.estimatedGain),
    ])
  );
  rows.push([]);

  rows.push(["Resumen de ventas"]);
  rows.push(["Fecha", "N venta", "Cliente", "Total", "Cobrado", "Productos"]);
  rows.push(
    ...sales.map((sale) => [
      formatDate(sale.created_at),
      sale.sale_number ? `#${sale.sale_number}` : "-",
      sale.customers?.name ?? "Sin cliente",
      formatMoney(Number(sale.total ?? 0)),
      formatMoney(Number(sale.paid_amount ?? 0)),
      itemCounts.get(sale.id) ?? 0,
    ])
  );

  return `\uFEFF${rows.map((row) => row.map(escapeCsvValue).join(";")).join("\r\n")}`;
}

type CsvValue = string | number | boolean | null | undefined;

function escapeCsvValue(value: CsvValue) {
  const text = value === null || value === undefined ? "" : String(value);

  if (/[";\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function csvResponse({ csv, filename }: { csv: string; filename: string }) {
  return new Response(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
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
