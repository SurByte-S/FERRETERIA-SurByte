import { createCsv, csvResponse } from "@/lib/export/csv";
import { createSimplePdf, pdfResponse } from "@/lib/export/pdf";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type CustomerExportRow = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

const CSV_HEADERS = [
  "nombre",
  "telefono",
  "email",
  "direccion",
  "documento",
  "fecha_alta",
];

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const rows = await loadCustomerRows(tenant.id);
    const date = new Date().toISOString().slice(0, 10);

    if (format === "pdf") {
      return pdfResponse({
        filename: `clientes-${date}.pdf`,
        pdf: createSimplePdf({
          title: "Listado de clientes",
          subtitle: tenant.name,
          meta: [`Fecha de generacion: ${new Date().toLocaleString("es-AR")}`],
          table: {
            headers: ["Nombre", "Telefono", "Email", "Direccion"],
            rows: rows.map((row) => [
              row.name,
              row.phone ?? "",
              row.email ?? "",
              row.address ?? "",
            ]),
          },
        }),
      });
    }

    return csvResponse({
      filename: `clientes-${date}.csv`,
      csv: createCsv(
        CSV_HEADERS,
        rows.map((row) => [
          row.name,
          row.phone,
          row.email,
          row.address,
          "",
          row.created_at,
        ])
      ),
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return new Response(FORBIDDEN_ACTION_MESSAGE, { status: 403 });
    }

    return new Response(
      error instanceof Error ? error.message : "No se pudo exportar clientes.",
      { status: 500 }
    );
  }
}

async function loadCustomerRows(tenantId: string) {
  const supabase = getSupabaseServerClient();
  const rows: CustomerExportRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("customers")
      .select("name,phone,email,address,created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("name")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudo exportar clientes.");
    }

    const batch = (data ?? []) as unknown as CustomerExportRow[];
    rows.push(...batch);

    if (batch.length < pageSize) {
      return rows;
    }
  }
}
