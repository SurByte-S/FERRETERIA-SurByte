import {
  FORBIDDEN_ACTION_MESSAGE,
  isTenantRoleForbiddenError,
  requireTenantRole,
} from "@/lib/tenant";
import { getSupabaseServerClient } from "@/lib/supabase";

const DEFAULT_PAGE_SIZE = 1000;
const MAX_PAGE_SIZE = 1000;

type CatalogProductRow = {
  id: string;
  tenant_id: string;
  sku: string | null;
  custom_code: string | null;
  barcode: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  sale_price: number | null;
  stock_quantity: number | null;
  min_stock: number | null;
  active: boolean;
  updated_at: string | null;
  categories: { name: string | null } | { name: string | null }[] | null;
  brands: { name: string | null } | { name: string | null }[] | null;
  suppliers: { name: string | null } | { name: string | null }[] | null;
};

type CatalogSaleUnitRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  quantity_in_base_unit: number | null;
  sale_price: number | null;
  barcode: string | null;
  is_default: boolean | null;
  active: boolean | null;
  updated_at: string | null;
};

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parsePageSize(value: string | null) {
  const parsed = parsePositiveInteger(value, DEFAULT_PAGE_SIZE);

  if (parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function firstRelationName(
  relation: CatalogProductRow["categories"] | CatalogProductRow["brands"]
) {
  const value = Array.isArray(relation) ? relation[0] : relation;

  return value?.name ?? null;
}

function noStoreJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");

  return Response.json(body, {
    ...init,
    headers,
  });
}

export async function GET(request: Request) {
  try {
    const tenant = await requireTenantRole(
      ["owner", "admin", "seller"],
      "/api/offline/catalog"
    );
    const { searchParams } = new URL(request.url);
    const pageSize = parsePageSize(searchParams.get("pageSize"));
    const offset = parsePositiveInteger(searchParams.get("offset"), 0);
    const supabase = getSupabaseServerClient("/api/offline/catalog");
    const { data, error } = await supabase
      .from("products")
      .select(
        "id,tenant_id,sku,custom_code,barcode,name,description,unit,sale_price,stock_quantity,min_stock,active,updated_at,categories(name),brands(name),suppliers(name)"
      )
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return noStoreJson(
        { ok: false, message: "No se pudo preparar el catalogo offline." },
        { status: 500 }
      );
    }

    const rows = (data ?? []) as unknown as CatalogProductRow[];
    const products = rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      sku: row.sku,
      custom_code: row.custom_code,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      unit: row.unit,
      sale_price: row.sale_price,
      stock_quantity: row.stock_quantity,
      min_stock: row.min_stock,
      active: row.active,
      updated_at: row.updated_at,
      category: firstRelationName(row.categories),
      brand: firstRelationName(row.brands),
      supplier: firstRelationName(row.suppliers),
    }));
    const productIds = products.map((product) => product.id);
    let saleUnits: CatalogSaleUnitRow[] = [];

    if (productIds.length > 0) {
      const saleUnitsResult = await supabase
        .from("product_sale_units")
        .select(
          "id,tenant_id,product_id,name,quantity_in_base_unit,sale_price,barcode,is_default,active,updated_at"
        )
        .eq("tenant_id", tenant.id)
        .eq("active", true)
        .in("product_id", productIds)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });

      if (saleUnitsResult.error) {
        return noStoreJson(
          { ok: false, message: "No se pudo preparar el catalogo offline." },
          { status: 500 }
        );
      }

      saleUnits = ((saleUnitsResult.data ?? []) as unknown as CatalogSaleUnitRow[])
        .filter((saleUnit) => productIds.includes(saleUnit.product_id))
        .map((saleUnit) => ({
          id: saleUnit.id,
          tenant_id: saleUnit.tenant_id,
          product_id: saleUnit.product_id,
          name: saleUnit.name,
          quantity_in_base_unit: saleUnit.quantity_in_base_unit,
          sale_price: saleUnit.sale_price,
          barcode: saleUnit.barcode,
          is_default: Boolean(saleUnit.is_default),
          active: saleUnit.active !== false,
          updated_at: saleUnit.updated_at,
        }));
    }

    const hasMore = rows.length === pageSize;

    return noStoreJson({
      products,
      saleUnits,
      nextOffset: hasMore ? offset + pageSize : null,
      hasMore,
      tenant: {
        id: tenant.id,
        name: tenant.name,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isTenantRoleForbiddenError(error)) {
      return noStoreJson(
        { ok: false, message: FORBIDDEN_ACTION_MESSAGE },
        { status: 403 }
      );
    }

    return noStoreJson(
      { ok: false, message: "No se pudo preparar el catalogo offline." },
      { status: 500 }
    );
  }
}
