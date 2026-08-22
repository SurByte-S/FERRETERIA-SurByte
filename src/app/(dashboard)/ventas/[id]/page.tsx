import { notFound } from "next/navigation";

import {
  PrintDocument,
  type PrintBusiness,
  type PrintTotalRow,
} from "@/components/print/print-document";
import { DocumentPreviewToolbar } from "@/components/print/document-preview-toolbar";
import { PageHeader } from "@/components/shell/page-header";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
import {
  buildPrintInvoiceSettings,
  type PrintInvoiceSettings,
  type PrintTenantBusinessDetails,
  type TenantInvoiceSettingsRow,
} from "@/lib/print/invoice-settings";
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

type TenantBusinessRow = PrintTenantBusinessDetails & {
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
  sale_unit_name: string | null;
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
  tenantDetails: TenantBusinessRow | null,
  printInvoiceSettings: PrintInvoiceSettings
): PrintBusiness {
  return {
    name:
      printInvoiceSettings.legalName ??
      tenantDetails?.business_name ??
      tenantDetails?.name ??
      ferreteriaGuemesBrand.brandName,
    subtitle: ferreteriaGuemesBrand.slogan,
    address: printInvoiceSettings.fiscalAddress ?? ferreteriaGuemesBrand.address,
    phone: tenantDetails?.phone ?? ferreteriaGuemesBrand.phone,
    email: tenantDetails?.email ?? ferreteriaGuemesBrand.email,
    taxId: printInvoiceSettings.cuit ?? ferreteriaGuemesBrand.taxId,
    logoUrl: tenantDetails?.logo_url ?? ferreteriaGuemesBrand.logoPath,
  };
}

export default async function SaleDetailPage({ params }: SalePageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [saleResult, itemsResult, tenantResult, invoiceSettingsResult] =
    await Promise.all([
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
        .select("sku,name,quantity,sale_unit_name,unit_price,total")
        .eq("tenant_id", tenant.id)
        .eq("sale_id", id)
        .order("name"),
      supabase
        .from("tenants")
        .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
        .eq("id", tenant.id)
        .maybeSingle(),
      supabase
        .from("tenant_invoice_settings")
        .select(
          "legal_name,cuit,iva_condition,fiscal_address,sale_point,gross_income,activity_start_date,invoice_footer_text,print_paper_size"
        )
        .eq("tenant_id", tenant.id)
        .maybeSingle(),
    ]);

  if (saleResult.error || !saleResult.data) {
    notFound();
  }

  const sale = saleResult.data as unknown as SaleRow;
  const items = (itemsResult.data ?? []) as unknown as SaleItemRow[];
  const tenantDetails = tenantResult.data as TenantBusinessRow | null;
  const invoiceSettings = invoiceSettingsResult.error
    ? null
    : (invoiceSettingsResult.data as TenantInvoiceSettingsRow | null);
  const printInvoiceSettings = buildPrintInvoiceSettings(
    tenantDetails,
    invoiceSettings
  );
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
        <DocumentPreviewToolbar
          backHref="/ventas"
          backLabel="Volver a ventas"
          historyHref="/presupuestos?tipo=ventas"
          printLabel="Imprimir venta"
          printPaperSize={printInvoiceSettings.printPaperSize}
        />
        <PageHeader
          title={`Venta #${sale.sale_number}`}
          description="Detalle listo para revisar o imprimir."
          eyebrow=""
        />
      </div>

      <div className="grid gap-6">
        <PrintDocument
          business={buildBusiness(tenantDetails, printInvoiceSettings)}
          invoiceSettings={printInvoiceSettings}
          printPaperSize={printInvoiceSettings.printPaperSize}
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
            description: item.sale_unit_name
              ? `${item.name} (${item.sale_unit_name})`
              : item.name,
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
      </div>
    </>
  );
}
