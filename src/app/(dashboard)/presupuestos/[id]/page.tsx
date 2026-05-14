import { notFound } from "next/navigation";

import {
  ConvertQuoteButton,
  PrintQuoteButton,
} from "@/components/presupuestos/quote-actions";
import {
  PrintDocument,
  type PrintBusiness,
  type PrintTotalRow,
} from "@/components/print/print-document";
import { PageHeader } from "@/components/shell/page-header";
import { ferreteriaGuemesBrand } from "@/lib/brand/ferreteria-guemes";
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

function buildBusiness(tenantDetails: TenantBusinessRow | null): PrintBusiness {
  return {
    name: ferreteriaGuemesBrand.brandName,
    subtitle: ferreteriaGuemesBrand.slogan,
    address: tenantDetails?.address ?? ferreteriaGuemesBrand.address,
    phone: tenantDetails?.phone ?? ferreteriaGuemesBrand.phone,
    email: tenantDetails?.email ?? ferreteriaGuemesBrand.email,
    taxId: tenantDetails?.tax_id ?? ferreteriaGuemesBrand.taxId,
    logoUrl: tenantDetails?.logo_url ?? ferreteriaGuemesBrand.logoPath,
  };
}

export default async function QuoteDetailPage({ params }: QuotePageProps) {
  const { id } = await params;
  const tenant = await requireTenant();
  const supabase = getSupabaseServerClient();
  const [quoteResult, itemsResult, customersResult, tenantResult] =
    await Promise.all([
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
      supabase
        .from("tenants")
        .select("name,slug,business_name,tax_id,phone,email,address,logo_url")
        .eq("id", tenant.id)
        .maybeSingle(),
    ]);

  if (quoteResult.error || !quoteResult.data) {
    notFound();
  }

  const quote = quoteResult.data as unknown as QuoteRow;
  const items = (itemsResult.data ?? []) as unknown as QuoteItemRow[];
  const customers = (customersResult.data ?? []) as unknown as CustomerOption[];
  const tenantDetails = tenantResult.data as TenantBusinessRow | null;
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
        <PrintDocument
          business={buildBusiness(tenantDetails)}
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
            description: item.name,
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
      </div>
    </>
  );
}
