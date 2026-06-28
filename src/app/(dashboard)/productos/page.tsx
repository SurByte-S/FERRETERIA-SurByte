import { AlertTriangle } from "lucide-react";

import { ProductsBrowser } from "@/components/productos/products-browser";
import type {
  ProductCatalogOption,
  ProductListItem,
} from "@/components/productos/product-types";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasRealProductBarcode, normalizeProductCode } from "@/lib/product-code";
import { sortProductsBySearchRank } from "@/lib/search-ranking";
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
  custom_code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  normalized_name: string | null;
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
  category_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
  total_count?: number;
};

type ProductFallbackRow = {
  id: string;
  sku: string;
  custom_code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  normalized_name: string | null;
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
  categories: { name: string } | null;
  brands: { name: string } | null;
  suppliers: { name: string } | null;
};

type CatalogRow = {
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

export default async function ProductosPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const code = (params.codigo ?? "").trim();
  const name = (params.nombre ?? "").trim();
  const categoryId = (params.categoria ?? "").trim();
  const mode = params.modo === "administracion" ? "administracion" : "mostrador";
  const page = Math.max(Number(params.page ?? "1") || 1, 1);
  const result = await loadProducts({ code, name, categoryId, mode, page });

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
          brands={result.brands}
          categories={result.categories}
          suppliers={result.suppliers}
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
  const stockQuantity = row.stock_quantity ?? 0;
  const sku = normalizeProductCode(row.sku);
  const productBarcode = normalizeProductCode(row.barcode);
  const displayCode = productBarcode || sku;

  return {
    id: row.id,
    sku,
    customCode: normalizeProductCode(row.custom_code),
    code: displayCode,
    displayCode,
    barcode: productBarcode,
    productBarcode,
    hasProductBarcode: hasRealProductBarcode({
      barcode: productBarcode,
      sku,
    }),
    name: row.name,
    description: row.description ?? row.name,
    category: row.category_name ?? "",
    categoryId: row.category_id ?? "",
    brand: row.brand_name ?? "",
    brandId: row.brand_id ?? "",
    supplier: "",
    supplierId: "",
    unit: row.unit,
    cost: row.cost_with_tax,
    costWithoutTax: null,
    costWithTax: row.cost_with_tax,
    taxRate: 21,
    profitMarginPercent: row.profit_margin_percent ?? 0,
    salePrice: row.sale_price,
    stockQuantity,
    minStock: row.min_stock ?? 0,
    active: row.active,
    imageUrl: row.image_url ?? "",
    matchedBy: "text",
    saleUnits: [],
  };
}

function mapFallbackRow(row: ProductFallbackRow): ProductListItem {
  const stockQuantity = row.stock_quantity ?? 0;
  const sku = normalizeProductCode(row.sku);
  const productBarcode = normalizeProductCode(row.barcode);
  const displayCode = productBarcode || sku;

  return {
    id: row.id,
    sku,
    customCode: normalizeProductCode(row.custom_code),
    code: displayCode,
    displayCode,
    barcode: productBarcode,
    productBarcode,
    hasProductBarcode: hasRealProductBarcode({
      barcode: productBarcode,
      sku,
    }),
    name: row.name,
    description: row.description ?? row.name,
    category: row.categories?.name ?? "",
    categoryId: row.category_id ?? "",
    brand: row.brands?.name ?? "",
    brandId: row.brand_id ?? "",
    supplier: row.suppliers?.name ?? "",
    supplierId: row.supplier_id ?? "",
    unit: row.unit,
    cost: row.cost_with_tax,
    costWithoutTax: row.cost_without_tax,
    costWithTax: row.cost_with_tax,
    taxRate: row.tax_rate ?? 21,
    profitMarginPercent: row.profit_margin_percent ?? 0,
    salePrice: row.sale_price,
    stockQuantity,
    minStock: row.min_stock ?? 0,
    active: row.active,
    imageUrl: row.image_url ?? "",
    matchedBy: "text",
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
      barcode: normalizeProductCode(row.barcode),
      isDefault: Boolean(row.is_default),
      active: row.active !== false,
    });
    map.set(row.product_id, current);
    return map;
  }, new Map<string, ProductListItem["saleUnits"]>());
}

