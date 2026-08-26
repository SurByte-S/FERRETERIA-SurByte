import { createCsv, csvResponse } from "@/lib/export/csv";
import { createTablePdf, pdfResponse } from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type StockExportRow = {
  sku: string;
  custom_code: string | null;
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
  categories: { name: string } | null;
  brands: { name: string } | null;
  suppliers: { name: string } | null;
};

type CategoryFilter = {
  id: string;
  name: string;
};

const CSV_HEADERS = [
  "codigo",
  "codigo_propio",
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
    const searchParams = new URL(request.url).searchParams;
    const format = searchParams.get("format") ?? "csv";
    const category = await resolveCategoryFilter({
      categoryId: searchParams.get("categoryId"),
      tenantId: tenant.id,
    });
    const rows = await loadStockRows({
      categoryId: category?.id ?? null,
      tenantId: tenant.id,
    });
    const date = dateStamp();

    if (format === "pdf") {
      return pdfResponse({
        filename: `stock-${date}.pdf`,
        pdf: createTablePdf({
          title: "Reporte de stock",
          subtitle: tenant.name || "Ferretería Güemes",
          meta: [
            `Fecha de generacion: ${new Date().toLocaleString("es-AR")}`,
            category ? `Categoria: ${category.name}` : "Categoria: Todas",
          ],
          table: {
            columns: [
              { header: "Codigo", width: 58 },
              { header: "Propio", width: 42 },
              { header: "Producto", width: 150 },
              { align: "right", header: "Precio", width: 58 },
              { align: "right", header: "Stock", width: 46 },
              { align: "right", header: "Minimo", width: 46 },
              { header: "Marca", width: 58 },
              { header: "Proveedor", width: 58 },
            ],
            rows: rows.map((row) => [
              row.sku,
              row.custom_code,
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
          row.custom_code,
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

async function resolveCategoryFilter({
  categoryId,
  tenantId,
}: {
  categoryId: string | null;
  tenantId: string;
}): Promise<CategoryFilter | null> {
  const id = categoryId?.trim();

  if (!id) {
    return null;
  }

  if (!isUuid(id)) {
    throw new Error("La categoria indicada no es valida.");
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    throw new Error("La categoria indicada no pertenece a esta ferreteria.");
  }

  return data as CategoryFilter;
}

async function loadStockRows({
  categoryId,
  tenantId,
}: {
  categoryId: string | null;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const rows: StockExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("products")
      .select(
        "sku,custom_code,barcode,name,unit,sale_price,stock_quantity,min_stock,cost_without_tax,cost_with_tax,tax_rate,profit_margin_percent,categories(name),brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .order("name");

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);

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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function exportErrorResponse(error: unknown) {
  if (isTenantRoleForbiddenError(error)) {
    return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
  }

  return new Response(error instanceof Error ? error.message : "No se pudo exportar.", {
    status:
      error instanceof Error && error.message.toLowerCase().includes("categoria")
        ? 400
        : 500,
  });
}
