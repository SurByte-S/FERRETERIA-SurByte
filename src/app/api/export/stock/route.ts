import { createCsv, csvResponse } from "@/lib/export/csv";
import { createSimplePdf, pdfResponse } from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type StockExportRow = {
  sku: string;
  barcode: string | null;
  name: string;
  unit: string;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  cost_without_tax: number | null;
  cost_with_tax: number | null;
  tax_rate: number | null;
  profit_margin_percent: number | null;
  brands: { name: string } | null;
  suppliers: { name: string } | null;
};

const CSV_HEADERS = [
  "codigo",
  "codigo_barras",
  "nombre",
  "unidad",
  "marca",
  "proveedor",
  "precio_venta",
  "stock_actual",
  "stock_minimo",
  "costo_sin_iva",
  "costo_con_iva",
  "iva_pct",
  "utilidad_pct",
];

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const rows = await loadStockRows(tenant.id);
    const date = dateStamp();

    if (format === "pdf") {
      return pdfResponse({
        filename: `stock-${date}.pdf`,
        pdf: createSimplePdf({
          title: "Reporte de stock",
          subtitle: tenant.name || "Ferretería Güemes",
          meta: [`Fecha de generacion: ${new Date().toLocaleString("es-AR")}`],
          table: {
            headers: ["Codigo", "Producto", "Precio", "Stock", "Minimo", "Marca", "Proveedor"],
            rows: rows.map((row) => [
              row.sku,
              row.name,
              formatNumber(row.sale_price),
              formatNumber(row.stock_quantity),
              formatNumber(row.min_stock),
              row.brands?.name ?? "",
              row.suppliers?.name ?? "",
            ]),
          },
        }),
      });
    }

    return csvResponse({
      filename: `stock-${date}.csv`,
      csv: createCsv(
        CSV_HEADERS,
        rows.map((row) => [
          row.sku,
          row.barcode,
          row.name,
          row.unit,
          row.brands?.name ?? "",
          row.suppliers?.name ?? "",
          row.sale_price,
          row.stock_quantity,
          row.min_stock,
          row.cost_without_tax,
          row.cost_with_tax,
          row.tax_rate,
          row.profit_margin_percent,
        ])
      ),
    });
  } catch (error) {
    return exportErrorResponse(error);
  }
}

async function loadStockRows(tenantId: string) {
  const supabase = getSupabaseServerClient();
  const rows: StockExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "sku,barcode,name,unit,sale_price,stock_quantity,min_stock,cost_without_tax,cost_with_tax,tax_rate,profit_margin_percent,brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudo exportar stock.");
    }

    const batch = (data ?? []) as unknown as StockExportRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }
  }
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(Number(value));
}

function exportErrorResponse(error: unknown) {
  if (isTenantRoleForbiddenError(error)) {
    return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
  }

  return new Response(error instanceof Error ? error.message : "No se pudo exportar.", {
    status: 500,
  });
}
