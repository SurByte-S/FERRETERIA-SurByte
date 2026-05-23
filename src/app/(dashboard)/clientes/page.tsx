import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Edit,
  Eye,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { ExportMenuButton } from "@/components/common/export-menu-button";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

type ClientesPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

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

type AccountFilter = "all" | "debt" | "clear" | "credit";
type SortOption = "name" | "debt_desc" | "debt_asc";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const BALANCE_ID_LIMIT = 10000;

const accountFilters: { value: AccountFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "debt", label: "Con deuda" },
  { value: "clear", label: "Sin deuda" },
  { value: "credit", label: "Saldo a favor" },
];

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
      className: "border-sky-500/40 bg-sky-50 text-sky-800",
    };
  }

  return {
    label: "Sin deuda",
    className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  };
}

function getSingleParam(
  params: Awaited<NonNullable<ClientesPageProps["searchParams"]>>,
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | undefined) {
  const parsed = parsePositiveInteger(value, 25);
  return PAGE_SIZE_OPTIONS.includes(parsed as (typeof PAGE_SIZE_OPTIONS)[number])
    ? parsed
    : 25;
}

function parseAccountFilter(value: string | undefined): AccountFilter {
  return value === "debt" || value === "clear" || value === "credit"
    ? value
    : "all";
}

function parseSort(value: string | undefined): SortOption {
  return value === "debt_desc" || value === "debt_asc" ? value : "name";
}

function cleanSearch(value: string | undefined) {
  return (value ?? "").trim().replaceAll(",", " ");
}

function buildClientesHref({
  query,
  account,
  sort,
  page,
  perPage,
}: {
  query: string;
  account: AccountFilter;
  sort: SortOption;
  page: number;
  perPage: number;
}) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }
  if (account !== "all") {
    params.set("estado", account);
  }
  if (sort !== "name") {
    params.set("orden", sort);
  }
  if (page > 1) {
    params.set("pagina", String(page));
  }
  if (perPage !== 25) {
    params.set("porPagina", String(perPage));
  }

  const search = params.toString();
  return search ? `/clientes?${search}` : "/clientes";
}

function applyCustomerSearch<QueryBuilder extends { or: (filters: string) => QueryBuilder }>(
  queryBuilder: QueryBuilder,
  query: string
) {
  if (!query) {
    return queryBuilder;
  }

  const term = `%${query}%`;
  return queryBuilder.or(
    `name.ilike.${term},phone.ilike.${term},email.ilike.${term},address.ilike.${term}`
  );
}

