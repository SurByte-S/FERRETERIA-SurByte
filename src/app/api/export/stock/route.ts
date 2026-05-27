import { createCsv, csvResponse } from "@/lib/export/csv";
import { createSimplePdf, pdfResponse } from "@/lib/export/pdf";
import {
  getSearchTokens,
  matchesAllSearchTokens,
  sortProductsBySearchRank,
} from "@/lib/search-ranking";
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

type StockFilter =
  | "todos"
  | "con-stock"
  | "sin-stock"
  | "bajo-minimo"
  | "sin-proveedor";

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
    const params = new URL(request.url).searchParams;
    const format = params.get("format") ?? "csv";
    const q = (params.get("q") ?? "").trim();
    const filter = parseStockFilter(params.get("filtro"));
    const rows = await loadStockRows({ tenantId: tenant.id, q, filter });
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

async function loadStockRows({
  filter,
  q,
  tenantId,
}: {
  filter: StockFilter;
  q: string;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const rows: StockExportRow[] = [];
  const pageSize = 1000;
  const searchTokens = getSearchTokens(q);

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("products")
      .select(
        "sku,barcode,name,unit,sale_price,stock_quantity,min_stock,cost_without_tax,cost_with_tax,tax_rate,profit_margin_percent,brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name")
      .range(from, from + pageSize - 1);

    if (filter === "sin-stock") {
      query = query.lte("stock_quantity", 0);
    } else if (filter === "con-stock") {
      query = query.gt("stock_quantity", 0);
    } else if (filter === "sin-proveedor") {
      query = query.is("supplier_id", null);
    }

    if (q.length >= 1) {
      query = query.or(buildProductSearchParts(q).join(","));
    }

    const { data, error } = await query;

    if (error) {
      throw new Error("No se pudo exportar stock.");
    }

    const batch = (data ?? []) as unknown as StockExportRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return sortProductsBySearchRank(
        rows.filter((row) => {
          if (filter === "bajo-minimo") {
            const stockQuantity = Number(row.stock_quantity ?? 0);
            const minStock = Number(row.min_stock ?? 0);

            if (!(stockQuantity > 0 && minStock > 0 && stockQuantity <= minStock)) {
              return false;
            }
          }

          if (searchTokens.length > 1) {
            return matchesAllSearchTokens(
              {
                sku: row.sku,
                barcode: row.barcode,
                brand: row.brands?.name,
                code: row.barcode ?? row.sku,
                category: "",
                name: row.name,
                description: row.name,
              },
              q
            );
          }

          return true;
        }),
        q
      );
    }
  }
}

function parseStockFilter(value: string | null): StockFilter {
  if (
    value === "todos" ||
    value === "con-stock" ||
    value === "sin-stock" ||
    value === "bajo-minimo" ||
    value === "sin-proveedor"
  ) {
    return value;
  }

  return "con-stock";
}

function buildProductSearchParts(search: string) {
  const tokens = getSearchTokens(search)
    .map((token) => token.replace(/[%_]/g, ""))
    .filter(Boolean);
  const values = tokens.length > 1 ? tokens : [search.replace(/[%_]/g, "")];

  return values
    .filter(Boolean)
    .flatMap((value) => [
      `sku.ilike.%${value}%`,
      `barcode.ilike.%${value}%`,
      `name.ilike.%${value}%`,
      `normalized_name.ilike.%${value}%`,
      `description.ilike.%${value}%`,
    ]);
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
