import { QuickSale } from "@/components/pos/quick-sale";
import type { QuoteCustomerOption } from "@/components/presupuestos/quote-types";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type CashSessionRow = {
  id: string;
  opening_amount: number;
  opened_at: string;
};

type SaleRow = {
  paid_amount: number;
  payment_method: string | null;
};

export default async function InicioPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [cashStatus, customers] = await Promise.all([
    loadCashStatus(tenant.id, supabase),
    loadCustomers(tenant.id, supabase),
  ]);

  return <QuickSale customers={customers} cashStatus={cashStatus} />;
}

async function loadCustomers(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const { data } = await supabase
    .from("customers")
    .select("id,name,phone,email,address")
    .eq("tenant_id", tenantId)
    .order("name")
    .limit(300);

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
    const { data } = await supabase
      .from("cash_register_sessions")
      .select("id,opening_amount,opened_at")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const session = (data ?? null) as CashSessionRow | null;

    if (!session) {
      return { open: false };
    }

    const salesResult = await supabase
      .from("sales")
      .select("paid_amount,payment_method")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", session.id);
    const sales = (salesResult.data ?? []) as unknown as SaleRow[];
    const cashSales = sales
      .filter((sale) => sale.payment_method === "Efectivo")
      .reduce((sum, sale) => sum + Number(sale.paid_amount ?? 0), 0);

    return {
      open: true,
      openedAt: session.opened_at,
      expectedCash: Number(session.opening_amount ?? 0) + cashSales,
    };
  } catch {
    return { open: false };
  }
}
