import { AlertTriangle, Search } from "lucide-react";
import Link from "next/link";

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
    salePrice: row.sale_price,
    stockQuantity,
    minStock: row.min_stock ?? 0,
    active: row.active,
    imageUrl: row.image_url ?? "",
  };
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
        <div className="grid gap-4 xl:gap-5">
          <div className="flex justify-end">
            <NewProductForm
              brands={result.brands}
              canCreate={result.canCreateProduct}
              suppliers={result.suppliers}
            />
          </div>

          <Card>
            <CardContent>
              <form className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]" action="/stock">
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
                      className="h-11 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-base xl:h-14 xl:pl-12 xl:pr-4 xl:text-lg"
                    />
                  </div>
                </label>
                <Button type="submit" className="h-11 self-end gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
                  <Search className="size-6" aria-hidden="true" />
                  Buscar
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground xl:text-base">
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
            <div className="grid gap-1">
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

  return (
    <Card className="px-2 py-1.5">
      <div className="grid gap-1.5 xl:grid-cols-[minmax(0,1fr)_130px_220px_210px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_140px_250px_230px]">
        <div className="min-w-0">
          <p className="font-mono text-[10px] leading-none text-muted-foreground">
            Codigo: {product.code}
          </p>
          <p className="truncate text-sm font-semibold leading-tight">
            {product.name}
          </p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {product.description}
          </p>
          <div className="mt-1 grid gap-0.5 text-[11px] font-semibold leading-tight text-muted-foreground sm:grid-cols-3">
            <span className="truncate">Marca: {product.brand || "Sin marca"}</span>
            <span className="truncate">Proveedor: {product.supplier || "Sin proveedor"}</span>
          </div>
        </div>

        {canAdjustStock ? (
          <div className="grid min-h-[42px] rounded-md border border-border bg-background p-1">
            <StockAdjustDetails
              brands={brands}
              product={product}
              canEditPrice={canEditPrice}
              suppliers={suppliers}
            />
          </div>
        ) : null}

        <div className="grid min-h-[42px] gap-1 rounded-md border border-border bg-background px-2 py-1">
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] leading-tight text-muted-foreground">
            <span>Costo s/IVA</span>
            <span>{formatMoney(product.costWithoutTax)}</span>
            <span>Costo c/IVA</span>
            <span>{formatMoney(product.costWithTax)}</span>
            <span>IVA</span>
            <span>{product.taxRate}%</span>
          </div>
          <p className="truncate text-sm font-bold leading-tight">
            Precio de venta: {formatMoney(product.salePrice)}
          </p>
        </div>

        <div className={`grid min-h-[42px] gap-1 rounded-md border px-2 py-1 ${status.className}`}>
          <p className="text-[10px] leading-none">Stock actual</p>
          <p className="truncate text-sm font-bold leading-tight">
            {formatStockQuantity(product.stockQuantity)} {product.unit}
          </p>
          <div className="grid grid-cols-2 gap-x-2 text-[10px] font-semibold leading-tight">
            <span>Min: {formatStockQuantity(product.minStock)}</span>
          </div>
          <p className="text-[10px] font-semibold leading-none">{status.label}</p>
        </div>
      </div>
    </Card>
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
        "id,sku,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,brands(name),suppliers(name)"
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

    return {
      ok: true,
      products: sortProductsBySearchRank(
        ((data ?? []) as unknown as ProductRow[]).map((row) => ({
          ...mapProduct(row),
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