function applyBalanceFilter<QueryBuilder extends {
  gt: (column: string, value: number) => QueryBuilder;
  eq: (column: string, value: number) => QueryBuilder;
  lt: (column: string, value: number) => QueryBuilder;
}>(queryBuilder: QueryBuilder, account: AccountFilter) {
  if (account === "debt") {
    return queryBuilder.gt("balance", 0);
  }
  if (account === "clear") {
    return queryBuilder.eq("balance", 0);
  }
  if (account === "credit") {
    return queryBuilder.lt("balance", 0);
  }

  return queryBuilder;
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "debt" | "clear" | "credit";
}) {
  return (
    <Card
      className={cn(
        "min-h-24",
        tone === "debt" && "border-destructive/30 bg-destructive/5",
        tone === "clear" && "border-emerald-500/30 bg-emerald-50",
        tone === "credit" && "border-sky-500/30 bg-sky-50"
      )}
    >
      <CardContent className="p-4">
        <p className="text-base font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function CustomerActions({ customerId }: { customerId: string }) {
  return (
    <div className="flex flex-col gap-2 min-[440px]:flex-row lg:justify-end">
      <Button asChild className="h-12 gap-2 px-4 text-base">
        <Link href={`/clientes/${customerId}`}>
          <Eye className="size-5" aria-hidden="true" />
          Ver
        </Link>
      </Button>
      <Button asChild variant="outline" className="h-12 gap-2 px-4 text-base">
        <Link href={`/clientes/${customerId}/editar`}>
          <Edit className="size-5" aria-hidden="true" />
          Editar
        </Link>
      </Button>
    </div>
  );
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = (await searchParams) ?? {};
  const query = cleanSearch(getSingleParam(params, "q"));
  const account = parseAccountFilter(getSingleParam(params, "estado"));
  const sort = parseSort(getSingleParam(params, "orden"));
  const perPage = parsePageSize(getSingleParam(params, "porPagina"));
  const page = parsePositiveInteger(getSingleParam(params, "pagina"), 1);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();

  const [
    totalCustomersResult,
    debtCountResult,
    clearCountResult,
    creditCountResult,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .is("deleted_at", null),
    supabase
      .from("customer_account_balances")
      .select("customer_id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .gt("balance", 0),
    supabase
      .from("customer_account_balances")
      .select("customer_id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("balance", 0),
    supabase
      .from("customer_account_balances")
      .select("customer_id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .lt("balance", 0),
  ]);

  const summaryError =
    totalCustomersResult.error ||
    debtCountResult.error ||
    clearCountResult.error ||
    creditCountResult.error;

  let customers: CustomerRow[] = [];
  let balances = new Map<string, number>();
  let totalMatchingCustomers = 0;
  let loadError: unknown = null;

  const needsBalanceDataset = account !== "all" || sort !== "name";

  if (needsBalanceDataset) {
    let balanceQuery = supabase
      .from("customer_account_balances")
      .select("customer_id,balance")
      .eq("tenant_id", tenant.id);

    balanceQuery = applyBalanceFilter(balanceQuery, account);

    if (sort === "debt_desc") {
      balanceQuery = balanceQuery.order("balance", { ascending: false });
    } else if (sort === "debt_asc") {
      balanceQuery = balanceQuery.order("balance", { ascending: true });
    } else {
      balanceQuery = balanceQuery.order("customer_id", { ascending: true });
    }

    const balanceResult = await balanceQuery.limit(BALANCE_ID_LIMIT);

    if (balanceResult.error) {
      loadError = balanceResult.error;
    } else {
      const balanceRows = (balanceResult.data ?? []) as unknown as BalanceRow[];
      balances = new Map(balanceRows.map((row) => [row.customer_id, row.balance]));
      const eligibleIds = balanceRows.map((row) => row.customer_id);

      if (eligibleIds.length > 0) {
        if (sort === "name") {
          let customerQuery = supabase
            .from("customers")
            .select("id,name,phone,email,address", { count: "exact" })
            .eq("tenant_id", tenant.id)
            .is("deleted_at", null)
            .in("id", eligibleIds)
            .order("name", { ascending: true })
            .range(from, to);

          customerQuery = applyCustomerSearch(customerQuery, query);

          const customerResult = await customerQuery;
          loadError = customerResult.error;
          customers = (customerResult.data ?? []) as unknown as CustomerRow[];
          totalMatchingCustomers = customerResult.count ?? 0;
        } else {
          let matchingIds = eligibleIds;

          if (query) {
            let idQuery = supabase
              .from("customers")
              .select("id", { count: "exact" })
              .eq("tenant_id", tenant.id)
              .is("deleted_at", null)
              .in("id", eligibleIds)
              .limit(BALANCE_ID_LIMIT);

            idQuery = applyCustomerSearch(idQuery, query);

            const idResult = await idQuery;
            if (idResult.error) {
              loadError = idResult.error;
            } else {
              const foundIds = new Set(
                ((idResult.data ?? []) as { id: string }[]).map((row) => row.id)
              );
              matchingIds = eligibleIds.filter((id) => foundIds.has(id));
              totalMatchingCustomers = idResult.count ?? matchingIds.length;
            }
          } else {
            totalMatchingCustomers = eligibleIds.length;
          }

          const pageIds = matchingIds.slice(from, from + perPage);

          if (pageIds.length > 0 && !loadError) {
            const customerResult = await supabase
              .from("customers")
              .select("id,name,phone,email,address")
              .eq("tenant_id", tenant.id)
              .is("deleted_at", null)
              .in("id", pageIds);

            if (customerResult.error) {
              loadError = customerResult.error;
            } else {
              const customersById = new Map(
                ((customerResult.data ?? []) as unknown as CustomerRow[]).map(
                  (customer) => [customer.id, customer]
                )
              );
              customers = pageIds
                .map((id) => customersById.get(id))
                .filter((customer): customer is CustomerRow => Boolean(customer));
            }
          }
        }
      }
    }
  } else {
    let customerQuery = supabase
      .from("customers")
      .select("id,name,phone,email,address", { count: "exact" })
      .eq("tenant_id", tenant.id)
      .is("deleted_at", null)
      .order("name", { ascending: true })
      .range(from, to);

    customerQuery = applyCustomerSearch(customerQuery, query);

    const customerResult = await customerQuery;
    loadError = customerResult.error;
    customers = (customerResult.data ?? []) as unknown as CustomerRow[];
    totalMatchingCustomers = customerResult.count ?? 0;

    const customerIds = customers.map((customer) => customer.id);
    if (customerIds.length > 0 && !loadError) {
      const balanceResult = await supabase
        .from("customer_account_balances")
        .select("customer_id,balance")
        .eq("tenant_id", tenant.id)
        .in("customer_id", customerIds);

      if (balanceResult.error) {
        loadError = balanceResult.error;
      } else {
        balances = new Map(
          ((balanceResult.data ?? []) as unknown as BalanceRow[]).map((row) => [
            row.customer_id,
            row.balance,
          ])
        );
      }
    }
  }

  const totalCustomers = totalCustomersResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatchingCustomers / perPage));
  const firstShown = totalMatchingCustomers === 0 ? 0 : from + 1;
  const lastShown = Math.min(from + customers.length, totalMatchingCustomers);
  const hasSearchOrFilter = query.length > 0 || account !== "all";
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;
  const hasLoadError = Boolean(loadError || summaryError);

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Consulta clientes, datos de contacto y deuda actual."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild className="h-12 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
          <Link href="/clientes/nuevo">
            <Plus className="size-6" aria-hidden="true" />
            Nuevo cliente
          </Link>
        </Button>
        <ExportMenuButton
          csvHref="/api/export/clientes?format=csv"
          pdfHref="/api/export/clientes?format=pdf"
        />
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total clientes" value={totalCustomers} />
        <SummaryCard
          label="Con deuda"
          value={debtCountResult.count ?? 0}
          tone="debt"
        />
        <SummaryCard
          label="Sin deuda"
          value={clearCountResult.count ?? 0}
          tone="clear"
        />
        <SummaryCard
          label="Saldo a favor"
          value={creditCountResult.count ?? 0}
          tone="credit"
        />
      </section>

      <Card className="mb-5">
        <CardContent className="grid gap-4 p-4">
          <form action="/clientes" className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <input type="hidden" name="estado" value={account} />
            <input type="hidden" name="orden" value={sort} />
            <input type="hidden" name="porPagina" value={perPage} />
            <label className="grid gap-2 text-base font-semibold">
              Buscar cliente
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Buscar por nombre, teléfono, email o dirección"
                  className="h-14 w-full rounded-md border border-border bg-background py-3 pl-12 pr-4 text-lg text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </label>
            <Button type="submit" className="h-14 gap-2 px-6 text-lg lg:self-end">
              <Search className="size-5" aria-hidden="true" />
              Buscar
            </Button>
          </form>

          <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
            <div className="flex flex-wrap gap-2">
              {accountFilters.map((filter) => (
                <Button
                  key={filter.value}
                  asChild
                  variant={account === filter.value ? "default" : "outline"}
                  className="h-11 px-4 text-base"
                >
                  <Link
                    href={buildClientesHref({
                      query,
                      account: filter.value,
                      sort,
                      page: 1,
                      perPage,
                    })}
                  >
                    {filter.label}
                  </Link>
                </Button>
              ))}
            </div>

            <form action="/clientes" className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="q" value={query} />
              <input type="hidden" name="estado" value={account} />
              <label className="grid gap-1 text-sm font-semibold">
                Ordenar por
                <select
                  name="orden"
                  defaultValue={sort}
                  className="h-11 rounded-md border border-border bg-background px-3 text-base text-foreground"
                >
                  <option value="name">Nombre</option>
                  <option value="debt_desc">Mayor deuda</option>
                  <option value="debt_asc">Menor deuda</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                Por página
                <select
                  name="porPagina"
                  defaultValue={perPage}
                  className="h-11 rounded-md border border-border bg-background px-3 text-base text-foreground"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </label>
              <Button type="submit" variant="outline" className="h-11 text-base sm:col-span-2">
                Aplicar
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {hasLoadError ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Necesita revision</CardTitle>
            <CardDescription>
              No se pudieron cargar los clientes o sus saldos.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : totalCustomers === 0 ? (
        <Card>
          <CardHeader>
            <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Users className="size-6" aria-hidden="true" />
            </div>
            <CardTitle>No hay clientes cargados</CardTitle>
            <CardDescription>
              Creá el primer cliente para usar cuenta corriente y presupuestos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="h-12 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
              <Link href="/clientes/nuevo">
                <Plus className="size-6" aria-hidden="true" />
                Nuevo cliente
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : customers.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No encontramos clientes con esa búsqueda.</CardTitle>
            <CardDescription>Probá buscar por nombre o teléfono.</CardDescription>
          </CardHeader>
          {hasSearchOrFilter ? (
            <CardContent>
              <Button asChild variant="outline" className="h-11 px-4 text-base">
                <Link href="/clientes">Ver todos los clientes</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <section className="grid gap-4">
          <div className="hidden overflow-hidden rounded-md border border-border bg-card lg:block">
            <table className="w-full border-collapse text-left">
              <thead className="bg-muted/70">
                <tr className="border-b border-border">
                  <th className="px-4 py-4 text-base font-bold text-foreground">
                    Cliente
                  </th>
                  <th className="px-4 py-4 text-base font-bold text-foreground">
                    Teléfono
                  </th>
                  <th className="px-4 py-4 text-base font-bold text-foreground">
                    Email
                  </th>
                  <th className="px-4 py-4 text-base font-bold text-foreground">
                    Dirección
                  </th>
                  <th className="px-4 py-4 text-base font-bold text-foreground">
                    Estado de cuenta
                  </th>
                  <th className="px-4 py-4 text-right text-base font-bold text-foreground">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const balance = balances.get(customer.id) ?? 0;
                  const debt = formatDebt(balance);

                  return (
                    <tr
                      key={customer.id}
                      className="border-b border-border last:border-b-0 even:bg-muted/25"
                    >
                      <td className="max-w-[260px] px-4 py-4 text-lg font-bold text-foreground">
                        {customer.name}
                      </td>
                      <td className="px-4 py-4 text-base text-foreground">
                        {customer.phone ?? "Sin teléfono"}
                      </td>
                      <td className="max-w-[240px] px-4 py-4 text-base text-foreground">
                        <span className="block truncate">
                          {customer.email ?? "Sin email"}
                        </span>
                      </td>
                      <td className="max-w-[280px] px-4 py-4 text-base text-foreground">
                        <span className="block truncate">
                          {customer.address ?? "Sin dirección"}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex min-h-11 items-center rounded-md border px-3 text-base font-bold",
                            debt.className
                          )}
                        >
                          {debt.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <CustomerActions customerId={customer.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 lg:hidden">
            {customers.map((customer) => {
              const balance = balances.get(customer.id) ?? 0;
              const debt = formatDebt(balance);

              return (
                <Card key={customer.id}>
                  <CardContent className="grid gap-3 p-4">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-bold text-foreground">
                        {customer.name}
                      </h2>
                      <p className="mt-2 text-base">
                        Teléfono: {customer.phone ?? "Sin teléfono"}
                      </p>
                      <p className="text-base text-muted-foreground">
                        Email: {customer.email ?? "Sin email"}
                      </p>
                      <p className="text-base text-muted-foreground">
                        Dirección: {customer.address ?? "Sin dirección"}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "rounded-md border p-3 text-lg font-bold",
                        debt.className
                      )}
                    >
                      {debt.label}
                    </p>
                    <CustomerActions customerId={customer.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
            <p className="text-base font-semibold text-foreground">
              Mostrando {firstShown}-{lastShown} de {totalMatchingCustomers} clientes
            </p>
            <div className="flex gap-2">
              <Button
                asChild={hasPrevious}
                variant="outline"
                className="h-11 gap-2 px-4 text-base"
                disabled={!hasPrevious}
              >
                {hasPrevious ? (
                  <Link
                    href={buildClientesHref({
                      query,
                      account,
                      sort,
                      page: page - 1,
                      perPage,
                    })}
                  >
                    <ChevronLeft className="size-5" aria-hidden="true" />
                    Anterior
                  </Link>
                ) : (
                  <>
                    <ChevronLeft className="size-5" aria-hidden="true" />
                    Anterior
                  </>
                )}
              </Button>
              <Button
                asChild={hasNext}
                variant="outline"
                className="h-11 gap-2 px-4 text-base"
                disabled={!hasNext}
              >
                {hasNext ? (
                  <Link
                    href={buildClientesHref({
                      query,
                      account,
                      sort,
                      page: page + 1,
                      perPage,
                    })}
                  >
                    Siguiente
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    Siguiente
                    <ChevronRight className="size-5" aria-hidden="true" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
