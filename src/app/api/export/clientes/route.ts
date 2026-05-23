import {
  createPrintableReportHtml,
  printableHtmlResponse,
} from "@/lib/export/pdf";
import { createCsv, csvResponse } from "@/lib/export/csv";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";

type CustomerExportRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  created_at: string;
};

const CSV_HEADERS = [
  "Cliente",
  "Telefono",
  "Email",
  "Direccion",
  "Estado de cuenta",
  "Saldo",
];

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(["owner", "admin"]);
    const format = new URL(request.url).searchParams.get("format") ?? "csv";
    const rows = await loadCustomerRows(tenant.id);
    const date = new Date().toISOString().slice(0, 10);
    const exportRows = rows.map((row) => {
      const balance = row.balance ?? 0;
      return [
        row.name,
        row.phone,
        row.email,
        row.address,
        formatAccountStatus(balance),
        balance.toFixed(2),
      ];
    });

    if (format === "pdf") {
      return printableHtmlResponse({
        filename: `clientes-${date}.html`,
        html: createPrintableReportHtml({
          title: "Listado de clientes",
          subtitle: tenant.name,
          meta: [`Fecha de generacion: ${new Date().toLocaleString("es-AR")}`],
          table: {
            headers: CSV_HEADERS,
            rows: exportRows,
          },
        }),
      });
    }

    return csvResponse({
      filename: `clientes-${slugifyFilePart(tenant.name)}-${date}.csv`,
      csv: createCsv(CSV_HEADERS, exportRows),
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
  const rows: (CustomerExportRow & { balance?: number })[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("customers")
      .select("id,name,phone,email,address,created_at")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("name")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error("No se pudo exportar clientes.");
    }

    const batch = (data ?? []) as unknown as CustomerExportRow[];
    const balances = await loadBalances(
      tenantId,
      batch.map((row) => row.id)
    );
    rows.push(
      ...batch.map((row) => ({
        ...row,
        balance: balances.get(row.id) ?? 0,
      }))
    );

    if (batch.length < pageSize) {
      return rows;
    }
  }
}

function slugifyFilePart(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "clientes";
}

async function loadBalances(tenantId: string, customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, number>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_account_balances")
    .select("customer_id,balance")
    .eq("tenant_id", tenantId)
    .in("customer_id", customerIds);

  if (error) {
    throw new Error("No se pudo exportar clientes.");
  }

  return new Map(
    ((data ?? []) as { customer_id: string; balance: number }[]).map((row) => [
      row.customer_id,
      Number(row.balance ?? 0),
    ])
  );
}

function formatAccountStatus(balance: number) {
  if (balance > 0) {
    return "Debe";
  }

  if (balance < 0) {
    return "Saldo a favor";
  }

  return "Sin deuda";
}
