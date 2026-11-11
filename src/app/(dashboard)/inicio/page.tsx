import Link from "next/link";

import { QuickSalePos } from "@/components/pos/quick-sale-pos";
import type {
  ProductSaleUnit,
  QuoteCustomer,
  QuoteCustomerOption,
  QuoteLine,
} from "@/components/presupuestos/quote-types";
import { logServerWarn } from "@/lib/server-log";
import { getSupabaseServerClient } from "@/lib/supabase";
import { hasRealProductBarcode, normalizeProductCode } from "@/lib/product-code";
import { requireTenant } from "@/lib/tenant";
import { requireUser } from "@/lib/auth/session";

type CashSessionRow = {
  id: string;
  opening_amount: number;
  opened_at: string;
};

type SaleRow = {
  paid_amount: number;
};

type InicioSearchParams = {
  mode?: string;
  quoteId?: string;
  sku?: string;
};

type QuoteRow = {
  id: string;
  quote_number: number;
  customer_id: string | null;
  status: string;
  total: number;
  customers: {
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  } | null;
};

type QuoteItemRow = {
  id: string;
  sort_order: number | null;
  product_id: string | null;
  product_sale_unit_id: string | null;
  sale_unit_name: string | null;
  quantity: number;
  quantity_in_base_unit: number;
  unit_price: number;
  total: number;
  sku: string | null;
  name: string;
};

type ProductRow = {
  id: string;
  sku: string;
  custom_code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean | null;
  brands?: { name: string | null } | null;
  categories?: { name: string | null } | null;
};

type ProductSaleUnitRow = {
  id: string;
  product_id: string;
  name: string;
  quantity_in_base_unit: number | null;
  sale_price: number | null;
  barcode: string | null;
  is_default: boolean | null;
  active: boolean | null;
};

type QuoteEditLoad = {
  editingBlocked?: boolean;
  editingQuoteNumber?: number;
  initialCustomer?: QuoteCustomer;
  initialLines: QuoteLine[];
  message?: string;
  quoteId?: string;
};

const EDITABLE_QUOTE_STATUSES = new Set(["draft", "issued"]);

export default async function InicioPage({
  searchParams,
}: {
  searchParams: Promise<InicioSearchParams>;
}) {
  const { mode, quoteId, sku } = await searchParams;
  const tenant = await requireTenant("/inicio");
  const user = await requireUser("/inicio");
  const supabase = getSupabaseServerClient("/inicio");
  const shouldStartInQuoteMode = mode === "quote" || Boolean(quoteId);
  const [cashStatus, customers, quoteForEditing] = await Promise.all([
    loadCashStatus(tenant.id, supabase),
    loadCustomers(tenant.id, supabase),
    shouldStartInQuoteMode && quoteId
      ? loadQuoteForEditing({
          quoteId,
          supabase,
          tenantId: tenant.id,
        })
      : Promise.resolve<QuoteEditLoad | null>(null),
  ]);

  if (quoteForEditing?.editingBlocked) {
    return (
      <section className="space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">No se puede editar este presupuesto</h1>
        <p role="alert">{quoteForEditing.message}</p>
        <p>El presupuesto original no se modificó. Podés consultarlo e imprimirlo desde su detalle.</p>
        <Link className="inline-block underline" href={`/presupuestos/${quoteForEditing.quoteId}`}>
          Ver presupuesto original
        </Link>
      </section>
    );
  }

  return (
    <QuickSalePos
      key={
        `${tenant.id}:${user.id}:${quoteForEditing?.quoteId ?? (shouldStartInQuoteMode ? "quote" : "sale")}`
      }
      cashStatus={cashStatus}
      canViewOfflineQuotes={["owner", "admin", "seller"].includes(tenant.role)}
      customers={customers}
      editingQuoteNumber={quoteForEditing?.editingQuoteNumber}
      initialCustomer={quoteForEditing?.initialCustomer}
      initialLines={quoteForEditing?.initialLines}
      initialLoadMessage={quoteForEditing?.message}
      initialMode={shouldStartInQuoteMode ? "quote" : "sale"}
      initialQuoteId={quoteForEditing?.quoteId}
      initialSku={sku}
      tenantId={tenant.id}
      userId={user.id}
      tenantName={tenant.name}
    />
  );
}

