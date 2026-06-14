"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getSupabaseServerClient } from "@/lib/supabase";
import { hasRealProductBarcode, normalizeProductCode } from "@/lib/product-code";
import { sortProductsBySearchRank } from "@/lib/search-ranking";
import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenant,
  requireTenantRole,
} from "@/lib/tenant";
import type {
  QuoteCustomer,
  QuoteLine,
  QuoteProduct,
  ProductSaleUnit,
} from "@/components/presupuestos/quote-types";

type ProductRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  normalized_name: string;
  description: string | null;
  brands?: { name: string | null } | null;
  categories?: { name: string | null } | null;
  unit: string;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
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

type PosProductSearchRow = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  normalized_name: string;
  description: string | null;
  unit: string;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  category_name: string | null;
  brand_name: string | null;
  rank: number;
  score: number;
  total_count?: number;
  matched_by?: ProductMatchSource | null;
  matched_sale_unit_id?: string | null;
};

type ProductMatchSource = "sku" | "product_barcode" | "sale_unit_barcode" | "text";

type ProductCodeLookupRow = {
  active: boolean | null;
  conflict_count: number | null;
  conflict_sources: unknown;
  matched_by: ProductMatchSource | null;
  product_id: string | null;
  sale_unit_id: string | null;
  status: "found" | "not_found" | "inactive" | "conflict" | string;
  tenant_id: string | null;
};

export type PosProductSearchResult = {
  ok: boolean;
  items: QuoteProduct[];
  total: number;
  page: number;
  pageSize: number;
  message?: string;
};

export type QuoteProductCodeLookupResult = {
  ok: boolean;
  message?: string;
  product?: QuoteProduct;
  status: "found" | "not_found" | "out_of_stock" | "conflict" | "error";
};

export type SaveQuoteResult = {
  ok: boolean;
  message: string;
  quoteId?: string;
  saleId?: string;
};

const PAYMENT_METHODS = [
  "Efectivo",
  "Transferencia",
  "Debito",
  "Credito",
  "Cuenta corriente",
];
const EPSILON = 0.000001;

const CASH_REGISTER_CLOSED_MESSAGE =
  "Caja cerrada. AbrÃ­ caja antes de registrar ventas.";

const STOCK_NOT_ENOUGH_MESSAGE =
  "Stock insuficiente. RevisÃ¡ las cantidades antes de vender.";

const POS_PAGE_SIZE_OPTIONS = [20, 40, 80] as const;
const DEFAULT_POS_PAGE_SIZE = 40;
const CODE_CONFLICT_MESSAGE =
  "Este codigo pertenece a otro producto. Revisalo antes de continuar.";
const OUT_OF_STOCK_CODE_MESSAGE =
  "Encontramos el producto, pero no tiene stock disponible.";

