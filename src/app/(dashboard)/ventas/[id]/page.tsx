import { notFound } from "next/navigation";

import {
  PrintDocument,
  type PrintBusiness,
  type PrintTotalRow,
} from "@/components/print/print-document";
import { PageHeader } from "@/components/shell/page-header";
import { PrintSaleButton } from "@/components/ventas/sale-actions";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

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
  cash_session_id: string | null;
  created_at: string;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
  cash_register_sessions: {
    opened_at: string;
  } | null;
};

type TenantBusinessRow = {
  name: string;
  slug: string;
  business_name: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
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

function buildBusiness(
  tenant: { name: string; slug: string },
  tenantDetails: TenantBusinessRow | null
): PrintBusiness {
  return {
    name:
      tenantDetails?.business_name ??
      tenantDetails?.name ??
      process.env.NEXT_PUBLIC_DEFAULT_TENANT_NAME ??
      tenant.name,
    subtitle: "Ferreteria / Herramientas / Buloneria / Sanitarios",
    address: tenantDetails?.address ?? "Direccion no configurada",
    phone: tenantDetails?.phone ?? "Telefono no configurado",
    email: tenantDetails?.email ?? "Email no configurado",
    taxId: tenantDetails?.tax_id ?? "CUIT no configurado",
    logoUrl: tenantDetails?.logo_url,
  };
}

export default async function SaleDetailPage({ params }: SalePageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [saleResult, itemsResult, tenantResult] = await Promise.all([
    supabase
      .from("sales")
      .select(
        "id,sale_number,subtotal,discount_amount,tax_amount,total,paid_amount,payment_method,cash_session_id,created_at,customers(name,phone,email,address),cash_register_sessions(opened_at)"
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
    supabase
      .from("tenants")
      .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
      .eq("id", tenant.id)
      .maybeSingle(),
  ]);

  if (saleResult.error || !saleResult.data) {
    notFound();
  }

  const sale = saleResult.data as unknown as SaleRow;
  const items = (itemsResult.data ?? []) as unknown as SaleItemRow[];
  const tenantDetails = tenantResult.data as TenantBusinessRow | null;
  const pendingAmount = Math.max(sale.total - sale.paid_amount, 0);
  const isAccountSale = sale.payment_method === "Cuenta corriente";
  const totalRows: PrintTotalRow[] = [
    {
      label: "Subtotal",
      value: formatMoney(sale.subtotal),
    },
  ];

  if (sale.discount_amount > 0) {
    totalRows.push({
      label: "Descuento",
      value: `-${formatMoney(sale.discount_amount)}`,
    });
  }

  totalRows.push({
    label: "Monto pagado",
    value: formatMoney(sale.paid_amount),
    emphasis: "strong",
  });

  if (pendingAmount > 0) {
    totalRows.push({
      label: isAccountSale
        ? "Saldo pendiente en cuenta corriente"
        : "Saldo pendiente",
      value: formatMoney(pendingAmount),
      emphasis: "warning",
    });
  }

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
        <PrintDocument
          business={buildBusiness(tenant, tenantDetails)}
          document={{
            typeLabel: "Comprobante de venta",
            numberLabel: `#${sale.sale_number}`,
            shortId: sale.id.slice(0, 8).toUpperCase(),
            dateLabel: formatDate(sale.created_at),
            statusLabel: pendingAmount > 0 ? "Con saldo pendiente" : "Pagada",
            paymentMethod: sale.payment_method ?? "Sin forma de pago",
            cashLabel: sale.cash_session_id
              ? sale.cash_register_sessions?.opened_at
                ? `Asociada desde ${formatDate(sale.cash_register_sessions.opened_at)}`
                : "Caja asociada"
              : "Sin caja asociada",
          }}
          customer={sale.customers}
          items={items.map((item) => ({
            code: item.sku,
            description: item.name,
            quantity: item.quantity,
            unitPrice: formatMoney(item.unit_price),
            total: formatMoney(item.total),
          }))}
          totals={totalRows}
          finalTotalLabel="Total de la venta"
          finalTotal={formatMoney(sale.total)}
          badgeLabel={isAccountSale ? "Cuenta corriente" : null}
          note="Operacion registrada como comprobante interno del comercio."
          footerMessage="Gracias por su compra"
        />

        <div className="no-print">
          <PrintSaleButton />
        </div>
      </div>
    </>
  );
}
