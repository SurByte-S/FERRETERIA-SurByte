import { AlertTriangle, Edit3, PackagePlus, Search } from "lucide-react";

import { ProductEditForm } from "@/components/productos/product-edit-form";
import { StockAdjustForm } from "@/components/productos/stock-adjust-form";
import type {
  ProductCatalogOption,
  ProductListItem,
} from "@/components/productos/product-types";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

const PAGE_SIZE = 80;

type StockPageProps = {
  searchParams: Promise<{
    q?: string;
    sinStock?: string;
  }>;
};

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
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

type CatalogRow = {
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

export default async function StockPage({ searchParams }: StockPageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const onlyOutOfStock = params.sinStock === "1";
  const result = await loadStockProducts({ q, onlyOutOfStock });

  return (
    <>
      <PageHeader
        title="Stock"
        description="Busca un producto, revisa stock, ajusta stock o cambia precio."
        backHref="/inicio"
        backLabel="Volver a vender"
      />

      {result.ok ? (
        <div className="grid gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Buscar producto</CardTitle>
              <CardDescription>
                Codigo, barra, nombre o descripcion.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" action="/stock">
                <label className="grid gap-2 text-base font-semibold">
                  <span>Producto</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-muted-foreground" />
                    <input
                      name="q"
                      defaultValue={q}
                      placeholder="Codigo o nombre"
                      className="h-14 w-full rounded-lg border border-input bg-background pl-12 pr-4 text-lg"
                    />
                  </div>
                </label>
                <label className="flex min-h-14 items-center gap-3 self-end rounded-lg border border-border bg-background px-4 text-base font-semibold">
                  <input
                    type="checkbox"
                    name="sinStock"
                    value="1"
                    defaultChecked={onlyOutOfStock}
                    className="size-5"
                  />
                  Ver sin stock
                </label>
                <Button type="submit" className="h-14 self-end gap-2 px-6 text-lg">
                  <Search className="size-6" aria-hidden="true" />
                  Buscar
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg font-bold">
              {result.products.length} productos
            </p>
            <p className="text-base font-semibold text-muted-foreground">
              {result.outOfStockCount} sin stock
            </p>
          </div>

          {result.products.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No hay productos para mostrar</CardTitle>
                <CardDescription>
                  Cambia la busqueda o activa Ver sin stock.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4">
              {result.products.map((product) => (
                <StockProductCard
                  key={product.id}
                  product={product}
                  categories={result.categories}
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
  categories,
}: {
  product: ProductListItem;
  categories: ProductCatalogOption[];
}) {
  const status = stockStatus(product);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_160px] lg:items-start">
          <div className="min-w-0">
            <p className="mb-2 font-mono text-base text-muted-foreground">
              Codigo: {product.code}
            </p>
            <CardTitle className="truncate text-2xl">{product.name}</CardTitle>
            <CardDescription className="mt-2 truncate">
              {product.description}
            </CardDescription>
          </div>
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-base text-muted-foreground">Precio</p>
            <p className="mt-1 text-2xl font-bold">
              {formatMoney(product.salePrice)}
            </p>
          </div>
          <div className={`rounded-lg border p-4 ${status.className}`}>
            <p className="text-base">Stock</p>
            <p className="mt-1 text-2xl font-bold">
              {product.stockQuantity} {product.unit}
            </p>
            <p className="text-sm font-semibold">{status.label}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <details>
          <summary className="list-none">
            <Button asChild className="h-14 gap-2 px-6 text-lg">
              <span>
                <PackagePlus className="size-6" aria-hidden="true" />
                Ajustar stock
              </span>
            </Button>
          </summary>
          <StockAdjustForm product={product} />
        </details>

        <details>
          <summary className="list-none">
            <Button asChild variant="outline" className="h-14 gap-2 px-6 text-lg">
              <span>
                <Edit3 className="size-6" aria-hidden="true" />
                Cambiar precio
              </span>
            </Button>
          </summary>
          <ProductEditForm product={product} categories={categories} />
        </details>
      </CardContent>
    </Card>
  );
}

async function loadStockProducts({
  q,
  onlyOutOfStock,
}: {
  q: string;
  onlyOutOfStock: boolean;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      categories: ProductCatalogOption[];
      outOfStockCount: number;
    }
  | { ok: false; message: string }
> {
  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const [categoriesResult, outOfStockResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .lte("stock_quantity", 0),
    ]);

    if (categoriesResult.error) {
      return {
        ok: false,
        message: "No se pudieron cargar las categorias.",
      };
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,description,unit,cost_with_tax,sale_price,stock_quantity,min_stock,active,image_url,category_id,brand_id,categories(name),brands(name)"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name")
      .limit(PAGE_SIZE);

    if (onlyOutOfStock) {
      query = query.lte("stock_quantity", 0);
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

    const categories = ((categoriesResult.data ?? []) as CatalogRow[]).map(
      (item) => ({
        id: item.id,
        name: item.name,
      })
    );

    return {
      ok: true,
      products: ((data ?? []) as unknown as ProductRow[]).map(mapProduct),
      categories,
      outOfStockCount: outOfStockResult.count ?? 0,
    };
  } catch {
    return {
      ok: false,
      message: "Configura Supabase y el tenant antes de usar Stock.",
    };
  }
}