function fallbackSaleUnit(row: Pick<ProductRow, "sale_price">): ProductSaleUnit {
  return {
    id: "",
    name: "Unidad",
    quantityInBaseUnit: 1,
    salePrice: row.sale_price ?? 0,
    barcode: "",
    isDefault: true,
    active: true,
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

function getDefaultSaleUnit(
  row: Pick<ProductRow, "sale_price">,
  saleUnits: ProductSaleUnit[],
  preferredSaleUnitId = ""
) {
  return (
    saleUnits.find((unit) => unit.id === preferredSaleUnitId && unit.active) ??
    saleUnits.find((unit) => unit.isDefault && unit.active) ??
    saleUnits.find((unit) => unit.active) ??
    fallbackSaleUnit(row)
  );
}

function findSaleUnitByBarcode(
  saleUnits: ProductSaleUnit[],
  rawCode: string | null | undefined
) {
  const cleanCode = normalizeProductCode(rawCode);

  if (!cleanCode) {
    return null;
  }

  return (
    saleUnits.find(
      (unit) => unit.active && normalizeProductCode(unit.barcode) === cleanCode
    ) ?? null
  );
}

function inferMatchSource({
  explicitMatchedBy,
  productBarcode,
  rawSearch,
  row,
  saleUnits,
}: {
  explicitMatchedBy?: ProductMatchSource | null;
  productBarcode: string;
  rawSearch?: string;
  row: Pick<ProductRow, "sku">;
  saleUnits: ProductSaleUnit[];
}): ProductMatchSource {
  if (explicitMatchedBy) {
    return explicitMatchedBy;
  }

  const cleanSearch = normalizeProductCode(rawSearch);

  if (!cleanSearch) {
    return "text";
  }

  if (normalizeProductCode(row.sku) === cleanSearch) {
    return "sku";
  }

  if (productBarcode && productBarcode === cleanSearch) {
    return "product_barcode";
  }

  if (findSaleUnitByBarcode(saleUnits, cleanSearch)) {
    return "sale_unit_barcode";
  }

  return "text";
}

function mapProduct(
  row: ProductRow,
  saleUnits: ProductSaleUnit[] = [],
  options: {
    matchedBy?: ProductMatchSource | null;
    preferredSaleUnitId?: string | null;
    rawSearch?: string;
  } = {}
): QuoteProduct {
  const finalSaleUnits = saleUnits.length > 0 ? saleUnits : [fallbackSaleUnit(row)];
  const productBarcode = normalizeProductCode(row.barcode);
  const searchMatchedSaleUnit = findSaleUnitByBarcode(
    finalSaleUnits,
    options.rawSearch
  );
  const preferredSaleUnitId =
    options.preferredSaleUnitId || searchMatchedSaleUnit?.id || "";
  const defaultSaleUnit = getDefaultSaleUnit(row, finalSaleUnits, preferredSaleUnitId);
  const matchedBy = inferMatchSource({
    explicitMatchedBy: options.matchedBy,
    productBarcode,
    rawSearch: options.rawSearch,
    row,
    saleUnits: finalSaleUnits,
  });
  const matchedSaleUnitId =
    matchedBy === "sale_unit_barcode"
      ? preferredSaleUnitId || searchMatchedSaleUnit?.id || undefined
      : undefined;
  const displayCode = productBarcode || row.sku;

  return {
    id: row.id,
    sku: row.sku,
    code: displayCode,
    displayCode,
    productBarcode,
    name: row.name,
    description: row.description ?? row.name,
    brand: row.brands?.name ?? "",
    category: row.categories?.name ?? "",
    unit: row.unit,
    price: defaultSaleUnit.salePrice,
    stockQuantity: row.stock_quantity ?? 0,
    minStock: row.min_stock ?? 0,
    availableForSale:
      (row.stock_quantity ?? 0) >= defaultSaleUnit.quantityInBaseUnit,
    hasProductBarcode: hasRealProductBarcode({
      barcode: productBarcode,
      sku: row.sku,
    }),
    matchedBy,
    matchedSaleUnitId,
    saleUnits: finalSaleUnits,
  };
}

function mapPosProduct(
  row: PosProductSearchRow,
  saleUnits: ProductSaleUnit[] = [],
  options: {
    matchedBy?: ProductMatchSource | null;
    preferredSaleUnitId?: string | null;
    rawSearch?: string;
  } = {}
): QuoteProduct {
  const productRow = {
    ...row,
    brands: null,
    categories: null,
  } satisfies ProductRow;
  const finalSaleUnits =
    saleUnits.length > 0 ? saleUnits : [fallbackSaleUnit(productRow)];
  const mapped = mapProduct(productRow, finalSaleUnits, {
    matchedBy: options.matchedBy,
    preferredSaleUnitId: options.preferredSaleUnitId,
    rawSearch: options.rawSearch,
  });

  return {
    ...mapped,
    brand: row.brand_name ?? "",
    category: row.category_name ?? "",
  };
}

async function loadSaleUnitProductMatches({
  rawSearch,
  tenantId,
}: {
  rawSearch: string;
  tenantId: string;
}) {
  const safeSearch = normalizeProductCode(rawSearch).replace(/[%_]/g, "");
  const matches = new Map<string, string>();

  if (!safeSearch) {
    return matches;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select("id,product_id")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .ilike("barcode", `%${safeSearch}%`)
    .limit(100);

  if (error) {
    return matches;
  }

  for (const row of (data ?? []) as { id: string; product_id: string }[]) {
    if (!matches.has(row.product_id)) {
      matches.set(row.product_id, row.id);
    }
  }

  return matches;
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
    return new Map<string, ProductSaleUnit[]>();
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_sale_units")
    .select(
      "id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active"
    )
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .in("product_id", uniqueIds)
    .order("is_default", { ascending: false })
    .order("name");

  if (error) {
    return new Map<string, ProductSaleUnit[]>();
  }

  return ((data ?? []) as ProductSaleUnitRow[]).reduce(
    (map, row) => {
      const current = map.get(row.product_id) ?? [];
      current.push(mapSaleUnit(row));
      map.set(row.product_id, current);
      return map;
    },
    new Map<string, ProductSaleUnit[]>()
  );
}

async function loadQuoteProductById({
  matchedBy,
  preferredSaleUnitId,
  productId,
  rawSearch,
  tenantId,
}: {
  matchedBy?: ProductMatchSource | null;
  preferredSaleUnitId?: string | null;
  productId: string;
  rawSearch: string;
  tenantId: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock"
    )
    .eq("tenant_id", tenantId)
    .eq("id", productId)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as ProductRow;
  const saleUnitsByProductId = await loadSaleUnitsByProductId({
    productIds: [row.id],
    tenantId,
  });

  return mapProduct(row, saleUnitsByProductId.get(row.id), {
    matchedBy,
    preferredSaleUnitId,
    rawSearch,
  });
}

async function findProductByCodeRpc(tenantId: string, code: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc("find_product_by_code", {
    input_tenant_id: tenantId,
    input_code: code,
  });

  if (error) {
    return null;
  }

  return (Array.isArray(data) ? data[0] : data) as ProductCodeLookupRow | null;
}

async function fallbackQuoteProductCodeLookup({
  code,
  includeOutOfStock,
  tenantId,
}: {
  code: string;
  includeOutOfStock: boolean;
  tenantId: string;
}): Promise<QuoteProductCodeLookupResult> {
  const supabase = getSupabaseServerClient();
  const selectFields =
    "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock";
  const [skuResult, barcodeResult, saleUnitResult] = await Promise.all([
    supabase
      .from("products")
      .select(selectFields)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .ilike("sku", code)
      .limit(2),
    supabase
      .from("products")
      .select(selectFields)
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .ilike("barcode", code)
      .limit(2),
    supabase
      .from("product_sale_units")
      .select(
        "id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active,products!inner(id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock)"
      )
      .eq("tenant_id", tenantId)
      .eq("active", true)
      .ilike("barcode", code)
      .limit(2),
  ]);

  if (skuResult.error || barcodeResult.error || saleUnitResult.error) {
    return {
      ok: false,
      message: "No se pudo buscar el producto.",
      status: "error",
    };
  }

  const candidates: {
    matchedBy: ProductMatchSource;
    productId: string;
    saleUnitId?: string;
  }[] = [];

  for (const row of (skuResult.data ?? []) as unknown as ProductRow[]) {
    candidates.push({ matchedBy: "sku", productId: row.id });
  }

  for (const row of (barcodeResult.data ?? []) as unknown as ProductRow[]) {
    candidates.push({ matchedBy: "product_barcode", productId: row.id });
  }

  for (const row of (saleUnitResult.data ?? []) as unknown as Array<
    ProductSaleUnitRow & { products: ProductRow }
  >) {
    candidates.push({
      matchedBy: "sale_unit_barcode",
      productId: row.products.id,
      saleUnitId: row.id,
    });
  }

  const productIds = new Set(candidates.map((candidate) => candidate.productId));

  if (productIds.size > 1) {
    return {
      ok: false,
      message: CODE_CONFLICT_MESSAGE,
      status: "conflict",
    };
  }

  const candidate = candidates[0];

  if (!candidate) {
    return {
      ok: false,
      status: "not_found",
    };
  }

  const product = await loadQuoteProductById({
    matchedBy: candidate.matchedBy,
    preferredSaleUnitId: candidate.saleUnitId,
    productId: candidate.productId,
    rawSearch: code,
    tenantId,
  });

  if (!product) {
    return {
      ok: false,
      message: "No se pudo cargar el producto.",
      status: "error",
    };
  }

  if (!includeOutOfStock && !product.availableForSale) {
    return {
      ok: false,
      message: OUT_OF_STOCK_CODE_MESSAGE,
      product,
      status: "out_of_stock",
    };
  }

  return {
    ok: true,
    product,
    status: "found",
  };
}

function cleanSearch(value: string) {
  return value
    .trim()
    .replace(/["'`]/g, " ")
    .replace(/[^\p{L}\p{N}\s./*,-]/gu, " ")
    .replace(/(\d)\s*(x|X|por|\*)\s*(\d)/g, "$1 x $3")
    .replace(/\s+/g, " ");
}

function clampPosPageSize(pageSize: number) {
  return POS_PAGE_SIZE_OPTIONS.includes(
    pageSize as (typeof POS_PAGE_SIZE_OPTIONS)[number]
  )
    ? pageSize
    : DEFAULT_POS_PAGE_SIZE;
}

function getSaveQuoteErrorMessage(message?: string) {
  if (!message) {
    return "No se pudo guardar el presupuesto.";
  }

  if (message.includes("TENANT_NOT_FOUND")) {
    return "No se encontro la ferreteria configurada.";
  }

  if (message.includes("QUOTE_WITHOUT_ITEMS")) {
    return "Agrega al menos un producto antes de guardar.";
  }

  if (message.includes("QUOTE_ITEMS_INVALID")) {
    return "Revisa las cantidades de los productos.";
  }

  if (message.includes("QUOTE_PRODUCTS_NOT_FOUND")) {
    return "Hay productos que ya no estan disponibles. Revisa el presupuesto.";
  }

  if (message.includes("CUSTOMER_NOT_FOUND")) {
    return "No se encontro el cliente seleccionado.";
  }

  return "No se pudo guardar el presupuesto. Intenta nuevamente.";
}

function getConvertQuoteErrorMessage(message?: string) {
  if (!message) {
    return "No se pudo registrar la venta.";
  }

  if (message.includes("QUOTE_NOT_FOUND")) {
    return "No se encontro el presupuesto guardado.";
  }

  if (message.includes("QUOTE_ALREADY_CONVERTED")) {
    return "Este presupuesto ya estaba convertido en venta.";
  }

  if (message.includes("QUOTE_WITHOUT_ITEMS")) {
    return "El presupuesto no tiene productos para vender.";
  }

  if (message.includes("PAYMENT_METHOD_INVALID")) {
    return "Elegi una forma de pago valida.";
  }

  if (message.includes("PAID_AMOUNT_INVALID")) {
    return "El monto pagado no puede ser negativo.";
  }

  if (message.includes("PAID_AMOUNT_TOO_LOW")) {
    return "Para esta forma de pago, el monto pagado debe cubrir el total.";
  }

  if (message.includes("CUSTOMER_REQUIRED_FOR_CREDIT")) {
    return "Para dejar deuda en cuenta corriente, elegi un cliente.";
  }

  if (message.includes("CASH_REGISTER_CLOSED")) {
    return CASH_REGISTER_CLOSED_MESSAGE;
  }

  if (message.includes("STOCK_NOT_ENOUGH")) {
    return STOCK_NOT_ENOUGH_MESSAGE;
  }

  return "No se pudo registrar la venta.";
}

async function hasOpenCashRegister(
  tenantId: string,
  supabase: ReturnType<typeof getSupabaseServerClient>
) {
  const { data, error } = await supabase
    .from("cash_register_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  return !error && Boolean(data);
}

export async function searchQuoteProductsAction(
  rawSearch: string,
  includeOutOfStock = false
): Promise<QuoteProduct[]> {
  const search = cleanSearch(rawSearch);

  if (!search) {
    return [];
  }

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const saleUnitMatches = await loadSaleUnitProductMatches({
      rawSearch: search,
      tenantId: tenant.id,
    });
    const searchParts = [
      `sku.ilike.%${search}%`,
      `barcode.ilike.%${search}%`,
      `name.ilike.%${search}%`,
      `normalized_name.ilike.%${search}%`,
      `description.ilike.%${search}%`,
    ];

    if (saleUnitMatches.size > 0) {
      searchParts.push(`id.in.(${[...saleUnitMatches.keys()].join(",")})`);
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .or(searchParts.join(","))
      .order("name")
      .limit(30);

    if (!includeOutOfStock) {
      query = query.gt("stock_quantity", 0);
    }

    const { data, error } = await query;

    if (error) {
      return [];
    }

    const rows = (data ?? []) as unknown as ProductRow[];
    const saleUnitsByProductId = await loadSaleUnitsByProductId({
      productIds: rows.map((row) => row.id),
      tenantId: tenant.id,
    });

    return sortProductsBySearchRank(
      rows.map((row) => ({
        ...mapProduct(row, saleUnitsByProductId.get(row.id), {
          preferredSaleUnitId: saleUnitMatches.get(row.id),
          rawSearch: search,
        }),
        barcode: row.barcode,
        normalizedName: row.normalized_name,
        saleUnitBarcodes: (saleUnitsByProductId.get(row.id) ?? [])
          .map((unit) => unit.barcode)
          .filter(Boolean),
      })),
      search
    ).slice(0, 30);
  } catch {
    return [];
  }
}

export async function searchProductsForPosAction(
  rawSearch: string,
  includeOutOfStock = false,
  page = 1,
  pageSize = 40
): Promise<PosProductSearchResult> {
  const search = cleanSearch(rawSearch);
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = clampPosPageSize(Number(pageSize) || DEFAULT_POS_PAGE_SIZE);
  const offset = (safePage - 1) * safePageSize;

  try {
    const tenant = await requireTenantRole(["owner", "admin", "seller"]);
    const supabase = getSupabaseServerClient();
    const rpcResult = await supabase.rpc("search_pos_products", {
      p_tenant_id: tenant.id,
      p_query: search,
      p_limit: safePageSize,
      p_offset: offset,
      p_include_out_of_stock: includeOutOfStock,
    });

    if (!rpcResult.error) {
      const rows = (rpcResult.data ?? []) as PosProductSearchRow[];

      const saleUnitsByProductId = await loadSaleUnitsByProductId({
        productIds: rows.map((row) => row.id),
        tenantId: tenant.id,
      });

      return {
        ok: true,
        items: rows.map((row) =>
          mapPosProduct(row, saleUnitsByProductId.get(row.id), {
            matchedBy: row.matched_by,
            preferredSaleUnitId: row.matched_sale_unit_id,
            rawSearch: search,
          })
        ),
        total: Number(rows[0]?.total_count ?? 0),
        page: safePage,
        pageSize: safePageSize,
      };
    }

    const safeSearch = search.replace(/[%_]/g, "");
    const from = offset;
    const to = from + safePageSize - 1;
    const [matchingBrands, matchingCategories] = safeSearch
      ? await Promise.all([
          supabase
            .from("brands")
            .select("id")
            .eq("tenant_id", tenant.id)
            .eq("active", true)
            .ilike("name", `%${safeSearch}%`),
          supabase
            .from("categories")
            .select("id")
            .eq("tenant_id", tenant.id)
            .eq("active", true)
            .ilike("name", `%${safeSearch}%`),
        ])
      : [{ data: [] }, { data: [] }];
    const brandIds = ((matchingBrands.data ?? []) as { id: string }[]).map(
      (item) => item.id
    );
    const categoryIds = (
      (matchingCategories.data ?? []) as { id: string }[]
    ).map((item) => item.id);
    const searchParts = [
      `sku.ilike.%${safeSearch}%`,
      `barcode.ilike.%${safeSearch}%`,
      `name.ilike.%${safeSearch}%`,
      `normalized_name.ilike.%${safeSearch}%`,
      `description.ilike.%${safeSearch}%`,
    ];
    const saleUnitMatches = await loadSaleUnitProductMatches({
      rawSearch: safeSearch,
      tenantId: tenant.id,
    });

    if (brandIds.length > 0) {
      searchParts.push(`brand_id.in.(${brandIds.join(",")})`);
    }

    if (categoryIds.length > 0) {
      searchParts.push(`category_id.in.(${categoryIds.join(",")})`);
    }

    if (saleUnitMatches.size > 0) {
      searchParts.push(`id.in.(${[...saleUnitMatches.keys()].join(",")})`);
    }

    let query = supabase
      .from("products")
      .select(
        "id,sku,barcode,name,normalized_name,description,unit,sale_price,stock_quantity,min_stock,brands(name),categories(name)",
        { count: "exact" }
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name")
      .range(from, to);

    if (searchParts.length > 0 && safeSearch) {
      query = query.or(searchParts.join(","));
    }

    if (!includeOutOfStock) {
      query = query.gt("stock_quantity", 0);
    }

    const { data, error, count } = await query;

    if (error) {
      return {
        ok: false,
        items: [],
        total: 0,
        page: safePage,
        pageSize: safePageSize,
        message: "No se pudieron buscar productos. Revisa la conexion.",
      };
    }

    const fallbackRows = (data ?? []) as unknown as ProductRow[];
    const saleUnitsByProductId = await loadSaleUnitsByProductId({
      productIds: fallbackRows.map((row) => row.id),
      tenantId: tenant.id,
    });

    return {
      ok: true,
      items: sortProductsBySearchRank(
        fallbackRows.map((row) => ({
          ...mapProduct(row, saleUnitsByProductId.get(row.id), {
            preferredSaleUnitId: saleUnitMatches.get(row.id),
            rawSearch: search,
          }),
          barcode: row.barcode,
          normalizedName: row.normalized_name,
          saleUnitBarcodes: (saleUnitsByProductId.get(row.id) ?? [])
            .map((unit) => unit.barcode)
            .filter(Boolean),
        })),
        search
      ),
      total: count ?? 0,
      page: safePage,
      pageSize: safePageSize,
    };
  } catch {
    return {
      ok: false,
      items: [],
      total: 0,
      page: safePage,
      pageSize: safePageSize,
      message: "No se pudieron buscar productos. Intenta nuevamente.",
    };
  }
}

export async function lookupQuoteProductByCodeAction(
  rawSku: string,
  includeOutOfStock = false
): Promise<QuoteProductCodeLookupResult> {
  const sku = cleanSearch(rawSku);

  if (!sku) {
    return {
      ok: false,
      status: "not_found",
    };
  }

  try {
    const tenant = await requireTenant();
    const rpcLookup = await findProductByCodeRpc(tenant.id, sku);

    if (!rpcLookup) {
      return fallbackQuoteProductCodeLookup({
        code: sku,
        includeOutOfStock,
        tenantId: tenant.id,
      });
    }

    if (rpcLookup.status === "not_found") {
      return {
        ok: false,
        status: "not_found",
      };
    }

    if (rpcLookup.status === "conflict") {
      return {
        ok: false,
        message: CODE_CONFLICT_MESSAGE,
        status: "conflict",
      };
    }

    if (rpcLookup.status === "inactive") {
      return {
        ok: false,
        message:
          "El codigo pertenece a un producto inactivo. Revisalo antes de continuar.",
        status: "error",
      };
    }

    if (rpcLookup.status !== "found" || !rpcLookup.product_id) {
      return {
        ok: false,
        message: "No se pudo buscar el producto.",
        status: "error",
      };
    }

    const product = await loadQuoteProductById({
      matchedBy: rpcLookup.matched_by,
      preferredSaleUnitId: rpcLookup.sale_unit_id,
      productId: rpcLookup.product_id,
      rawSearch: sku,
      tenantId: tenant.id,
    });

    if (!product) {
      return {
        ok: false,
        message: "No se pudo cargar el producto.",
        status: "error",
      };
    }

    if (!includeOutOfStock && !product.availableForSale) {
      return {
        ok: false,
        message: OUT_OF_STOCK_CODE_MESSAGE,
        product,
        status: "out_of_stock",
      };
    }

    return {
      ok: true,
      product,
      status: "found",
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
        status: "error",
      };
    }

    return {
      ok: false,
      message: "No se pudo buscar el producto.",
      status: "error",
    };
  }
}

export async function getQuoteProductBySkuAction(
  rawSku: string,
  includeOutOfStock = false
): Promise<QuoteProduct | null> {
  const result = await lookupQuoteProductByCodeAction(
    rawSku,
    includeOutOfStock
  );

  if (!result.ok) {
    return null;
  }

  return result.product ?? null;
}

export async function saveQuoteAction({
  customer,
  lines,
}: {
  customer: QuoteCustomer;
  lines: QuoteLine[];
}): Promise<SaveQuoteResult> {
  const cleanLines = lines.filter((line) => line.quantity > 0);

  if (cleanLines.length === 0) {
    return {
      ok: false,
      message: "Agrega al menos un producto antes de guardar.",
    };
  }

  try {
    const [tenant, user] = await Promise.all([requireTenant(), requireUser()]);
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase.rpc("create_quote_with_items", {
      input_tenant_id: tenant.id,
      input_created_by: user.id,
      input_customer_id: customer.id?.trim() || null,
      input_customer_name: customer.name.trim() || null,
      input_customer_phone: customer.phone.trim() || null,
      input_customer_email: customer.email.trim() || null,
      input_customer_address: customer.address.trim() || null,
      input_items: cleanLines.map((line) => ({
        product_id: line.id,
        sku: line.sku,
        sale_unit_id: line.selectedSaleUnitId || null,
        quantity: line.quantity,
      })),
      input_notes: "Presupuesto creado desde mostrador",
    });

    if (error || !data) {
      return {
        ok: false,
        message: getSaveQuoteErrorMessage(error?.message),
      };
    }

    const quoteId = data as string;
    revalidatePath("/presupuestos");

    return {
      ok: true,
      message: "Presupuesto guardado.",
      quoteId,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message: "No se pudo guardar el presupuesto. Intenta nuevamente.",
    };
  }
}

export async function saveQuoteAndConvertToSaleAction({
  customer,
  lines,
  paymentMethod,
  paidAmount,
}: {
  customer: QuoteCustomer;
  lines: QuoteLine[];
  paymentMethod: string;
  paidAmount: number | string | null | undefined;
}): Promise<SaveQuoteResult> {
  const cleanPaymentMethod = paymentMethod.trim();
  const normalizedPaidAmount =
    cleanPaymentMethod === "Cuenta corriente" &&
    (paidAmount === "" || paidAmount === null || paidAmount === undefined)
      ? 0
      : Number(paidAmount);

  if (!PAYMENT_METHODS.includes(cleanPaymentMethod)) {
    return {
      ok: false,
      message: "Elegi una forma de pago para registrar la venta.",
    };
  }

  if (!Number.isFinite(normalizedPaidAmount) || normalizedPaidAmount < 0) {
    return {
      ok: false,
      message: "Revisa el monto pagado.",
    };
  }

  const cleanLines = lines.filter((line) => line.quantity > 0);

  if (cleanLines.length === 0) {
    return {
      ok: false,
      message: "Agrega al menos un producto antes de vender.",
    };
  }

  const total = cleanLines.reduce(
    (sum, line) => sum + Number(line.quantity) * Number(line.price),
    0
  );

  if (normalizedPaidAmount - total > EPSILON) {
    return {
      ok: false,
      message: "El monto pagado no puede superar el total.",
    };
  }

  if (cleanPaymentMethod === "Cuenta corriente" && !customer.id?.trim()) {
    return {
      ok: false,
      message: "Para vender a cuenta corriente, elegi un cliente.",
    };
  }

  try {
    const [tenant, user] = await Promise.all([
      requireTenantRole(["owner", "admin", "seller"]),
      requireUser(),
    ]);
    const supabase = getSupabaseServerClient();

    console.info("[sale-payload-diagnostic]", {
      source: "saveQuoteAndConvertToSaleAction",
      paymentMethod: cleanPaymentMethod,
      rawPaidAmount: paidAmount,
      normalizedPaidAmount,
      total,
      customerId: customer.id?.trim() || null,
    });

    if (!(await hasOpenCashRegister(tenant.id, supabase))) {
      return {
        ok: false,
        message: CASH_REGISTER_CLOSED_MESSAGE,
      };
    }

    const { data: quoteData, error: quoteError } = await supabase.rpc(
      "create_quote_with_items",
      {
        input_tenant_id: tenant.id,
        input_created_by: user.id,
        input_customer_id: customer.id?.trim() || null,
        input_customer_name: customer.name.trim() || null,
        input_customer_phone: customer.phone.trim() || null,
        input_customer_email: customer.email.trim() || null,
        input_customer_address: customer.address.trim() || null,
        input_items: cleanLines.map((line) => ({
          product_id: line.id,
          sku: line.sku,
          sale_unit_id: line.selectedSaleUnitId || null,
          quantity: line.quantity,
        })),
        input_notes: "Venta creada desde mostrador",
      }
    );

    if (quoteError || !quoteData) {
      return {
        ok: false,
        message: getSaveQuoteErrorMessage(quoteError?.message),
      };
    }

    const quoteId = quoteData as string;
    const { data: saleData, error: saleError } = await supabase.rpc(
      "convert_quote_to_sale",
      {
        input_quote_id: quoteId,
        input_tenant_id: tenant.id,
        input_created_by: user.id,
        input_customer_id: customer.id?.trim() || null,
        input_payment_method: cleanPaymentMethod,
        input_paid_amount: normalizedPaidAmount,
      }
    );

    if (saleError || !saleData) {
      revalidatePath("/presupuestos");
      revalidatePath(`/presupuestos/${quoteId}`);

      return {
        ok: false,
        message: `${getConvertQuoteErrorMessage(
          saleError?.message
        )} El presupuesto quedo guardado para revisarlo.`,
        quoteId,
      };
    }

    const saleId = saleData as string;

    revalidatePath("/presupuestos");
    revalidatePath(`/presupuestos/${quoteId}`);
    revalidatePath("/ventas");
    revalidatePath(`/ventas/${saleId}`);

    return {
      ok: true,
      message: "Venta registrada.",
      quoteId,
      saleId,
    };
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return {
        ok: false,
        message: FORBIDDEN_ACTION_MESSAGE,
      };
    }

    return {
      ok: false,
      message: "No se pudo registrar la venta. Intenta nuevamente.",
    };
  }
}
