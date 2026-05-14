import Link from "next/link";
import { Clock, WalletCards } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { navigationItems, quickActions } from "@/components/shell/nav-items";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
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
  const cashStatus = await loadCashStatus();

  return (
    <>
      <PageHeader
        title="Inicio"
        description="Accesos grandes para las tareas mas comunes de la ferreteria."
      />

      <section className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="h-1.5 bg-accent" />
        <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-center gap-4">
            <BrandLogo size="medium" showText={false} />
            <div>
              <p className="text-3xl font-bold leading-tight text-primary">
                {ferreteriaGuemesBrand.brandName}
              </p>
              <p className="mt-1 text-lg font-medium text-muted-foreground">
                {ferreteriaGuemesBrand.slogan}
              </p>
            </div>
          </div>
          <p className="max-w-md text-base text-muted-foreground">
            Gestion diaria clara para ventas, caja, presupuestos y stock.
          </p>
        </div>
      </section>

      <Card className={cashStatus.open ? "mb-6 border-emerald-500/40" : "mb-6 border-yellow-500/40"}>
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-4">
            <div
              className={
                cashStatus.open
                  ? "flex size-14 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800"
                  : "flex size-14 items-center justify-center rounded-lg bg-yellow-100 text-yellow-900"
              }
            >
              <WalletCards className="size-7" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {cashStatus.open ? "Caja abierta" : "Caja cerrada"}
              </p>
              {cashStatus.open ? (
                <div className="mt-2 grid gap-1 text-base text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <Clock className="size-5" aria-hidden="true" />
                    Apertura: {formatDate(cashStatus.openedAt)}
                  </p>
                  <p className="font-semibold text-foreground">
                    Efectivo esperado: {formatMoney(cashStatus.expectedCash)}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-base text-muted-foreground">
                  Abri caja antes de empezar a cobrar ventas en efectivo.
                </p>
              )}
            </div>
          </div>
          <Button asChild className="h-14 gap-2 px-6 text-lg">
            <Link href="/caja">
              <WalletCards className="size-6" aria-hidden="true" />
              Ir a caja
            </Link>
          </Button>
        </CardContent>
      </Card>

      <section aria-label="Acciones rapidas" className="grid gap-4 xl:grid-cols-3">
        {quickActions.map((action) => {
          const Icon = action.icon;

          return (
            <Card key={`${action.title}-${action.href}`}>
              <CardHeader>
                <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-7" aria-hidden="true" />
                </div>
                <CardTitle>{action.title}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="h-12 w-full gap-2 text-base">
                  <Link href={action.href}>
                    <Icon className="size-5" aria-hidden="true" />
                    Abrir {action.title.toLowerCase()}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section aria-label="Todas las secciones" className="mt-8">
        <h2 className="mb-4 text-2xl font-semibold">Todas las secciones</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <Button
                key={item.href}
                asChild
                variant="outline"
                className="h-20 justify-start gap-3 px-4 text-left text-base"
              >
                <Link href={item.href}>
                  <Icon className="size-6" aria-hidden="true" />
                  <span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="block text-sm font-normal text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
      </section>
    </>
  );
}

async function loadCashStatus(): Promise<
  | { open: true; openedAt: string; expectedCash: number }
  | { open: false }
> {
  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from("cash_register_sessions")
      .select("id,opening_amount,opened_at")
      .eq("tenant_id", tenant.id)
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
      .eq("tenant_id", tenant.id)
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