async function loadCustomers(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const { data, error } = await supabase
    .from("customers")
    .select("id,name,phone,email,address")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("name")
    .limit(300);

  if (error) {
    logServerWarn("Could not load customers", {
      source: "/inicio",
      tenantId,
      error: error.message,
    });
  }

  return (data ?? []) as unknown as QuoteCustomerOption[];
}

async function loadQuoteForEditing({
  quoteId,
  supabase,
  tenantId,
}: {
  quoteId: string;
  supabase: ReturnType<typeof getSupabaseServerClient>;
  tenantId: string;
}): Promise<QuoteEditLoad> {
  if (!isUuid(quoteId)) {
    return {
      initialLines: [],
      message: "No se pudo cargar el presupuesto: identificador invalido.",
    };
  }

  const { data: quoteData, error: quoteError } = await supabase
    .from("quotes")
    .select(
      "id,quote_number,customer_id,status,total,customers(name,phone,email,address)"
    )
    .eq("tenant_id", tenantId)
    .eq("id", quoteId)
    .is("deleted_at", null)
    .maybeSingle();

  if (quoteError || !quoteData) {
    return {
      initialLines: [],
      message: "No se pudo cargar el presupuesto para esta ferreteria.",
    };
  }

  const quote = quoteData as unknown as QuoteRow;

  if (!EDITABLE_QUOTE_STATUSES.has(quote.status)) {
    return {
      initialLines: [],
      message: "Este presupuesto no esta disponible para editar.",
    };
  }

  const { data: itemsData, error: itemsError } = await supabase
    .from("quote_items")
    .select(
      "id,sort_order,product_id,product_sale_unit_id,sale_unit_name,quantity,quantity_in_base_unit,unit_price,total,sku,name"
    )
    .eq("tenant_id", tenantId)
    .eq("quote_id", quote.id)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name")
    .order("id");

  if (itemsError) {
    return {
      editingBlocked: true,
      editingQuoteNumber: quote.quote_number,
      initialCustomer: mapQuoteCustomer(quote),
      initialLines: [],
      message: "No se pudieron cargar los productos del presupuesto.",
      quoteId: quote.id,
    };
  }

  const items = (itemsData ?? []) as unknown as QuoteItemRow[];
  const productIds = [
    ...new Set(
      items
        .map((item) => item.product_id)
        .filter((productId): productId is string => Boolean(productId))
    ),
  ];
  const [productsById, saleUnitsByProductId] = await Promise.all([
    loadProductsById({ productIds, supabase, tenantId }),
    loadSaleUnitsByProductId({ productIds, supabase, tenantId }),
  ]);
  if (!productsById || !saleUnitsByProductId) {
    return {
      editingBlocked: true,
      initialLines: [],
      quoteId: quote.id,
      message: "No se pudieron verificar los productos y presentaciones. Intentá cargar el presupuesto nuevamente.",
    };
  }

  const warnings: string[] = [];
  const lines = compactQuoteLines({
    items,
    productsById,
    saleUnitsByProductId,
    warnings,
  });

  if (lines === null) {
    return {
      editingBlocked: true,
      initialLines: [],
      quoteId: quote.id,
      message: warnings.join(" "),
    };
  }

  const messageParts = [
    `Presupuesto #${quote.quote_number} cargado como base.`,
    ...warnings,
  ];

  return {
    editingQuoteNumber: quote.quote_number,
    initialCustomer: mapQuoteCustomer(quote),
    initialLines: lines,
    message: messageParts.join(" "),
    quoteId: quote.id,
  };
}

