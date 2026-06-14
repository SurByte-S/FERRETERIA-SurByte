import { QuickSalePos } from "@/components/pos/quick-sale-pos";
import type { QuoteCustomerOption } from "@/components/presupuestos/quote-types";
import { logServerWarn } from "@/lib/server-log";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type CashSessionRow = {
  id: string;
  opening_amount: number;
  opened_at: string;
};

type SaleRow = {
  paid_amount: number;
};

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const { sku } = await searchParams;
  const tenant = await requireTenant("/inicio");
  const supabase = getSupabaseServerClient("/inicio");
  const [cashStatus, customers] = await Promise.all([
    loadCashStatus(tenant.id, supabase),
    loadCustomers(tenant.id, supabase),
  ]);

  return (
    <QuickSalePos initialSku={sku} customers={customers} cashStatus={cashStatus} />
  );
}

async function loadCustomers(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,email,address")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name")
    .limit(300);

  if (error) {
    logServerWarn("Could not load customers", {
      source: "/inicio",
      tenantId,
      error: error.message,
    });
  }

  return (data ?? []) as unknown as QuoteCustomerOption[];
}

async function loadCashStatus(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<
  | { open: true; openedAt: string; expectedCash: number }
  | { open: false }
> {
  try {
    const { data, error } = await supabase
      .from("cash_register_sessions")
      .select("id,opening_amount,opened_at")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logServerWarn("Could not load open cash session", {
        source: "/inicio",
        tenantId,
        error: error.message,
      });
      return { open: false };
    }

    const session = (data ?? null) as CashSessionRow | null;

    if (!session) {
      return { open: false };
    }

    const salesResult = await supabase
      .from("sales")
      .select("paid_amount")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", session.id);

    if (salesResult.error) {
      logServerWarn("Could not load cash session sales", {
        source: "/inicio",
        tenantId,
        error: salesResult.error.message,
      });
    }

    const sales = (salesResult.data ?? []) as unknown as SaleRow[];
    const collectedSales = sales.reduce(
      (sum, sale) => sum + Number(sale.paid_amount ?? 0),
      0
    );

    return {
      open: true,
      openedAt: session.opened_at,
      expectedCash: Number(session.opening_amount ?? 0) + collectedSales,
    };
  } catch (error) {
    logServerWarn("Unexpected cash status error", {
      source: "/inicio",
      tenantId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { open: false };
  }
}