async function loadSaleUnitProductMatches({
  rawCode,
  tenantId,
}: {
  rawCode: string;
  tenantId: string;
}) {
  const safeCode = normalizeProductCode(rawCode).replace(/[%_]/g, "");

  if (!safeCode) {
    return [];
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select("product_id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .ilike("barcode", `%${safeCode}%`)
    .limit(pageSizeForSaleUnitMatches());

  if (error) {
    return [];
  }

  return [
    ...new Set(
      ((data ?? []) as { product_id: string }[]).map((row) => row.product_id)
    ),
  ];
}

function pageSizeForSaleUnitMatches() {
  return PAGE_SIZE * 3;
}

async function loadProducts({
  code,
  name,
  categoryId,
  mode,
  page,
}: {
  code: string;
  name: string;
  categoryId: string;
  mode: "mostrador" | "administracion";
  page: number;
}): Promise<
  | {
      ok: true;
      products: ProductListItem[];
      brands: ProductCatalogOption[];
      categories: ProductCatalogOption[];
      suppliers: ProductCatalogOption[];
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
    const [categoriesResult, brandsResult, suppliersResult] = await Promise.all([
      supabase
        .from("categories")
        .select("id,name")
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .order("name"),
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
    const lowStockResult = await supabase
      .from("low_stock_products")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id);
    const lowStockCount = lowStockResult.count ?? 0;
    const saleUnitMatchedProductIds = code
      ? await loadSaleUnitProductMatches({ rawCode: code, tenantId: tenant.id })
      : [];

    if (categoriesResult.error || brandsResult.error || suppliersResult.error) {
      return {
        ok: false,
        message: "No se pudieron cargar las opciones. Revisa la conexion a Supabase.",
      };
    }

    const brands = ((brandsResult.data ?? []) as CatalogRow[]).map((item) => ({
      id: item.id,
      name: item.name,
    }));
    const categories = ((categoriesResult.data ?? []) as CatalogRow[]).map(
      (item) => ({
        id: item.id,
        name: item.name,
      })
    );
    const suppliers = ((suppliersResult.data ?? []) as CatalogRow[]).map((item) => ({
      id: item.id,
      name: item.name,
    }));

    if (name.length === 1 && !code && !categoryId) {
      return {
        ok: true,
        products: [],
        brands,
        categories,
        suppliers,
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

    if (
      mode !== "administracion" &&
      !rpcResult.error &&
      saleUnitMatchedProductIds.length === 0
    ) {
      const rows = (rpcResult.data ?? []) as ProductSearchRow[];
      const total = Number(rows[0]?.total_count ?? 0);
      const saleUnitsByProductId = await loadSaleUnitsByProductId({
        productIds: rows.map((row) => row.id),
        tenantId: tenant.id,
      });

      return {
        ok: true,
        products: sortProductsBySearchRank(
          rows.map((row) => ({
            ...mapRpcRow(row),
            saleUnits: saleUnitsByProductId.get(row.id) ?? [],
            normalizedName: row.normalized_name,
          })),
          code || name
        ),
        brands,
        categories,
        suppliers,
        total,
        showing: Math.min(from + rows.length, total),
        lowStockCount,
      };
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,custom_code,barcode,name,normalized_name,description,unit,cost_without_tax,cost_with_tax,sale_price,tax_rate,profit_margin_percent,stock_quantity,min_stock,active,image_url,category_id,brand_id,supplier_id,categories(name),brands(name),suppliers(name)",
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
      const codeParts = [
        `sku.ilike.%${safeCode}%`,
        `custom_code.ilike.%${safeCode}%`,
        `barcode.ilike.%${safeCode}%`,
      ];

      if (saleUnitMatchedProductIds.length > 0) {
        codeParts.push(`id.in.(${saleUnitMatchedProductIds.join(",")})`);
      }

      query = query.or(codeParts.join(","));
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

    const fallbackRows = (data ?? []) as unknown as ProductFallbackRow[];
    const saleUnitsByProductId = await loadSaleUnitsByProductId({
      productIds: fallbackRows.map((row) => row.id),
      tenantId: tenant.id,
    });
    const products = fallbackRows.map(
      (row) => ({
        ...mapFallbackRow(row),
        saleUnits: saleUnitsByProductId.get(row.id) ?? [],
        normalizedName: row.normalized_name,
      })
    );
    const total = count ?? products.length;

    return {
      ok: true,
      products: sortProductsBySearchRank(products, code || name),
      brands,
      categories,
      suppliers,
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
