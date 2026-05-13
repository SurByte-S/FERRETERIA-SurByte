import Link from "next/link";
import { notFound } from "next/navigation";
import { Edit, Eye, ReceiptText } from "lucide-react";

import { CustomerPaymentForm } from "@/components/clientes/payment-form";
import { PageHeader } from "@/components/shell/page-header";
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

type CustomerPageProps = {
  params: Promise<{ id: string }>;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};

type SaleRow = {
  id: string;
  sale_number: number;
  total: number;
  paid_amount: number;
  payment_method: string | null;
  created_at: string;
};

type QuoteRow = {
  id: string;
  quote_number: number;
  status: string;
  total: number;
  created_at: string;
};

type MovementRow = {
  id: string;
  movement_type: "debit" | "payment" | "adjustment";
  amount: number;
  notes: string | null;
  created_at: string;
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

function formatDebt(value: number) {
  if (value > 0) {
    return {
      label: `Debe ${formatMoney(value)}`,
      className: "bg-destructive/10 text-destructive",
      description: "Deuda pendiente en cuenta corriente.",
    };
  }

  if (value < 0) {
    return {
      label: `Saldo a favor ${formatMoney(Math.abs(value))}`,
      className: "bg-emerald-100 text-emerald-800",
      description: "El cliente tiene saldo disponible a favor.",
    };
  }

  return {
    label: "Sin deuda",
    className: "bg-emerald-100 text-emerald-800",
    description: "No hay deuda pendiente.",
  };
}

function movementLabel(type: MovementRow["movement_type"]) {
  const labels: Record<MovementRow["movement_type"], string> = {
    debit: "Deuda",
    payment: "Pago",
    adjustment: "Ajuste",
  };

  return labels[type];
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    issued: "Emitido",
    cancelled: "Cancelado",
    converted: "Convertido en venta",
  };

  return labels[status] ?? status;
}

export default async function ClienteDetallePage({ params }: CustomerPageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [customerResult, balanceResult, salesResult, quotesResult, movementsResult] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id,name,phone,email,address,notes")
        .eq("tenant_id", tenant.id)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("customer_account_balances")
        .select("balance")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", id)
        .maybeSingle(),
      supabase
        .from("sales")
        .select("id,sale_number,total,paid_amount,payment_method,created_at")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("quotes")
        .select("id,quote_number,status,total,created_at")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("customer_account_movements")
        .select("id,movement_type,amount,notes,created_at")
        .eq("tenant_id", tenant.id)
        .eq("customer_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (customerResult.error || !customerResult.data) {
    notFound();
  }

  const customer = customerResult.data as unknown as CustomerRow;
  const balance =
    ((balanceResult.data as unknown as { balance: number } | null)?.balance ?? 0);
  const debt = formatDebt(balance);
  const sales = (salesResult.data ?? []) as unknown as SaleRow[];
  const quotes = (quotesResult.data ?? []) as unknown as QuoteRow[];
  const movements = (movementsResult.data ?? []) as unknown as MovementRow[];

  return (
    <>
      <PageHeader
        title={customer.name}
        description="Ficha del cliente con ventas, presupuestos y cuenta corriente."
        backHref="/clientes"
        backLabel="Volver a clientes"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <Button asChild className="h-14 gap-2 px-6 text-lg">
          <Link href={`/clientes/${customer.id}/editar`}>
            <Edit className="size-6" aria-hidden="true" />
            Editar cliente
          </Link>
        </Button>
      </div>

      <div className="grid gap-6">
        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader>
              <CardTitle>Datos del cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-base">
              <p>Telefono: {customer.phone ?? "Sin telefono"}</p>
              <p>Email: {customer.email ?? "Sin email"}</p>
              <p>Direccion: {customer.address ?? "Sin direccion"}</p>
              {customer.notes ? <p>Notas: {customer.notes}</p> : null}
            </CardContent>
          </Card>

          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle>Saldo actual</CardTitle>
              <CardDescription>{debt.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={`rounded-lg p-5 ${debt.className}`}>
                <p className="text-lg">Saldo/deuda</p>
                <p className="mt-1 text-4xl font-bold">{debt.label}</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Registrar pago</CardTitle>
            <CardDescription>
              Usalo cuando el cliente paga parte o todo lo que debe.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CustomerPaymentForm customerId={customer.id} balance={balance} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ventas asociadas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {sales.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Todavia no hay ventas para este cliente.
              </p>
            ) : (
              sales.map((sale) => (
                <div
                  key={sale.id}
                  className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(sale.created_at)}
                    </p>
                    <p className="text-xl font-bold">Venta #{sale.sale_number}</p>
                    <p>
                      {sale.payment_method ?? "Sin forma de pago"} - Pagado:{" "}
                      {formatMoney(sale.paid_amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold">{formatMoney(sale.total)}</p>
                    <Button asChild className="h-12 gap-2 px-4">
                      <Link href={`/ventas/${sale.id}`}>
                        <Eye className="size-5" aria-hidden="true" />
                        Ver
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Presupuestos asociados</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {quotes.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Todavia no hay presupuestos para este cliente.
              </p>
            ) : (
              quotes.map((quote) => (
                <div
                  key={quote.id}
                  className="grid gap-3 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(quote.created_at)}
                    </p>
                    <p className="text-xl font-bold">
                      Presupuesto #{quote.quote_number}
                    </p>
                    <p>Estado: {statusLabel(quote.status)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xl font-bold">{formatMoney(quote.total)}</p>
                    <Button asChild className="h-12 gap-2 px-4">
                      <Link href={`/presupuestos/${quote.id}`}>
                        <ReceiptText className="size-5" aria-hidden="true" />
                        Ver
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimientos de cuenta corriente</CardTitle>
            <CardDescription>Deudas, pagos y ajustes del cliente.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {movements.length === 0 ? (
              <p className="text-base text-muted-foreground">
                Todavia no hay movimientos de cuenta corriente.
              </p>
            ) : (
              movements.map((movement) => (
                <div
                  key={movement.id}
                  className="grid gap-2 rounded-lg border border-border p-4 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(movement.created_at)}
                    </p>
                    <p className="text-lg font-bold">
                      {movementLabel(movement.movement_type)}
                    </p>
                    {movement.notes ? <p>{movement.notes}</p> : null}
                  </div>
                  <p className="text-xl font-bold">{formatMoney(movement.amount)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
