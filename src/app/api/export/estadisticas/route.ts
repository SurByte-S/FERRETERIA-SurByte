import { createCsv, csvResponse } from "@/lib/export/csv";
import {
  createPrintableReportHtml,
  printableHtmlResponse,
} from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type SaleExportRow = {
  id: string;
  sale_number: number | null;
  total: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  created_at: string;
  customers: { name: string | null } | null;
};

type SaleItemExportRow = {
  name: string;
  quantity: number | null;
  total: number | null;
};

type StatsSummary = {
  averageTicket: number;
  byPaymentMethod: Record<string, number>;
  pending: number;
  products: { name: string; quantity: number; total: number }[];
  salesCount: number;
  totalPaid: number;
  totalSold: number;
};

const SALES_HEADERS = [
  "Fecha",
  "N venta",
  "Cliente",
  "Forma de pago",
  "Total",
  "Pagado",
  "Pendiente",
];

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const sales = await loadSales(tenant.id);
    const items = await loadSaleItems(
      tenant.id,
      sales.map((sale) => sale.id)
    );
    const summary = summarize(sales, items);
    const date = new Date().toISOString().slice(0, 10);
    const generatedAt = new Date().toLocaleString("es-AR");
    const salesRows = sales.map((sale) => {
      const total = Number(sale.total ?? 0);
      const paid = Number(sale.paid_amount ?? 0);
      return [
        formatDate(sale.created_at),
        sale.sale_number ?? "",
        sale.customers?.name || "Consumidor final",
        sale.payment_method || "Sin forma de pago",
        formatMoney(total),
        formatMoney(paid),
        formatMoney(Math.max(total - paid, 0)),
      ];
    });

    if (format === "pdf") {
      return printableHtmlResponse({
        filename: `estadisticas-${date}.html`,
        html: createPrintableReportHtml({
          title: "Reporte de estadisticas",
          subtitle: tenant.name,
          meta: [`Fecha de generacion: ${generatedAt}`],
          sections: [
            {
              title: "Resumen",
              lines: [
                `Total vendido: ${formatMoney(summary.totalSold)}`,
                `Total cobrado: ${formatMoney(summary.totalPaid)}`,
                `Pendiente de cobro: ${formatMoney(summary.pending)}`,
                `Cantidad de ventas: ${summary.salesCount}`,
                `Ticket promedio: ${formatMoney(summary.averageTicket)}`,
              ],
            },
            {
              title: "Metodos de pago",
              lines: Object.entries(summary.byPaymentMethod).map(
                ([method, total]) => `${method}: ${formatMoney(total)}`
              ),
            },
          ],
          table: {
            headers: SALES_HEADERS,
            rows: salesRows,
          },
        }),
      });
    }

    return csvResponse({
      filename: `estadisticas-${date}.csv`,
      csv: createCsv(SALES_HEADERS, salesRows),
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
    }

    return new Response(
      error instanceof Error ? error.message : "No se pudo exportar estadisticas.",
      { status: 500 }
    );
  }
}

async function loadSales(tenantId: string) {
  const supabase = getSupabaseServerClient();
  const rows: SaleExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sales")
      .select("id,sale_number,total,paid_amount,payment_method,created_at,customers(name)")
      .eq("tenant_id", tenantId)
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
      .select("name,quantity,total")
      .eq("tenant_id", tenantId)
      .in("sale_id", saleIds.slice(index, index + chunkSize));

    if (error) {
      throw new Error("No se pudieron exportar los productos vendidos.");
    }

    rows.push(...((data ?? []) as unknown as SaleItemExportRow[]));
  }

  return rows;
}

function summarize(sales: SaleExportRow[], items: SaleItemExportRow[]): StatsSummary {
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
  const byPaymentMethod = sales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method?.trim() || "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + Number(sale.total ?? 0);
    return acc;
  }, {});
  const productMap = new Map<string, { name: string; quantity: number; total: number }>();

  for (const item of items) {
    const name = item.name || "Sin producto";
    const current = productMap.get(name) ?? { name, quantity: 0, total: 0 };
    current.quantity += Number(item.quantity ?? 0);
    current.total += Number(item.total ?? 0);
    productMap.set(name, current);
  }

  return {
    averageTicket: sales.length > 0 ? totalSold / sales.length : 0,
    byPaymentMethod,
    pending,
    products: [...productMap.values()].sort((first, second) => second.total - first.total),
    salesCount: sales.length,
    totalPaid,
    totalSold,
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
