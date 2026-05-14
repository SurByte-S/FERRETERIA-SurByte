import Link from "next/link";
import { Clock, WalletCards } from "lucide-react";

import { QuickSale } from "@/components/pos/quick-sale";
import type { QuoteCustomerOption } from "@/components/presupuestos/quote-types";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function InicioPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [cashStatus, customers] = await Promise.all([
    loadCashStatus(tenant.id, supabase),
    loadCustomers(tenant.id, supabase),
  ]);

  return (
    <div className="grid gap-6">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="h-1.5 bg-accent" />
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-center gap-4">
            <BrandLogo size="medium" showText={false} />
            <div>
              <p className="text-3xl font-bold leading-tight text-primary">
                Mostrador
              </p>
              <p className="mt-1 text-lg font-medium text-muted-foreground">
                Buscá, agregá productos y guardá el comprobante.
              </p>
            </div>
          </div>
          <CashStatusCard cashStatus={cashStatus} />
        </div>
      </section>

      <QuickSale customers={customers} />
    </div>
  );
}

function CashStatusCard({
  cashStatus,
}: {
  cashStatus:
    | { open: true; openedAt: string; expectedCash: number }
    | { open: false };
}) {
  return (
    <Card
      className={
        cashStatus.open
          ? "border-emerald-500/40 bg-emerald-50"
          : "border-yellow-500/40 bg-yellow-50"
      }
    >
      <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="flex items-start gap-3">
          <div
            className={
              cashStatus.open
                ? "flex size-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                : "flex size-12 items-center justify-center rounded-lg bg-yellow-100 text-yellow-900"
            }
          >
            <WalletCards className="size-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xl font-bold">
              {cashStatus.open ? "Caja abierta" : "Caja cerrada"}
            </p>
            {cashStatus.open ? (
              <div className="mt-1 grid gap-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Clock className="size-4" aria-hidden="true" />
                  Apertura: {formatDate(cashStatus.openedAt)}
                </p>
                <p className="font-semibold text-foreground">
                  Efectivo esperado: {formatMoney(cashStatus.expectedCash)}
                </p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Abrí caja antes de cobrar ventas en efectivo.
              </p>
            )}
          </div>
        </div>
        <Button asChild className="h-12 gap-2 px-5 text-base">
          <Link href="/caja">
            <WalletCards className="size-5" aria-hidden="true" />
            {cashStatus.open ? "Ir a caja" : "Ir a caja para abrir"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
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
