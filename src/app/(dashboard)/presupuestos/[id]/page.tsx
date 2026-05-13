import { notFound } from "next/navigation";

import {
  ConvertQuoteButton,
  PrintQuoteButton,
} from "@/components/presupuestos/quote-actions";
import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

type QuotePageProps = {
  params: Promise<{ id: string }>;
};

type QuoteRow = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  status: string;
  subtotal: number;
  total: number;
  created_at: string;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
};

type CustomerOption = {
  id: string;
  name: string;
};

type QuoteItemRow = {
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
  products: {
    stock_quantity: number;
  } | null;
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

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Borrador",
    issued: "Emitido",
    cancelled: "Cancelado",
    converted: "Convertido en venta",
  };

  return labels[status] ?? status;
}

export default async function QuoteDetailPage({ params }: QuotePageProps) {
  const { id } = await params;
  const tenant = getCurrentTenant();
  const supabase = getSupabaseServerClient();
  const [quoteResult, itemsResult, customersResult] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id,quote_number,customer_id,status,subtotal,total,created_at,customers(name,phone,email,address)"
      )
      .eq("tenant_id", tenant.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("quote_items")
      .select("sku,name,quantity,unit_price,total,products(stock_quantity)")
      .eq("tenant_id", tenant.id)
      .eq("quote_id", id)
      .order("name"),
    supabase
      .from("customers")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .order("name")
      .limit(300),
  ]);

  if (quoteResult.error || !quoteResult.data) {
    notFound();
  }

  const quote = quoteResult.data as unknown as QuoteRow;
  const items = (itemsResult.data ?? []) as unknown as QuoteItemRow[];
  const customers = (customersResult.data ?? []) as unknown as CustomerOption[];
  const negativeStockWarnings = items
    .filter(
      (item) =>
        item.products &&
        Number(item.products.stock_quantity) - Number(item.quantity) < 0
    )
    .map((item) => ({
      name: item.name,
      sku: item.sku,
      currentStock: Number(item.products?.stock_quantity ?? 0),
      requestedQuantity: Number(item.quantity),
    }));

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Presupuesto #${quote.quote_number}`}
          description="Detalle listo para imprimir o convertir en venta."
          backHref="/presupuestos"
          backLabel="Volver a presupuestos"
        />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{process.env.NEXT_PUBLIC_DEFAULT_TENANT_NAME}</CardTitle>
            <CardDescription>
              {process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-base text-muted-foreground">Presupuesto</p>
              <p className="text-2xl font-bold">#{quote.quote_number}</p>
              <p className="mt-2 text-base">Fecha: {formatDate(quote.created_at)}</p>
              <p className="text-base">Estado: {statusLabel(quote.status)}</p>
            </div>
            <div>
              <p className="text-base text-muted-foreground">Cliente</p>
              <p className="text-xl font-semibold">
                {quote.customers?.name ?? "Sin cliente"}
              </p>
              {quote.customers?.phone ? <p>Teléfono: {quote.customers.phone}</p> : null}
              {quote.customers?.email ? <p>Email: {quote.customers.email}</p> : null}
              {quote.customers?.address ? <p>Domicilio: {quote.customers.address}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Código</th>
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Cantidad</th>
                  <th className="p-3">Precio unitario</th>
                  <th className="p-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.sku}-${item.name}`} className="border-b border-border">
                    <td className="p-3 font-mono">{item.sku ?? "-"}</td>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3">{item.quantity}</td>
                    <td className="p-3">{formatMoney(item.unit_price)}</td>
                    <td className="p-3 font-semibold">{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="no-print flex flex-col gap-3 sm:flex-row">
            <PrintQuoteButton />
            <ConvertQuoteButton
              quoteId={quote.id}
              total={quote.total}
              initialCustomerId={quote.customer_id}
              customers={customers}
              disabled={quote.status === "converted" || items.length === 0}
              stockWarnings={negativeStockWarnings}
            />
          </div>
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-primary p-5 text-primary-foreground">
                <p className="text-lg">Total del presupuesto</p>
                <p className="mt-1 text-4xl font-bold">
                  {formatMoney(quote.total)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
