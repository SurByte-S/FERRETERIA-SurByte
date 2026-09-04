"use client";

import { useEffect, useMemo, useState } from "react";
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
    const key = `${result.product.id}:${result.saleUnit?.id ?? "product"}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function OfflineCatalogSearch({
  tenantId,
  tenantName,
}: OfflineCatalogSearchProps) {
  const [meta, setMeta] = useState<OfflineCatalogMeta | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OfflineCatalogLookupResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasCatalog = Boolean(meta);
  const trimmedQuery = query.trim();
  const resultLabel = useMemo(() => {
    if (!hasCatalog) {
      return null;
    }

    return results.length === 1
      ? "1 producto encontrado"
      : `${results.length} productos encontrados`;
  }, [hasCatalog, results.length]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialCatalog() {
      try {
        const storedMeta = await getOfflineCatalogMeta(tenantId);

        if (!isMounted) {
          return;
        }

        setMeta(storedMeta);

        if (!storedMeta) {
          setResults([]);
          setMessage(null);
          return;
        }

        const initialProducts = await searchOfflineProducts(tenantId, "", 100);

        if (isMounted) {
          setResults(initialProducts.map(toLookupResult));
          setMessage(null);
        }
      } catch {
        if (isMounted) {
          setMessage("No se pudo leer el catalogo guardado en este equipo.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialCatalog();

    return () => {
      isMounted = false;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!hasCatalog) {
      return;
    }

    let isMounted = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const nextProducts = await searchOfflineProducts(
          tenantId,
          trimmedQuery,
          100
        );
        const exactResult = trimmedQuery
          ? await lookupOfflineProductByCode(tenantId, trimmedQuery)
          : null;
        const nextResults = uniqueResults([
          ...(exactResult ? [exactResult] : []),
          ...nextProducts.map(toLookupResult),
        ]);

        if (isMounted) {
          setResults(nextResults);
          setMessage(null);
        }
      } catch {
        if (isMounted) {
          setMessage("No se pudo buscar en el catalogo guardado.");
        }
      }
    }, 180);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
    };
  }, [hasCatalog, tenantId, trimmedQuery]);

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
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto, codigo o codigo de barras"
                className="h-12 w-full rounded-lg border border-input bg-background pl-11 pr-3 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
                disabled={!hasCatalog}
              />
            </div>
          </label>
        </div>
      </div>

      {!hasCatalog && !isLoading ? (
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
        <div className="rounded-lg border border-border bg-card p-3 text-sm font-bold text-foreground shadow-sm">
          {message}
        </div>
      ) : null}

      {hasCatalog ? (
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
