import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import {
  ConvertQuoteButton,
  PrintQuoteButton,
} from "@/components/presupuestos/quote-actions";
import { DeleteQuoteButton } from "@/components/presupuestos/delete-quote-button";
import {
  PrintDocument,
  type PrintBusiness,
  type PrintTotalRow,
} from "@/components/print/print-document";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  defaultInvoiceSettings,
  ferreteriaGuemesBrand,
} from "@/lib/brand/ferreteria-guemes";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

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

type InvoiceSettingsRow = {
  fantasy_name: string | null;
  legal_name: string | null;
  tax_id: string | null;
  iva_condition: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  receipt_footer: string | null;
  receipt_message: string | null;
};

type QuoteItemRow = {
  sku: string | null;
  name: string;
  quantity: number;
  sale_unit_name: string | null;
  quantity_in_base_unit: number;
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

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function preferred(
  settingValue: string | null | undefined,
  tenantValue: string | null | undefined,
  fallback = ""
) {
  return clean(settingValue) || clean(tenantValue) || fallback;
}

function buildBusiness(
  tenantDetails: TenantBusinessRow | null,
  invoiceSettings: InvoiceSettingsRow | null
): PrintBusiness {
  return {
    name: preferred(
      invoiceSettings?.fantasy_name,
      tenantDetails?.name,
      ferreteriaGuemesBrand.brandName
    ),
    subtitle: ferreteriaGuemesBrand.slogan,
    legalName: preferred(
      invoiceSettings?.legal_name,
      tenantDetails?.business_name,
      defaultInvoiceSettings.legalName
    ),
    address: preferred(
      invoiceSettings?.address,
      tenantDetails?.address,
      ferreteriaGuemesBrand.address
    ),
    city: clean(invoiceSettings?.city) || defaultInvoiceSettings.city,
    province:
      clean(invoiceSettings?.province) || defaultInvoiceSettings.province,
    phone: preferred(
      invoiceSettings?.phone,
      tenantDetails?.phone,
      ferreteriaGuemesBrand.phone
    ),
    email: preferred(
      invoiceSettings?.email,
      tenantDetails?.email,
      ferreteriaGuemesBrand.email
    ),
    taxId: preferred(
      invoiceSettings?.tax_id,
      tenantDetails?.tax_id,
      ferreteriaGuemesBrand.taxId
    ),
    ivaCondition:
      clean(invoiceSettings?.iva_condition) ||
      defaultInvoiceSettings.ivaCondition,
    receiptFooter:
      clean(invoiceSettings?.receipt_footer) ||
      defaultInvoiceSettings.receiptFooter,
    receiptMessage:
      clean(invoiceSettings?.receipt_message) ||
      defaultInvoiceSettings.receiptMessage,
    logoUrl: tenantDetails?.logo_url ?? ferreteriaGuemesBrand.logoPath,
  };
}

export default async function QuoteDetailPage({ params }: QuotePageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [
    quoteResult,
    itemsResult,
    customersResult,
    tenantResult,
    invoiceSettingsResult,
  ] =
    await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id,quote_number,customer_id,status,subtotal,total,created_at,customers(name,phone,email,address)"
        )
        .eq("tenant_id", tenant.id)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle(),
      supabase
        .from("quote_items")
        .select("sku,name,quantity,sale_unit_name,quantity_in_base_unit,unit_price,total,products(stock_quantity)")
        .eq("tenant_id", tenant.id)
        .eq("quote_id", id)
        .order("name"),
      supabase
        .from("customers")
        .select("id,name")
        .eq("tenant_id", tenant.id)
        .is("deleted_at", null)
        .order("name")
        .limit(300),
      supabase
        .from("tenants")
        .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
        .eq("id", tenant.id)
        .maybeSingle(),
      supabase
        .from("tenant_invoice_settings")
        .select(
          "fantasy_name,legal_name,tax_id,iva_condition,address,city,province,phone,email,receipt_footer,receipt_message"
        )
        .eq("tenant_id", tenant.id)
        .maybeSingle(),
    ]);

  if (quoteResult.error || !quoteResult.data) {
    notFound();
  }

  const quote = quoteResult.data as unknown as QuoteRow;
  const items = (itemsResult.data ?? []) as unknown as QuoteItemRow[];
  const customers = (customersResult.data ?? []) as unknown as CustomerOption[];
  const tenantDetails = tenantResult.data as TenantBusinessRow | null;
  const invoiceSettings =
    invoiceSettingsResult.data as InvoiceSettingsRow | null;
  const totalRows: PrintTotalRow[] = [
    {
      label: "Subtotal",
      value: formatMoney(quote.subtotal),
    },
  ];
  const negativeStockWarnings = items
    .filter(
      (item) =>
        item.products &&
        Number(item.products.stock_quantity) -
          Number(item.quantity) * Number(item.quantity_in_base_unit ?? 1) <
          0
    )
    .map((item) => ({
      name: item.name,
      sku: item.sku,
      currentStock: Number(item.products?.stock_quantity ?? 0),
      requestedQuantity:
        Number(item.quantity) * Number(item.quantity_in_base_unit ?? 1),
    }));
  const canConvertToSale =
    quote.status !== "converted" &&
    quote.status !== "converted_to_sale" &&
    quote.status !== "cancelled" &&
    items.length > 0;

  return (
    <>
      <div className="no-print">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="outline" className="h-9 gap-1.5 px-3 text-sm">
            <Link href="/presupuestos">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Volver a presupuestos
            </Link>
          </Button>
          <PrintQuoteButton />
          {tenant.role === "owner" || tenant.role === "admin" ? (
            <DeleteQuoteButton
              quoteId={quote.id}
              isConverted={quote.status === "converted"}
            />
          ) : null}
        </div>
        <PageHeader
          title={`Presupuesto #${quote.quote_number}`}
          description={
            canConvertToSale
              ? "Detalle listo para imprimir o convertir en venta."
              : "Detalle listo para imprimir."
          }
          eyebrow=""
        />
      </div>

      <div className="grid gap-6">
        {canConvertToSale ? (
          <div className="no-print">
            <ConvertQuoteButton
              quoteId={quote.id}
              total={quote.total}
              initialCustomerId={quote.customer_id}
              customers={customers}
              disabled={!canConvertToSale}
              stockWarnings={negativeStockWarnings}
            />
          </div>
        ) : null}

        <PrintDocument
          business={buildBusiness(tenantDetails, invoiceSettings)}
          document={{
            typeLabel: "Presupuesto",
            numberLabel: `#${quote.quote_number}`,
            shortId: quote.id.slice(0, 8).toUpperCase(),
            dateLabel: formatDate(quote.created_at),
            statusLabel: statusLabel(quote.status),
          }}
          customer={quote.customers}
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
          finalTotalLabel="Total del presupuesto"
          finalTotal={formatMoney(quote.total)}
          note="Este presupuesto esta sujeto a disponibilidad de stock y actualizacion de precios."
          footerMessage="Gracias por consultar"
        />
      </div>
    </>
  );
}
