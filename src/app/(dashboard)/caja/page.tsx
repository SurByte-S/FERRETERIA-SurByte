import Link from "next/link";
import { ArrowLeft, Calculator, Clock } from "lucide-react";

import { OpenCashForm, CloseCashForm } from "@/components/caja/cash-forms";
import { Button } from "@/components/ui/button";
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
  const collectedSales = sales.reduce(
    (sum, sale) => sum + Number(sale.paid_amount ?? 0),
    0
  );
  const totalsByMethod = sales.reduce<Record<string, number>>((acc, sale) => {
    const method = sale.payment_method ?? "Sin forma de pago";
    acc[method] = (acc[method] ?? 0) + Number(sale.paid_amount ?? 0);
    return acc;
  }, {});

  return {
    totalSold,
    collectedSales,
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
    ? Number(openSession.opening_amount) + summary.collectedSales
    : 0;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="h-10 gap-2 px-4 text-sm">
          <Link href="/inicio">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al inicio
          </Link>
        </Button>
        <h1 className="text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
          Caja
        </h1>
      </header>

      <section className="rounded-md border-2 border-border bg-secondary p-3 shadow-sm sm:p-4">
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
          <Card className="border-2 border-primary bg-card shadow-sm">
            <CardHeader className="border-b-2 border-primary bg-primary text-primary-foreground">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <CardTitle className="text-2xl text-primary-foreground">Caja abierta</CardTitle>
                  <CardDescription className="text-sm font-semibold text-primary-foreground">
                    Abierta el {formatDate(openSession.opened_at)}
                  </CardDescription>
                </div>
                <div className="rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">
                  En curso
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Metric
                label="Monto inicial"
                value={formatMoney(openSession.opening_amount)}
                tone="ledger"
              />
              <Metric
                label="Total vendido"
                value={formatMoney(summary.totalSold)}
                tone="strong"
              />
              <Metric
                label="Cantidad de ventas"
                value={String(summary.salesCount)}
                tone="ledger"
              />
              <Metric
                label="Cobrado esperado"
                value={formatMoney(expectedCash)}
                tone="cash"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:gap-6">
            <Card className="border-2 border-border bg-card shadow-sm">
              <CardHeader className="border-b-2 border-border bg-primary text-primary-foreground">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
                    <Calculator className="size-5" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-xl text-primary-foreground">Cuadre de caja</CardTitle>
                    <CardDescription className="text-sm font-semibold text-primary-foreground">
                      Resumen para comparar ventas, efectivo y cierre
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <LedgerLine
                    label="Efectivo inicial"
                    value={formatMoney(openSession.opening_amount)}
                  />
                  <LedgerLine
                    label="Cobrado en ventas"
                    value={formatMoney(summary.collectedSales)}
                  />
                  <LedgerLine
                    label="Debe haber registrado"
                    value={formatMoney(expectedCash)}
                    highlight
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/40 bg-destructive/10 shadow-sm">
              <CardHeader className="border-b-2 border-destructive/40 bg-destructive/10">
                <CardTitle className="text-xl text-destructive">Cerrar caja</CardTitle>
                <CardDescription className="text-sm font-semibold text-muted-foreground">
                  Accion final del dia
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-3">
                <CloseCashForm
                  sessionId={openSession.id}
                  expectedCash={expectedCash}
                />
              </CardContent>
            </Card>
          </div>

          <Card className="border-2 border-border bg-card shadow-sm">
            <CardHeader className="border-b-2 border-border bg-primary text-primary-foreground">
              <CardTitle className="text-xl text-primary-foreground">Total por forma de pago</CardTitle>
              <CardDescription className="text-sm font-semibold text-primary-foreground">
                Ventas asociadas a la caja abierta
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              {Object.keys(summary.totalsByMethod).length === 0 ? (
                <p className="text-base text-muted-foreground">
                  Todavia no hay ventas asociadas a esta caja.
                </p>
              ) : (
                <div className="overflow-hidden rounded-md border-2 border-border bg-card">
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] border-b-2 border-border bg-muted text-base font-bold text-foreground">
                    <div className="px-4 py-3">Forma de pago</div>
                    <div className="border-l border-border px-4 py-3 text-right">
                      Cobrado
                    </div>
                  </div>
                  {Object.entries(summary.totalsByMethod).map(([method, total]) => (
                    <div
                      key={method}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(140px,220px)] border-b border-border text-lg last:border-b-0 even:bg-muted/25"
                    >
                      <div className="px-4 py-3 font-semibold text-foreground">
                        {method}
                      </div>
                      <div className="border-l border-border px-4 py-3 text-right font-mono text-2xl font-black tabular-nums text-foreground">
                        {formatMoney(total)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <CashHistory sessions={history} />
        </div>
      ) : (
        <div className="grid gap-6">
          <Card className="border-2 border-border bg-secondary shadow-sm">
            <CardHeader className="border-b-2 border-border bg-muted">
              <CardTitle className="text-2xl text-foreground">
                No hay caja abierta
              </CardTitle>
              <CardDescription className="text-base font-semibold text-muted-foreground">
                Para llevar mejor el control, abri la caja antes de vender.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <OpenCashForm />
            </CardContent>
          </Card>

          <CashHistory sessions={history} />
        </div>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  tone = "ledger",
}: {
  label: string;
  value: string;
  tone?: "ledger" | "strong" | "cash";
}) {
  const toneClass =
    tone === "strong"
      ? "border-primary bg-secondary"
      : tone === "cash"
        ? "border-emerald-500/40 bg-emerald-50"
        : "border-border bg-card";

  return (
    <div className={`rounded-md border-2 p-4 ${toneClass}`}>
      <p className="text-base font-bold text-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-black leading-none tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function LedgerLine({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border-2 p-4 ${
        highlight
          ? "border-emerald-500/40 bg-emerald-50"
          : "border-border bg-card"
      }`}
    >
      <p className="text-sm font-bold uppercase text-foreground">{label}</p>
      <p className="mt-2 font-mono text-3xl font-black tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function CashHistory({ sessions }: { sessions: CashSessionRow[] }) {
  return (
    <Card className="border-2 border-border bg-card shadow-sm">
      <details open>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b-2 border-border bg-primary p-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-card text-primary">
              <Clock className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl text-primary-foreground">Historial de cierres</CardTitle>
              <CardDescription className="text-sm font-semibold text-primary-foreground">
                {sessions.length === 0
                  ? "Sin cierres registrados"
                  : `${sessions.length} registro${sessions.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
          </div>
          <span className="shrink-0 rounded-md border border-border bg-card px-3 py-1 text-sm font-bold text-primary">
            Ver
          </span>
        </summary>

        <CardContent className="grid gap-3 pt-3">
          {sessions.length === 0 ? (
            <p className="text-base text-muted-foreground">
              Todavia no hay cierres de caja.
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="grid gap-3 rounded-md border-2 border-border bg-card p-4 2xl:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div>
                  <p className="text-base font-semibold text-foreground">
                    Apertura: {formatDate(session.opened_at)}
                  </p>
                  <p className="text-base font-semibold text-foreground">
                    Cierre: {formatDate(session.closed_at)}
                  </p>
                  <p className="mt-2 text-2xl font-bold">
                    {session.status === "open" ? "Abierta" : "Cerrada"}
                  </p>
                  {session.notes ? <p>Nota: {session.notes}</p> : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <HistoryMetric
                    label="Inicial"
                    value={formatMoney(session.opening_amount)}
                  />
                  <HistoryMetric
                    label="Esperado"
                    value={formatMoney(session.expected_cash_amount)}
                  />
                  <HistoryMetric
                    label="Contado"
                    value={formatMoney(session.counted_cash_amount)}
                  />
                  <HistoryMetric
                    label="Diferencia"
                    value={formatMoney(session.difference_amount)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </details>
    </Card>
  );
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-36 rounded-md border border-border bg-background p-3">
      <p className="text-sm font-bold text-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl font-black tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
