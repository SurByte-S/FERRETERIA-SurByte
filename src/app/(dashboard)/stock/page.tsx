import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";

import { ExportMenuButton } from "@/components/common/export-menu-button";
import { StockAdjustDetails } from "@/components/productos/stock-adjust-details";
import { StockSearchScrollAnchor } from "@/components/productos/stock-search-scroll-anchor";
import type { ProductListItem } from "@/components/productos/product-types";
import { Button } from "@/components/ui/button";
import { NewProductForm } from "./new-product-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatStockQuantity } from "@/lib/format";
import { sortProductsBySearchRank } from "@/lib/search-ranking";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

const PAGE_SIZE = 80;
const stockFilters = [
  { value: "todos", label: "Todos" },
  { value: "con-stock", label: "Con stock" },
  { value: "sin-stock", label: "Sin stock" },
  { value: "bajo-minimo", label: "Bajo minimo" },
  { value: "sin-proveedor", label: "Sin proveedor" },
] as const;

type StockFilter = (typeof stockFilters)[number]["value"];

type StockPageProps = {
  searchParams: Promise<{
    conStock?: string | string[];
    filtro?: string | string[];
    q?: string;
    sinStock?: string | string[];
  }>;
};

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  normalized_name: string | null;
  description: string | null;
  unit: string;
  cost_without_tax: number | null;
  cost_with_tax: number | null;
  sale_price: number | null;
  tax_rate: number | null;
  profit_margin_percent: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean;
  image_url: string | null;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  brands: { name: string } | null;
  suppliers: { name: string } | null;
};