async function loadProductsById({
  productIds,
  supabase,
  tenantId,
}: {
  productIds: string[];
  supabase: ReturnType<typeof getSupabaseServerClient>;
  tenantId: string;
}) {
  if (productIds.length === 0) {
    return new Map<string, ProductRow>();
  }

  const { data, error } = await supabase
    .from("products")
    .select(
      "id,sku,custom_code,barcode,name,description,unit,sale_price,stock_quantity,min_stock,active,brands(name),categories(name)"
    )
    .eq("tenant_id", tenantId)
    .in("id", productIds);

  if (error) {
    logServerWarn("Could not load quote products for editing", {
      source: "/inicio",
      tenantId,
      error: error.message,
    });
    return null;
  }

  return ((data ?? []) as unknown as ProductRow[]).reduce((map, product) => {
    map.set(product.id, product);
    return map;
  }, new Map<string, ProductRow>());
}

async function loadSaleUnitsByProductId({
  productIds,
  supabase,
  tenantId,
}: {
  productIds: string[];
  supabase: ReturnType<typeof getSupabaseServerClient>;
  tenantId: string;
}) {
  if (productIds.length === 0) {
    return new Map<string, ProductSaleUnit[]>();
  }

  const { data, error } = await supabase
    .from("product_sale_units")
    .select(
      "id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active"
    )
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("product_id", productIds)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    logServerWarn("Could not load quote sale units for editing", {
      source: "/inicio",
      tenantId,
      error: error.message,
    });
    return null;
  }

  return ((data ?? []) as unknown as ProductSaleUnitRow[]).reduce(
    (map, row) => {
      const current = map.get(row.product_id) ?? [];
      current.push(mapSaleUnit(row));
      map.set(row.product_id, current);
      return map;
    },
    new Map<string, ProductSaleUnit[]>()
  );
}

function compactQuoteLines({
  items,
  productsById,
  saleUnitsByProductId,
  warnings,
}: {
  items: QuoteItemRow[];
  productsById: Map<string, ProductRow>;
  saleUnitsByProductId: Map<string, ProductSaleUnit[]>;
  warnings: string[];
}) {
  const linesByKey = new Map<string, QuoteLine>();

  for (const item of items) {
    if (!item.product_id) {
      warnings.push(`${item.name}: no tiene producto asociado; la edición perdería este renglón.`);
      return null;
    }

    const product = productsById.get(item.product_id);

    if (!product) {
      warnings.push(`${item.name}: el producto no está disponible; la edición perdería este renglón.`);
      return null;
    }

    if (product.active === false) {
      warnings.push(`${product.name} esta inactivo y se cargo solo como referencia.`);
    }

    const productSalePrice = Number(product.sale_price ?? item.unit_price ?? 0);
    const saleUnits = saleUnitsByProductId.get(product.id) ?? [];
    const selectedSaleUnit =
      saleUnits.find((unit) => unit.id === item.product_sale_unit_id) ??
      saleUnits.find((unit) => unit.isDefault) ??
      saleUnits[0] ??
      fallbackSaleUnit({
        item,
        salePrice: productSalePrice,
      });

    if (selectedSaleUnit.id !== (item.product_sale_unit_id ?? "")) {
      warnings.push(
        `${product.name}: no se puede conservar la presentación original al editar.`
      );
      return null;
    }

    const line = mapQuoteLine({
      item,
      product,
      salePrice: productSalePrice,
      saleUnits:
        saleUnits.length > 0
          ? saleUnits.map((unit) => ({ ...unit, salePrice: productSalePrice }))
          : [selectedSaleUnit],
      selectedSaleUnit: { ...selectedSaleUnit, salePrice: productSalePrice },
    });
    const key = `${line.id}:${line.selectedSaleUnitId || "fallback"}`;
    const existing = linesByKey.get(key);

    if (existing) {
      warnings.push(`${product.name}: hay renglones repetidos de la misma presentación que el editor fusionaría.`);
      return null;
    } else {
      linesByKey.set(key, line);
    }
  }

  return [...linesByKey.values()];
}

