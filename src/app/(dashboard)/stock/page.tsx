import { AlertTriangle, Edit3, Search } from "lucide-react";
import Link from "next/link";

import { ProductPriceForm } from "@/components/productos/product-price-form";
import { StockAdjustDetails } from "@/components/productos/stock-adjust-details";
import { StockSearchScrollAnchor } from "@/components/productos/stock-search-scroll-anchor";
import type { ProductListItem } from "@/components/productos/product-types";
import { Button } from "@/components/ui/button";
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

type StockPageProps = {
  searchParams: Promise<{
    conStock?: string | string[];
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
  cost_with_tax: number | null;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean;
  image_url: string | null;
  category_id: string | null;
  brand_id: string | null;
  categories: { name: string } | null;
  brands: { name: string } | null;
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
  return {
    id: row.id,
    sku: row.sku,
    code: row.barcode ?? row.sku,
    barcode: row.barcode ?? "",
    name: row.name,
    description: row.description ?? row.name,
    category: row.categories?.name ?? "",
    categoryId: row.category_id ?? "",
    brand: row.brands?.name ?? "",
    brandId: row.brand_id ?? "",
    unit: row.unit,
    cost: row.cost_with_tax,
    salePrice: row.sale_price,
    stockQuantity: row.stock_quantity ?? 0,
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
      label: "Bajo stock",
      className: "border-yellow-500/40 bg-yellow-50 text-yellow-900",
    };
  }

  return {
    label: "Stock OK",
    className: "border-emerald-500/40 bg-emerald-50 text-emerald-800",
  };
}

function buildStockHref({
  q,
  onlyOutOfStock = false,
  onlyWithStock = true,
}: {
  q: string;
  onlyOutOfStock?: boolean;
  onlyWithStock?: boolean;
}) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (onlyOutOfStock) {
    params.set("sinStock", "1");
  } else if (!onlyWithStock) {
    params.set("conStock", "0");
  }

  const query = params.toString();

  return query ? `/stock?${query}` : "/stock";
}

