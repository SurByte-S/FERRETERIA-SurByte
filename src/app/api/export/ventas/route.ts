import { createSimplePdf, pdfResponse } from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type SalesPeriod = "today" | "month";

type SaleExportRow = {
  id: string;
  sale_number: number | null;
  total: number | null;
  paid_amount: number | null;
  payment_method: string | null;
  created_at: string;
  customers: { name: string } | null;
};

type DateRange = {
  end: string;
  label: string;
  period: SalesPeriod;
  start: string;
};

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") ?? "pdf";
    const range = getDateRange(searchParams.get("period"));

    if (format !== "pdf") {
      return new Response("Formato no disponible para exportar ventas.", {
        status: 400,
      });
    }

    const sales = await loadSales({
      end: range.end,
      start: range.start,
      tenantId: tenant.id,
    });
    const summary = summarizeSales(sales);
    const generatedAt = new Date().toLocaleString("es-AR");
    const date = new Date().toISOString().slice(0, 10);

    return pdfResponse({
      filename: `ventas-${range.period}-${date}.pdf`,
      pdf: createSimplePdf({
        title: `Reporte de ventas - ${range.label}`,
        subtitle: tenant.name,
        meta: [
          `Fecha de generacion: ${generatedAt}`,
          `Periodo: ${formatDateTime(range.start)} a ${formatDateTime(range.end)}`,
        ],
        sections: [
          {
            title: "Resumen",
            lines: [
              `Cantidad de ventas: ${sales.length}`,
              `Total vendido: ${formatMoney(summary.totalSold)}`,
              `Total cobrado: ${formatMoney(summary.totalPaid)}`,
              `Pendiente de cobro: ${formatMoney(summary.pending)}`,
              `Ticket promedio: ${formatMoney(summary.averageTicket)}`,
            ],
          },
          {
            title: "Metodos de pago",
            lines:
              Object.entries(summary.byPaymentMethod).length > 0
                ? Object.entries(summary.byPaymentMethod).map(
                    ([method, total]) => `${method}: ${formatMoney(total)}`
                  )
                : ["Sin ventas en el periodo."],
          },
        ],
        table: {
          headers: [
            "Fecha",
            "Nro",
            "Cliente",
            "Metodo",
            "Total",
            "Pagado",
            "Pendiente",
          ],
          rows: sales.map((sale) => {
            const total = Number(sale.total ?? 0);
            const paid = Number(sale.paid_amount ?? 0);

            return [
              formatDateTime(sale.created_at),
              sale.sale_number ?? "",
              sale.customers?.name ?? "Consumidor final",
              sale.payment_method?.trim() || "Sin forma de pago",
              formatMoney(total),
              formatMoney(paid),
              formatMoney(Math.max(total - paid, 0)),
            ];
          }),
        },
      }),
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
    }

    return new Response(
      error instanceof Error ? error.message : "No se pudo exportar ventas.",
      { status: 500 }
    );
  }
}

function getDateRange(value: string | null): DateRange {
  const period: SalesPeriod = value === "month" ? "month" : "today";
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (period === "month") {
    start.setDate(1);
  }

  return {
    end: end.toISOString(),
    label: period === "month" ? "Mes actual" : "Hoy",
    period,
    start: start.toISOString(),
  };
}

async function loadSales({
  end,
  start,
  tenantId,
}: {
  end: string;
  start: string;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const rows: SaleExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("sales")
      .select(
        "id,sale_number,total,paid_amount,payment_method,created_at,customers(name)"
      )
      .eq("tenant_id", tenantId)
      .gte("created_at", start)
      .lte("created_at", end)
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

function summarizeSales(sales: SaleExportRow[]) {
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
  const byPaymentMethod = sales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method?.trim() || "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + Number(sale.total ?? 0);
    return acc;
  }, {});

  return {
    averageTicket: sales.length > 0 ? totalSold / sales.length : 0,
    byPaymentMethod,
    pending,
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