function mapQuoteLine({
  item,
  product,
  salePrice,
  saleUnits,
  selectedSaleUnit,
}: {
  item: QuoteItemRow;
  product: ProductRow;
  salePrice: number;
  saleUnits: ProductSaleUnit[];
  selectedSaleUnit: ProductSaleUnit;
}): QuoteLine {
  const sku = normalizeProductCode(product.sku);
  const productBarcode = normalizeProductCode(product.barcode);
  const displayCode = productBarcode || sku;

  return {
    id: product.id,
    sku,
    customCode: normalizeProductCode(product.custom_code),
    code: normalizeProductCode(selectedSaleUnit.barcode) || displayCode,
    displayCode: normalizeProductCode(selectedSaleUnit.barcode) || displayCode,
    productBarcode,
    name: product.name,
    description: product.description ?? product.name,
    brand: product.brands?.name ?? "",
    category: product.categories?.name ?? "",
    unit: product.unit,
    price: salePrice,
    stockQuantity: Number(product.stock_quantity ?? 0),
    minStock: Number(product.min_stock ?? 0),
    availableForSale:
      product.active !== false &&
      Number(product.stock_quantity ?? 0) >= selectedSaleUnit.quantityInBaseUnit,
    hasProductBarcode: hasRealProductBarcode({
      barcode: productBarcode,
      sku,
    }),
    matchedBy: selectedSaleUnit.barcode ? "sale_unit_barcode" : "text",
    matchedSaleUnitId: selectedSaleUnit.id || undefined,
    saleUnits,
    quantity: Number(item.quantity ?? 0),
    selectedSaleUnitId: selectedSaleUnit.id,
    selectedSaleUnitName: selectedSaleUnit.name,
    quantityInBaseUnit: selectedSaleUnit.quantityInBaseUnit,
  };
}

function mapSaleUnit(row: ProductSaleUnitRow): ProductSaleUnit {
  return {
    id: row.id,
    name: row.name,
    quantityInBaseUnit: Number(row.quantity_in_base_unit ?? 1),
    salePrice: Number(row.sale_price ?? 0),
    barcode: normalizeProductCode(row.barcode),
    isDefault: Boolean(row.is_default),
    active: row.active !== false,
  };
}

function fallbackSaleUnit({
  item,
  salePrice,
}: {
  item: QuoteItemRow;
  salePrice: number;
}): ProductSaleUnit {
  return {
    id: "",
    name: item.sale_unit_name || "Unidad",
    quantityInBaseUnit: Number(item.quantity_in_base_unit ?? 1),
    salePrice,
    barcode: "",
    isDefault: true,
    active: true,
  };
}

function mapQuoteCustomer(quote: QuoteRow): QuoteCustomer {
  if (!quote.customer_id || !quote.customers) {
    return {
      id: "",
      name: "",
      phone: "",
      email: "",
      address: "",
    };
  }

  return {
    id: quote.customer_id,
    name: quote.customers.name,
    phone: quote.customers.phone ?? "",
    email: quote.customers.email ?? "",
    address: quote.customers.address ?? "",
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function loadCashStatus(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<
  | { open: true; openedAt: string; expectedCash: number }
  | { open: false }
> {
  try {
    const { data, error } = await supabase
      .from("cash_register_sessions")
      .select("id,opening_amount,opened_at")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logServerWarn("Could not load open cash session", {
        source: "/inicio",
        tenantId,
        error: error.message,
      });
      return { open: false };
    }

    const session = (data ?? null) as CashSessionRow | null;

    if (!session) {
      return { open: false };
    }

    const salesResult = await supabase
      .from("sales")
      .select("paid_amount")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", session.id);

    if (salesResult.error) {
      logServerWarn("Could not load cash session sales", {
        source: "/inicio",
        tenantId,
        error: salesResult.error.message,
      });
    }

    const sales = (salesResult.data ?? []) as unknown as SaleRow[];
    const collectedSales = sales.reduce(
      (sum, sale) => sum + Number(sale.paid_amount ?? 0),
      0
    );

    return {
      open: true,
      openedAt: session.opened_at,
      expectedCash: Number(session.opening_amount ?? 0) + collectedSales,
    };
  } catch (error) {
    logServerWarn("Unexpected cash status error", {
      source: "/inicio",
      tenantId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { open: false };
  }
}