function lastParam(value?: string | string[]) {
  return Array.isArray(value) ? value.at(-1) : value;
}

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const onlyOutOfStock = lastParam(params.sinStock) === "1";
  const onlyWithStock = !onlyOutOfStock && lastParam(params.conStock) !== "0";
  const result = await loadStockProducts({ q, onlyOutOfStock, onlyWithStock });

  return (
    <>
      {result.ok ? (
        <div className="grid gap-4 xl:gap-5">
          <Card>
            <CardContent>
              <form className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto]" action="/stock">
                {onlyOutOfStock ? (
                  <input type="hidden" name="sinStock" value="1" />
                ) : null}
                <input type="hidden" name="conStock" value="0" />
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
                <label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-border bg-background px-3 text-sm font-semibold xl:min-h-14 xl:gap-3 xl:px-4 xl:text-base">
                  <input
                    type="checkbox"
                    name="conStock"
                    value="1"
                    defaultChecked={onlyWithStock}
                    disabled={onlyOutOfStock}
                    className="size-5"
                  />
                  Solo con stock
                </label>
                <Button type="submit" className="h-11 self-end gap-2 px-5 text-base xl:h-14 xl:px-6 xl:text-lg">
                  <Search className="size-6" aria-hidden="true" />
                  Buscar
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="h-10 px-3 text-sm xl:h-11 xl:px-4 xl:text-base">
                    <Link href={buildStockHref({ q, onlyWithStock: false })}>
                      Ver todos
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-10 px-3 text-sm xl:h-11 xl:px-4 xl:text-base">
                    <Link href={buildStockHref({ q, onlyOutOfStock: true })}>
                      Ver faltantes
                    </Link>
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground xl:text-base">
                  <span>
                    {onlyWithStock
                      ? `Productos con stock: ${result.products.length}`
                      : `Productos encontrados: ${result.products.length}`}
                  </span>
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
                  {onlyWithStock
                    ? "No encontramos productos con stock para esa busqueda."
                    : "No encontramos productos para esa busqueda."}
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-2">
              {result.products.map((product) => (
                <StockProductCard
                  key={product.id}
                  product={product}
                  canAdjustStock={result.canAdjustStock}
                  canEditPrice={result.canEditPrice}
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
  canAdjustStock,
  canEditPrice,
}: {
  product: ProductListItem;
  canAdjustStock: boolean;
  canEditPrice: boolean;
}) {
  const status = stockStatus(product);

  return (
    <Card>
      <CardHeader className="gap-2 p-3">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_150px_150px] xl:items-stretch 2xl:grid-cols-[minmax(0,1fr)_170px_160px]">
          <div className="min-w-0">
            <p className="mb-1 font-mono text-sm text-muted-foreground">
              Codigo: {product.code}
            </p>
            <CardTitle className="truncate text-lg xl:text-xl">{product.name}</CardTitle>
            <CardDescription className="mt-1 truncate text-sm">
              {product.description}
            </CardDescription>
          </div>
          <div className="flex min-h-20 flex-col justify-between rounded-lg border border-border bg-background p-2 xl:p-3">
            <p className="text-sm text-muted-foreground">Precio</p>
            <p className="mt-1 text-lg font-bold xl:text-xl">
              {formatMoney(product.salePrice)}
            </p>
            <p className="text-sm font-semibold text-transparent">Disponible</p>
          </div>
          <div className={`flex min-h-20 flex-col justify-between rounded-lg border p-2 xl:p-3 ${status.className}`}>
            <p className="text-sm">Stock</p>
            <p className="mt-1 text-lg font-bold xl:text-xl">
              {formatStockQuantity(product.stockQuantity)} {product.unit}
            </p>
            <p className="text-sm font-semibold">{status.label}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 p-3 pt-0 sm:flex-row sm:flex-wrap sm:items-start">
        {canAdjustStock ? (
          <StockAdjustDetails product={product} />
        ) : null}

        {canEditPrice ? (
          <details>
            <summary className="list-none">
              <Button
                asChild
                variant="outline"
                className="h-10 gap-2 border-sky-200 bg-sky-50 px-3 text-sm text-sky-900 hover:bg-sky-100 xl:h-11 xl:px-4 xl:text-base"
              >
                <span>
                  <Edit3 className="size-6" aria-hidden="true" />
                  Cambiar precio
                </span>
              </Button>
            </summary>
            <ProductPriceForm
              productId={product.id}
              sku={product.sku}
              name={product.name}
              salePrice={product.salePrice}
            />
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function loadStockProducts({
  q,
  onlyOutOfStock,
  onlyWithStock,
}: {
  q: string;
  onlyOutOfStock: boolean;
  onlyWithStock: boolean;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      outOfStockCount: number;
      canAdjustStock: boolean;
      canEditPrice: boolean;
    }
  | { ok: false; message: string }
> {
  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const canAdjustStock = ["owner", "admin", "seller"].includes(tenant.role);
    const canEditPrice = ["owner", "admin"].includes(tenant.role);
    const outOfStockResult = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .lte("stock_quantity", 0);

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,cost_with_tax,sale_price,stock_quantity,min_stock,active,image_url,category_id,brand_id,categories(name),brands(name)"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name")
      .limit(q.length >= 1 ? PAGE_SIZE * 3 : PAGE_SIZE);

    if (onlyOutOfStock) {
      query = query.lte("stock_quantity", 0);
    } else if (onlyWithStock) {
      query = query.gt("stock_quantity", 0);
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
        })),
        q
      ).slice(0, PAGE_SIZE),
      outOfStockCount: outOfStockResult.count ?? 0,
      canAdjustStock,
      canEditPrice,
    };
  } catch {
    return {
      ok: false,
      message: "Configura Supabase y la ferreteria antes de usar Stock.",
    };
  }
}
