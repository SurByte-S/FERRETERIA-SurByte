import { AlertTriangle } from "lucide-react";

import { ProductsBrowser } from "@/components/productos/products-browser";
import type {
  ProductCatalogOption,
  ProductListItem,
} from "@/components/productos/product-types";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseServerClient } from "@/lib/supabase";
import { requireTenant } from "@/lib/tenant";

const PAGE_SIZE = 100;

type ProductsPageProps = {
  searchParams: Promise<{
    codigo?: string;
    nombre?: string;
    categoria?: string;
    modo?: string;
    page?: string;
  }>;
};

type ProductSearchRow = {
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
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  total_count?: number;
};

type ProductFallbackRow = {
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

export default async function ProductosPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const code = (params.codigo ?? "").trim();
  const name = (params.nombre ?? "").trim();
  const categoryId = (params.categoria ?? "").trim();
  const mode = params.modo === "administracion" ? "administracion" : "mostrador";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const result = await loadProducts({ code, name, categoryId, page });

  return (
    <>
      <PageHeader
        title="Productos"
        description="Busca por codigo, nombre o categoria. Edita precios y fotos sin ver datos internos."
        backHref="/inicio"
        backLabel="Volver al inicio"
      />

      {result.ok ? (
        <ProductsBrowser
          products={result.products}
          categories={result.categories}
          code={code}
          name={name}
          categoryId={categoryId}
          page={page}
          total={result.total}
          showing={result.showing}
          lowStockCount={result.lowStockCount}
          mode={mode}
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

function mapRpcRow(row: ProductSearchRow): ProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    code: row.barcode ?? row.sku,
    barcode: row.barcode ?? "",
    name: row.name,
    description: row.description ?? row.name,
    category: row.category_name ?? "",
    categoryId: row.category_id ?? "",
    brand: row.brand_name ?? "",
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

function mapFallbackRow(row: ProductFallbackRow): ProductListItem {
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

async function loadProducts({
  code,
  name,
  categoryId,
  page,
}: {
  code: string;
  name: string;
  categoryId: string;
  page: number;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      categories: ProductCatalogOption[];
      total: number;
      showing: number;
      lowStockCount: number;
    }
  | { ok: false; message: string }
> {
  try {
    const tenant = await requireTenant();
    const supabase = getSupabaseServerClient();
    const from = 0;
    const to = page * PAGE_SIZE - 1;
    const categoriesResult = await supabase
      .from("categories")
      .select("id,name")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name");
    const lowStockResult = await supabase
      .from("low_stock_products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id);
    const lowStockCount = lowStockResult.count ?? 0;

    if (categoriesResult.error) {
      return {
        ok: false,
        message: "No se pudieron cargar las categorias. Revisa la conexion a Supabase.",
      };
    }

    const categories = ((categoriesResult.data ?? []) as CatalogRow[]).map(
      (item) => ({
        id: item.id,
        name: item.name,
      })
    );

    if (name.length === 1 && !code && !categoryId) {
      return {
        ok: true,
        products: [],
        categories,
        total: 0,
        showing: 0,
        lowStockCount,
      };
    }

    const rpcResult = await supabase.rpc("search_products", {
      search_tenant_id: tenant.id,
      search_code: code,
      search_name: name.length >= 2 ? name : "",
      search_category_id: categoryId || null,
      page_size: page * PAGE_SIZE,
      page_offset: 0,
    });

    if (!rpcResult.error) {
      const rows = (rpcResult.data ?? []) as ProductSearchRow[];
      const total = Number(rows[0]?.total_count ?? 0);

      return {
        ok: true,
        products: rows.map(mapRpcRow),
        categories,
        total,
        showing: Math.min(from + rows.length, total),
        lowStockCount,
      };
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,description,unit,cost_with_tax,sale_price,stock_quantity,min_stock,active,image_url,category_id,brand_id,categories(name),brands(name)",
        { count: "exact" }
      )
      .eq("tenant_id", tenant.id)
      .order("name")
      .range(from, to);

    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    if (code) {
      const safeCode = code.replace(/[%_]/g, "");
      query = query.or(`sku.ilike.%${safeCode}%,barcode.ilike.%${safeCode}%`);
    }

    if (name.length >= 2) {
      const safeName = name.replace(/[%_]/g, "");
      const matchingBrands = await supabase
        .from("brands")
        .select("id")
        .eq("tenant_id", tenant.id)
        .ilike("name", `%${safeName}%`);
      const brandIds = ((matchingBrands.data ?? []) as { id: string }[]).map(
        (item) => item.id
      );
      const nameParts = [
        `name.ilike.%${safeName}%`,
        `normalized_name.ilike.%${safeName}%`,
        `description.ilike.%${safeName}%`,
      ];

      if (brandIds.length > 0) {
        nameParts.push(`brand_id.in.(${brandIds.join(",")})`);
      }

      query = query.or(nameParts.join(","));
    }

    const { data, error, count } = await query;

    if (error) {
      return {
        ok: false,
        message:
          "No se pudieron cargar productos. Revisa la ferreteria, las migraciones y las claves de Supabase.",
      };
    }

    const products = ((data ?? []) as unknown as ProductFallbackRow[]).map(
      mapFallbackRow
    );
    const total = count ?? products.length;

    return {
      ok: true,
      products,
      categories,
      total,
      showing: Math.min(from + products.length, total),
      lowStockCount,
    };
  } catch {
    return {
      ok: false,
      message: "Configura Supabase y la ferreteria antes de usar la pantalla de productos.",
    };
  }
}
