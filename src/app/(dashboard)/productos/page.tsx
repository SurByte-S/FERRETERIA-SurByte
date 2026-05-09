import { AlertTriangle } from "lucide-react";

import { ProductsBrowser } from "@/components/productos/products-browser";
import type {
  ProductCatalogOption,
  ProductListItem,
} from "@/components/productos/product-types";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

type ProductsPageProps = {
  searchParams: Promise<{
    q?: string;
    categoria?: string;
    marca?: string;
  }>;
};

type ProductRow = {
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
  categories: { name: string } | null;
  brands: { name: string } | null;
};

type CatalogRow = {
  name: string;
};

export default async function ProductosPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const category = (params.categoria ?? "").trim();
  const brand = (params.marca ?? "").trim();
  const result = await loadProducts({ query, category, brand });

  return (
    <>
      <PageHeader
        title="Productos"
        description="Busca por codigo o descripcion, revisa precios y controla el stock sin ver datos internos."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      {result.ok ? (
        <ProductsBrowser
          products={result.products}
          categories={result.categories}
          brands={result.brands}
          query={query}
          category={category}
          brand={brand}
        />
      ) : (
        <Card className="border-destructive/40">
          <CardHeader>
            <div className="mb-2 flex size-14 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <AlertTriangle className="size-7" aria-hidden="true" />
            </div>
            <CardTitle>Necesitan revision</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg leading-8 text-muted-foreground">
              {result.message}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}

async function loadProducts({
  query,
  category,
  brand,
}: {
  query: string;
  category: string;
  brand: string;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      categories: ProductCatalogOption[];
      brands: ProductCatalogOption[];
    }
  | { ok: false; message: string }
> {
  try {
    const tenant = getCurrentTenant();
    const supabase = getSupabaseServerClient();

    const [categoriesResult, brandsResult] = await Promise.all([
      supabase
        .from("categories")
        .select("name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("brands")
        .select("name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name"),
    ]);

    if (categoriesResult.error || brandsResult.error) {
      return {
        ok: false,
        message:
          "No se pudieron cargar categorias o marcas. Revisa la conexion a Supabase.",
      };
    }

    let productsQuery = supabase
      .from("products")
      .select(
        "sku,barcode,name,description,unit,cost_with_tax,sale_price,stock_quantity,min_stock,active,categories(name),brands(name)"
      )
      .eq("tenant_id", tenant.id)
      .order("name")
      .limit(150);

    if (query) {
      const safeQuery = query.replace(/[%_]/g, "");
      productsQuery = productsQuery.or(
        `sku.ilike.%${safeQuery}%,barcode.ilike.%${safeQuery}%,name.ilike.%${safeQuery}%,description.ilike.%${safeQuery}%`
      );
    }

    const { data, error } = await productsQuery;

    if (error) {
      return {
        ok: false,
        message:
          "No se pudieron cargar productos. Revisa el tenant, las migraciones y las claves de Supabase.",
      };
    }

    const products = ((data ?? []) as unknown as ProductRow[])
      .map<ProductListItem>((row) => ({
        sku: row.sku,
        code: row.barcode ?? row.sku,
        description: row.description ?? row.name,
        category: row.categories?.name ?? "",
        brand: row.brands?.name ?? "",
        unit: row.unit,
        cost: row.cost_with_tax,
        salePrice: row.sale_price,
        stock: row.stock_quantity ?? 0,
        minStock: row.min_stock ?? 0,
        active: row.active,
      }))
      .filter((product) => !category || product.category === category)
      .filter((product) => !brand || product.brand === brand);

    return {
      ok: true,
      products,
      categories: ((categoriesResult.data ?? []) as CatalogRow[]).map((item) => ({
        name: item.name,
      })),
      brands: ((brandsResult.data ?? []) as CatalogRow[]).map((item) => ({
        name: item.name,
      })),
    };
  } catch {
    return {
      ok: false,
      message:
        "Configura Supabase y el tenant antes de usar la pantalla de productos.",
    };
  }
}
