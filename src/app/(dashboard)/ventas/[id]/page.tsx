import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shell/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintSaleButton } from "@/components/ventas/sale-actions";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

type SalePageProps = {
  params: Promise<{ id: string }>;
};

type SaleRow = {
  id: string;
  sale_number: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  payment_method: string | null;
  created_at: string;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
};

type SaleItemRow = {
  sku: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
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

export default async function SaleDetailPage({ params }: SalePageProps) {
  const { id } = await params;
  const tenant = getCurrentTenant();
  const supabase = getSupabaseServerClient();
  const [saleResult, itemsResult] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id,sale_number,subtotal,discount_amount,tax_amount,total,paid_amount,payment_method,created_at,customers(name,phone,email,address)"
      )
      .eq("tenant_id", tenant.id)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("sale_items")
      .select("sku,name,quantity,unit_price,total")
      .eq("tenant_id", tenant.id)
      .eq("sale_id", id)
      .order("name"),
  ]);

  if (saleResult.error || !saleResult.data) {
    notFound();
  }

  const sale = saleResult.data as unknown as SaleRow;
  const items = (itemsResult.data ?? []) as unknown as SaleItemRow[];
  const pendingAmount = Math.max(sale.total - sale.paid_amount, 0);

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={`Venta #${sale.sale_number}`}
          description="Detalle listo para revisar o imprimir."
          backHref="/ventas"
          backLabel="Volver a ventas"
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
              <p className="text-base text-muted-foreground">Venta</p>
              <p className="text-2xl font-bold">#{sale.sale_number}</p>
              <p className="mt-2 text-base">Fecha: {formatDate(sale.created_at)}</p>
              <p className="text-base">
                Forma de pago: {sale.payment_method ?? "Sin forma de pago"}
              </p>
              <p className="text-base">Monto pagado: {formatMoney(sale.paid_amount)}</p>
              {pendingAmount > 0 ? (
                <p className="text-base font-semibold text-destructive">
                  Pendiente: {formatMoney(pendingAmount)}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-base text-muted-foreground">Cliente</p>
              <p className="text-xl font-semibold">
                {sale.customers?.name ?? "Sin cliente"}
              </p>
              {sale.customers?.phone ? <p>Telefono: {sale.customers.phone}</p> : null}
              {sale.customers?.email ? <p>Email: {sale.customers.email}</p> : null}
              {sale.customers?.address ? <p>Domicilio: {sale.customers.address}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Productos vendidos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-base">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3">Codigo</th>
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
          <div className="no-print">
            <PrintSaleButton />
          </div>
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-primary p-5 text-primary-foreground">
                <p className="text-lg">Total de la venta</p>
                <p className="mt-1 text-4xl font-bold">
                  {formatMoney(sale.total)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
