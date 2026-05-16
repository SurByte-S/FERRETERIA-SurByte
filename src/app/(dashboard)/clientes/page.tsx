import Link from "next/link";
import { Edit, Eye, Plus, Users } from "lucide-react";

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

type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
};

type BalanceRow = {
  customer_id: string;
  balance: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDebt(value: number) {
  if (value > 0) {
    return {
      label: `Debe ${formatMoney(value)}`,
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }

  if (value < 0) {
    return {
      label: `Saldo a favor ${formatMoney(Math.abs(value))}`,
      className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
    };
  }

  return {
    label: "Sin deuda",
    className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  };
}

export default async function ClientesPage() {
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,email,address")
    .eq("tenant_id", tenant.id)
    .order("name")
    .limit(200);

  const customers = (data ?? []) as unknown as CustomerRow[];
  const customerIds = customers.map((customer) => customer.id);
  const { data: balancesData, error: balancesError } =
    customerIds.length > 0
      ? await supabase
          .from("customer_account_balances")
          .select("customer_id,balance")
          .eq("tenant_id", tenant.id)
          .in("customer_id", customerIds)
      : { data: [], error: null };
  const balances = new Map(
    ((balancesData ?? []) as unknown as BalanceRow[]).map((row) => [
      row.customer_id,
      row.balance,
    ])
  );

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Consulta clientes, datos de contacto y deuda actual."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="mb-6">
        <Button asChild className="h-11 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
          <Link href="/clientes/nuevo">
            <Plus className="size-6" aria-hidden="true" />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      {error || balancesError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesita revision</CardTitle>
            <CardDescription>
              No se pudieron cargar los clientes o sus saldos.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : customers.length === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Users className="size-6" aria-hidden="true" />
            </div>
            <CardTitle>No hay clientes guardados</CardTitle>
            <CardDescription>
              Crea el primer cliente para usar presupuestos y cuenta corriente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-11 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
              <Link href="/clientes/nuevo">
                <Plus className="size-6" aria-hidden="true" />
                Nuevo cliente
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {customers.map((customer) => {
            const balance = balances.get(customer.id) ?? 0;
            const debt = formatDebt(balance);

            return (
              <Card key={customer.id}>
                <CardContent className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:p-5">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold xl:text-2xl">{customer.name}</h2>
                    <p className="mt-2 text-lg">
                      Telefono: {customer.phone ?? "Sin telefono"}
                    </p>
                    {customer.email ? (
                      <p className="text-base text-muted-foreground">
                        Email: {customer.email}
                      </p>
                    ) : null}
                    {customer.address ? (
                      <p className="text-base text-muted-foreground">
                        Direccion: {customer.address}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                    <p className={`rounded-lg border p-3 text-xl font-bold xl:p-4 xl:text-2xl ${debt.className}`}>
                      {debt.label}
                    </p>
                    <Button asChild className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-5 xl:text-lg">
                      <Link href={`/clientes/${customer.id}`}>
                        <Eye className="size-6" aria-hidden="true" />
                        Ver
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="h-11 gap-2 px-4 text-base xl:h-14 xl:px-5 xl:text-lg"
                    >
                      <Link href={`/clientes/${customer.id}/editar`}>
                        <Edit className="size-6" aria-hidden="true" />
                        Editar
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
