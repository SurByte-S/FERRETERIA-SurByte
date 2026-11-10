"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatStockQuantity } from "@/lib/format";
import {
  getOfflineCatalogMeta,
  lookupOfflineProductByCode,
  searchOfflineProducts,
  type OfflineCatalogLookupResult,
  type OfflineCatalogMeta,
  type OfflineCatalogProduct,
} from "@/lib/offline/catalog-store";

type OfflineCatalogSearchProps = {
  tenantId: string;
  tenantName: string;
};

function formatSavedAt(value: string) {
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    currency: "ARS",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function displayValue(value: string | null | undefined) {
  const cleanValue = value?.trim();

  return cleanValue || "-";
}

function formatStock(value: number | null, unit: string | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  return `${formatStockQuantity(value)} ${unit ?? ""}`.trim();
}

function toLookupResult(
  product: OfflineCatalogProduct
): OfflineCatalogLookupResult {
  return {
    product,
    matchType: "product",
  };
}

function uniqueResults(results: OfflineCatalogLookupResult[]) {
  const seen = new Set<string>();

  return results.filter((result) => {
    const key = result.product.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  }).slice(0, 100);
}

export function OfflineCatalogSearch({
  tenantId,
  tenantName,
}: OfflineCatalogSearchProps) {
  const [search, setSearch] = useState({ value: "", revision: 0 });
  const [snapshot, setSnapshot] = useState<{
    tenantId: string;
    revision: number;
    meta: OfflineCatalogMeta | null;
    results: OfflineCatalogLookupResult[];
    message: string | null;
  } | null>(null);
  const query = search.value;
  const trimmedQuery = query.trim();
  const isLoading = snapshot?.tenantId !== tenantId ||
    snapshot.revision !== search.revision;
  const meta = snapshot?.tenantId === tenantId ? snapshot.meta : null;
  const hasCatalog = Boolean(meta);
  // Hide the previous snapshot immediately, including during the debounce.
  const results = isLoading ? [] : snapshot.results;
  const message = isLoading ? null : snapshot.message;
  const resultLabel = results.length === 1
    ? "1 producto encontrado"
    : `${results.length} productos encontrados`;

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      let storedMeta: OfflineCatalogMeta | null = null;

      try {
        storedMeta = await getOfflineCatalogMeta(tenantId);
        if (cancelled) return;

        let nextResults: OfflineCatalogLookupResult[] = [];
        if (storedMeta) {
          const [products, exactResult] = await Promise.all([
            searchOfflineProducts(tenantId, trimmedQuery, 100),
            trimmedQuery
              ? lookupOfflineProductByCode(tenantId, trimmedQuery)
              : Promise.resolve(null),
          ]);
          // Keep the matched presentation instead of a second base-product row.
          nextResults = uniqueResults([
            ...(exactResult ? [exactResult] : []),
            ...products.map(toLookupResult),
          ]);
        }

        if (!cancelled) {
          setSnapshot({
            tenantId,
            revision: search.revision,
            meta: storedMeta,
            results: nextResults,
            message: null,
          });
        }
      } catch {
        if (!cancelled) {
          setSnapshot({
            tenantId,
            revision: search.revision,
            meta: storedMeta,
            results: [],
            message: "No se pudo buscar en el catalogo guardado. Volve a intentar la busqueda.",
          });
        }
      }
    }, trimmedQuery ? 180 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [tenantId, trimmedQuery, search.revision]);

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-start">
          <div>
            <p className="text-sm font-bold uppercase text-muted-foreground">
              Solo consulta
            </p>
            <h2 className="mt-1 text-2xl font-bold leading-tight">
              Catalogo guardado
            </h2>
            <p className="mt-2 text-base font-semibold text-foreground">
              Solo consulta. No permite vender sin internet.
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Catalogo guardado en este equipo. Precio y stock pueden estar
              desactualizados.
            </p>
            {meta ? (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-muted-foreground">
                <span>Negocio: {meta.tenant_name || tenantName}</span>
                <span>Actualizado: {formatSavedAt(meta.saved_at)}</span>
                <span>Productos: {meta.product_count}</span>
                {typeof meta.sale_unit_count === "number" ? (
                  <span>Presentaciones: {meta.sale_unit_count}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <label className="grid gap-2 text-base font-semibold">
            <span>Buscar</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setSearch((current) => ({
                  value: event.target.value,
                  revision: current.revision + 1,
                }))}
                placeholder="Buscar producto, codigo o codigo de barras"
                className="h-12 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
                disabled={!hasCatalog && !message}
              />
            </div>
          </label>
        </div>
      </div>

      {isLoading ? (
        <p role="status" className="text-sm font-bold text-muted-foreground">
          Buscando en catalogo guardado...
        </p>
      ) : null}

      {!hasCatalog && !isLoading && !message ? (
        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
          <p className="text-base font-bold">
            Todavia no hay catalogo guardado en este equipo.
          </p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Con internet, volve a Stock y toca Actualizar catalogo para usar sin
            internet.
          </p>
        </div>
      ) : null}

      {message ? (
        <div role="alert" className="rounded-lg border border-border bg-card p-3 text-sm font-bold text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      {hasCatalog && !isLoading && !message ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-muted-foreground">
              {resultLabel}
            </p>
            <p className="text-sm font-semibold text-muted-foreground">
              Se muestran hasta 100 resultados.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border bg-secondary text-xs font-bold uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Codigo propio</th>
                  <th className="px-3 py-3">Codigo catalogo</th>
                  <th className="px-3 py-3">Producto</th>
                  <th className="px-3 py-3 text-right">Precio</th>
                  <th className="px-3 py-3 text-right">Stock estimado</th>
                  <th className="px-3 py-3">Marca</th>
                  <th className="px-3 py-3">Categoria</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-6 text-center text-base font-semibold text-muted-foreground"
                    >
                      No hay productos para esa busqueda.
                    </td>
                  </tr>
                ) : (
                  results.map((result) => {
                    const product = result.product;
                    const saleUnit = result.saleUnit;
                    const displayBarcode = saleUnit?.barcode ?? product.barcode;
                    const displayPrice =
                      saleUnit?.sale_price ?? product.sale_price;

                    return (
                    <tr key={`${product.id}:${saleUnit?.id ?? "product"}`}>
                      <td className="px-3 py-3 font-mono font-bold text-primary">
                        {displayValue(product.custom_code)}
                      </td>
                      <td className="px-3 py-3 font-mono font-semibold">
                        {displayValue(product.sku)}
                      </td>
                      <td className="max-w-[320px] px-3 py-3">
                        <p className="truncate font-bold text-foreground">
                          {product.name}
                        </p>
                        {saleUnit ? (
                          <p className="mt-0.5 truncate text-xs font-bold text-primary">
                            Coincidencia por presentacion: {saleUnit.name}
                          </p>
                        ) : null}
                        {displayBarcode ? (
                          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
                            Barras: {displayBarcode}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-primary">
                        {formatMoney(displayPrice)}
                        {saleUnit && saleUnit.sale_price !== null ? (
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            Precio base: {formatMoney(product.sale_price)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatStock(product.stock_quantity, product.unit)}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {displayValue(product.brand)}
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {displayValue(product.category)}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div>
        <Button asChild variant="outline" className="h-10 px-4 text-base">
          <Link href="/stock">Volver a Stock</Link>
        </Button>
      </div>
    </section>
  );
}