type CatalogOption = {
  id: string;
  name: string;
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

function formatMoney(value: number | null) {
  if (value === null) {
    return "Sin precio";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function mapProduct(row: ProductRow): ProductListItem {
  const costWithoutTax = row.cost_without_tax;
  const taxRate = row.tax_rate ?? 21;
  const stockQuantity = row.stock_quantity ?? 0;

  return {
    id: row.id,
    sku: row.sku,
    code: row.barcode ?? row.sku,
    barcode: row.barcode ?? "",
    name: row.name,
    description: row.description ?? row.name,
    category: "",
    categoryId: row.category_id ?? "",
    brand: row.brands?.name ?? "",
    brandId: row.brand_id ?? "",
    supplier: row.suppliers?.name ?? "",
    supplierId: row.supplier_id ?? "",
    unit: row.unit,
    cost: row.cost_with_tax,
    costWithoutTax,
    costWithTax: row.cost_with_tax,
    taxRate,
    profitMarginPercent: row.profit_margin_percent ?? 0,
    salePrice: row.sale_price,
    stockQuantity,
    minStock: row.min_stock ?? 0,
    active: row.active,
    imageUrl: row.image_url ?? "",
    saleUnits: [],
  };
}

async function loadSaleUnitsByProductId({
  productIds,
  tenantId,
}: {
  productIds: string[];
  tenantId: string;
}) {
  const uniqueIds = [...new Set(productIds)].filter(Boolean);

  if (uniqueIds.length === 0) {
    return new Map<string, ProductListItem["saleUnits"]>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select(
      "id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active"
    )
    .eq("tenant_id", tenantId)
    .in("product_id", uniqueIds)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    return new Map<string, ProductListItem["saleUnits"]>();
  }

  return ((data ?? []) as ProductSaleUnitRow[]).reduce((map, row) => {
    const current = map.get(row.product_id) ?? [];
    current.push({
      id: row.id,
      name: row.name,
      quantityInBaseUnit: Number(row.quantity_in_base_unit ?? 1),
      salePrice: Number(row.sale_price ?? 0),
      barcode: row.barcode ?? "",
      isDefault: Boolean(row.is_default),
      active: row.active !== false,
    });
    map.set(row.product_id, current);
    return map;
  }, new Map<string, ProductListItem["saleUnits"]>());
}

function stockStatus(product: ProductListItem) {
  if (product.stockQuantity <= 0) {
    return {
      label: "Sin stock",
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    };
  }

  if (product.minStock > 0 && product.stockQuantity <= product.minStock) {
    return {
      label: "Bajo minimo",
      className: "border-yellow-500/40 bg-yellow-50 text-yellow-900",
    };
  }

  return {
    label: "Stock OK",
    className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  };
}

function buildStockHref({
  filter,
  q,
}: {
  filter: StockFilter;
  q: string;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (filter !== "con-stock") {
    params.set("filtro", filter);
  }

  const query = params.toString();

  return query ? `/stock?${query}` : "/stock";
}

function lastParam(value?: string | string[]) {
  return Array.isArray(value) ? value.at(-1) : value;
}

function parseStockFilter(params: Awaited<StockPageProps["searchParams"]>): StockFilter {
  const filter = lastParam(params.filtro);

  if (stockFilters.some((item) => item.value === filter)) {
    return filter as StockFilter;
  }

  if (lastParam(params.sinStock) === "1") {
    return "sin-stock";
  }

  if (lastParam(params.conStock) === "0") {
    return "todos";
  }

  return "con-stock";
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const filter = parseStockFilter(params);
  const result = await loadStockProducts({ q, filter });

  return (
    <>
      {result.ok ? (
        <div className="grid w-full max-w-none gap-4 pb-6 xl:gap-5">
          <Card>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <form
                  className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                  action="/stock"
                >
                  {filter !== "con-stock" ? (
                    <input type="hidden" name="filtro" value={filter} />
                  ) : null}
                  <label className="grid gap-2 text-base font-semibold">
                    <span>Producto</span>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                      <input
                        name="q"
                        defaultValue={q}
                        placeholder="Codigo o nombre"
                        className="h-12 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-base xl:h-14 xl:pl-12 xl:pr-4 xl:text-lg"
                      />
                    </div>
                  </label>
                  <Button
                    type="submit"
                    className="h-12 gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg"
                  >
                    <Search className="size-6" aria-hidden="true" />
                    Buscar
                  </Button>
                </form>
                <div className="flex flex-wrap items-end gap-2">
                  <ExportMenuButton
                    csvHref="/api/export/stock?format=csv"
                    pdfHref="/api/export/stock?format=pdf"
                  />
                  <NewProductForm
                    brands={result.brands}
                    canCreate={result.canCreateProduct}
                    suppliers={result.suppliers}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {stockFilters.map((item) => (
                    <Button
                      key={item.value}
                      asChild
                      variant={filter === item.value ? "default" : "outline"}
                      className="h-10 px-3 text-sm xl:h-11 xl:px-4 xl:text-base"
                    >
                      <Link href={buildStockHref({ q, filter: item.value })}>
                        {item.label}
                      </Link>
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-foreground xl:text-base">
                  <span>Productos encontrados: {result.products.length}</span>
                  <span>Productos sin stock: {result.outOfStockCount}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <StockSearchScrollAnchor enabled={q.length > 0} />
          </div>

          {result.products.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No hay productos para mostrar</CardTitle>
                <CardDescription>
                  {filter === "con-stock"
                    ? "No encontramos productos con stock para esa busqueda."
                    : "No encontramos productos para esa busqueda."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-1.5">
              {result.products.map((product) => (
                <StockProductCard
                  key={product.id}
                  product={product}
                  brands={result.brands}
                  canAdjustStock={result.canAdjustStock}
                  canEditPrice={result.canEditPrice}
                  suppliers={result.suppliers}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>Necesita revision</CardTitle>
            <CardDescription>{result.message}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}

function StockProductCard({
  product,
  brands,
  canAdjustStock,
  canEditPrice,
  suppliers,
}: {
  product: ProductListItem;
  brands: CatalogOption[];
  canAdjustStock: boolean;
  canEditPrice: boolean;
  suppliers: CatalogOption[];
}) {
  const status = stockStatus(product);
  const content = (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_150px_150px] md:items-center md:gap-3">
      <div className="min-w-0">
        <p className="font-mono text-[11px] font-semibold leading-tight text-foreground">
          Codigo: {product.code}
        </p>
        <p className="mt-0.5 line-clamp-1 text-base font-semibold leading-tight text-foreground md:text-lg">
          {product.name}
        </p>
      </div>

      <div className="flex min-h-[48px] flex-col justify-center rounded-lg border border-border bg-background p-2 md:min-h-[52px]">
        <p className="text-[11px] font-semibold leading-tight text-foreground">
          Precio venta
        </p>
        <p className="mt-0.5 truncate text-base font-bold leading-tight text-primary md:text-lg">
          {formatMoney(product.salePrice)}
        </p>
      </div>

      <div className={`flex min-h-[48px] flex-col justify-center rounded-lg border p-2 md:min-h-[52px] ${status.className}`}>
        <p className="text-[11px] font-semibold leading-tight">Stock actual</p>
        <p className="mt-0.5 truncate text-base font-bold leading-tight md:text-lg">
          {formatStockQuantity(product.stockQuantity)} {product.unit}
        </p>
        <p className="text-xs font-semibold leading-tight">{status.label}</p>
      </div>
    </div>
  );

  if (!canAdjustStock) {
    return (
      <Card className="min-h-[58px] rounded-lg p-2.5 shadow-sm md:min-h-[64px] md:p-3">
        {content}
      </Card>
    );
  }

  return (
    <StockAdjustDetails
      brands={brands}
      product={product}
      canEditPrice={canEditPrice}
      suppliers={suppliers}
      triggerAriaLabel={`Gestionar producto ${product.name}`}
      triggerClassName="block min-h-[58px] w-full cursor-pointer rounded-lg border border-border bg-card p-2.5 text-left text-card-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[64px] md:p-3"
    >
      {content}
    </StockAdjustDetails>
  );
}

async function loadStockProducts({
  filter,
  q,
}: {
  filter: StockFilter;
  q: string;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      outOfStockCount: number;
      canAdjustStock: boolean;
      canCreateProduct: boolean;
      canEditPrice: boolean;
      brands: CatalogOption[];
      suppliers: CatalogOption[];
    }
  | { ok: false; message: string }
> {
  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const canAdjustStock = ["owner", "admin", "seller"].includes(tenant.role);
    const canEditPrice = ["owner", "admin"].includes(tenant.role);
    const canCreateProduct = canEditPrice;
    const [brandsResult, suppliersResult] = await Promise.all([
      supabase
        .from("brands")
        .select("id,name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("suppliers")
        .select("id,name")
        .eq("tenant_id", tenant.id)
        .order("name"),
    ]);

    if (brandsResult.error || suppliersResult.error) {
      return {
        ok: false,
        message: "No se pudieron cargar las opciones para crear productos.",
      };
    }

    const outOfStockResult = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .lte("stock_quantity", 0);

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,profit_margin_percent,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name")
      .limit(
        filter === "bajo-minimo"
          ? PAGE_SIZE * 10
          : q.length >= 1
            ? PAGE_SIZE * 3
            : PAGE_SIZE
      );

    if (filter === "sin-stock") {
      query = query.lte("stock_quantity", 0);
    } else if (filter === "con-stock") {
      query = query.gt("stock_quantity", 0);
    } else if (filter === "sin-proveedor") {
      query = query.is("supplier_id", null);
    }

    if (q.length >= 1) {
      const safe = q.replace(/[%_]/g, "");
      query = query.or(
        `sku.ilike.%${safe}%,barcode.ilike.%${safe}%,name.ilike.%${safe}%,normalized_name.ilike.%${safe}%,description.ilike.%${safe}%`
      );
    }

    const { data, error } = await query;

    if (error) {
      return {
        ok: false,
        message: "No se pudo cargar stock. Revisa la conexion a Supabase.",
      };
    }

    const rows = (data ?? []) as unknown as ProductRow[];
    const saleUnitsByProductId = await loadSaleUnitsByProductId({
      productIds: rows.map((row) => row.id),
      tenantId: tenant.id,
    });

    return {
      ok: true,
      products: sortProductsBySearchRank(
        rows.map((row) => ({
          ...mapProduct(row),
          saleUnits: saleUnitsByProductId.get(row.id) ?? [],
          normalizedName: row.normalized_name,
        })).filter((product) => {
          if (filter === "bajo-minimo") {
            return (
              product.stockQuantity > 0 &&
              product.minStock > 0 &&
              product.stockQuantity <= product.minStock
            );
          }

          return true;
        }),
        q
      ).slice(0, PAGE_SIZE),
      outOfStockCount: outOfStockResult.count ?? 0,
      canAdjustStock,
      canCreateProduct,
      canEditPrice,
      brands: (brandsResult.data ?? []) as CatalogOption[],
      suppliers: (suppliersResult.data ?? []) as CatalogOption[],
    };
  } catch {
    return {
      ok: false,
      message: "Configura Supabase y la ferreteria antes de usar Stock.",
    };
  }
}
