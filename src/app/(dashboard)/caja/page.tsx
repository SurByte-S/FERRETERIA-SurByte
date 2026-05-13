import { Clock, WalletCards } from "lucide-react";

import { OpenCashForm, CloseCashForm } from "@/components/caja/cash-forms";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type CashSessionRow = {
  id: string;
  opening_amount: number;
  expected_cash_amount: number;
  counted_cash_amount: number | null;
  difference_amount: number | null;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

type SaleRow = {
  id: string;
  total: number;
  paid_amount: number;
  payment_method: string | null;
};

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function summarizeSales(sales: SaleRow[]) {
  const totalSold = sales.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
  const expectedCashSales = sales
    .filter((sale) => sale.payment_method === "Efectivo")
    .reduce((sum, sale) => sum + Number(sale.paid_amount ?? 0), 0);
  const totalsByMethod = sales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method ?? "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + Number(sale.total ?? 0);
    return acc;
  }, {});

  return {
    totalSold,
    expectedCashSales,
    totalsByMethod,
    salesCount: sales.length,
  };
}

export default async function CajaPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [openSessionResult, historyResult] = await Promise.all([
    supabase
      .from("cash_register_sessions")
      .select(
        "id,opening_amount,expected_cash_amount,counted_cash_amount,difference_amount,status,opened_at,closed_at,notes"
      )
      .eq("tenant_id", tenant.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cash_register_sessions")
      .select(
        "id,opening_amount,expected_cash_amount,counted_cash_amount,difference_amount,status,opened_at,closed_at,notes"
      )
      .eq("tenant_id", tenant.id)
      .order("opened_at", { ascending: false })
      .limit(20),
  ]);
  const openSession = (openSessionResult.data ?? null) as CashSessionRow | null;
  const history = (historyResult.data ?? []) as unknown as CashSessionRow[];
  const salesResult = openSession
    ? await supabase
        .from("sales")
        .select("id,total,paid_amount,payment_method")
        .eq("tenant_id", tenant.id)
        .eq("cash_session_id", openSession.id)
    : { data: [], error: null };
  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const summary = summarizeSales(sales);
  const expectedCash = openSession
    ? Number(openSession.opening_amount) + summary.expectedCashSales
    : 0;

  return (
    <>
      <PageHeader
        title="Caja"
        description="Abri caja, controla ventas de la sesion y registra el cierre diario."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      {openSessionResult.error || historyResult.error || salesResult.error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesita revision</CardTitle>
            <CardDescription>
              No se pudo cargar la caja. Revisa la migracion y la conexion.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : openSession ? (
        <div className="grid gap-6">
          <Card className="border-primary/40">
            <CardHeader>
              <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <WalletCards className="size-7" aria-hidden="true" />
              </div>
              <CardTitle>Caja abierta</CardTitle>
              <CardDescription>
                Abierta el {formatDate(openSession.opened_at)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <Metric label="Monto inicial" value={formatMoney(openSession.opening_amount)} />
              <Metric label="Total vendido" value={formatMoney(summary.totalSold)} />
              <Metric label="Cantidad de ventas" value={String(summary.salesCount)} />
              <Metric label="Efectivo esperado" value={formatMoney(expectedCash)} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader>
                <CardTitle>Total por forma de pago</CardTitle>
                <CardDescription>Ventas asociadas a esta caja abierta.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {Object.keys(summary.totalsByMethod).length === 0 ? (
                  <p className="text-base text-muted-foreground">
                    Todavia no hay ventas asociadas a esta caja.
                  </p>
                ) : (
                  Object.entries(summary.totalsByMethod).map(([method, total]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between rounded-lg border border-border p-3"
                    >
                      <span className="font-semibold">{method}</span>
                      <span className="text-lg font-bold">{formatMoney(total)}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cerrar caja</CardTitle>
                <CardDescription>
                  Contá el efectivo real antes de cerrar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CloseCashForm
                  sessionId={openSession.id}
                  expectedCash={expectedCash}
                />
              </CardContent>
            </Card>
          </div>

          <CashHistory sessions={history} />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <WalletCards className="size-7" aria-hidden="true" />
              </div>
              <CardTitle>No hay caja abierta</CardTitle>
              <CardDescription>
                Podes vender igual, pero esas ventas quedaran sin caja asociada.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <OpenCashForm />
            </CardContent>
          </Card>

          <CashHistory sessions={history} />
        </div>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <p className="text-base text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function CashHistory({ sessions }: { sessions: CashSessionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Clock className="size-6" aria-hidden="true" />
        </div>
        <CardTitle>Historial de cierres</CardTitle>
        <CardDescription>Ultimas cajas abiertas y cerradas.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {sessions.length === 0 ? (
          <p className="text-base text-muted-foreground">
            Todavia no hay cierres de caja.
          </p>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-[1fr_auto]"
            >
              <div>
                <p className="text-sm text-muted-foreground">
                  Apertura: {formatDate(session.opened_at)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Cierre: {formatDate(session.closed_at)}
                </p>
                <p className="text-xl font-bold">
                  {session.status === "open" ? "Abierta" : "Cerrada"}
                </p>
                {session.notes ? <p>Nota: {session.notes}</p> : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <Metric label="Inicial" value={formatMoney(session.opening_amount)} />
                <Metric label="Esperado" value={formatMoney(session.expected_cash_amount)} />
                <Metric label="Contado" value={formatMoney(session.counted_cash_amount)} />
                <Metric label="Diferencia" value={formatMoney(session.difference_amount)} />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
