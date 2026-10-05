"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, Search } from "lucide-react";

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
  if (value === null) {
    return "-";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 2,
  }).format(value);
}

function displayValue(value: string | null | undefined) {
  const cleanValue = value?.trim();

  return cleanValue ? cleanValue : "-";
}

export function OfflineCatalogSearch({
  tenantId,
  tenantName,
}: OfflineCatalogSearchProps) {
  const [meta, setMeta] = useState<OfflineCatalogMeta | null>(null);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<OfflineCatalogProduct[]>([]);
  const [exactLookup, setExactLookup] =
    useState<OfflineCatalogLookupResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      setIsLoading(true);
      setMessage(null);

      try {
        const [storedMeta, storedProducts, storedLookup] = await Promise.all([
          getOfflineCatalogMeta(tenantId),
          searchOfflineProducts(tenantId, query, 100),
          query.trim()
            ? lookupOfflineProductByCode(tenantId, query)
            : Promise.resolve(null),
        ]);

        if (!isMounted) {
          return;
        }

        const nextProducts =
          storedLookup &&
          !storedProducts.some((product) => product.id === storedLookup.product.id)
            ? [storedLookup.product, ...storedProducts]
            : storedProducts;

        setMeta(storedMeta);
        setProducts(nextProducts);
        setExactLookup(storedLookup);
      } catch {
        if (isMounted) {
          setMeta(null);
          setProducts([]);
          setExactLookup(null);
          setMessage("No se pudo leer el catalogo guardado en este equipo.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadCatalog();

    return () => {
      isMounted = false;
    };
  }, [tenantId, query]);

  const hasCatalog = Boolean(meta);
  const resultLabel = useMemo(() => {
    if (!hasCatalog) {
      return "Sin catalogo guardado";
    }

    if (isLoading) {
      return "Buscando...";
    }

    return `${products.length} resultado${products.length === 1 ? "" : "s"}`;
  }, [hasCatalog, isLoading, products.length]);

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-bold leading-tight tracking-normal">
                Catalogo guardado
              </h1>
            </div>
            <p className="mt-2 text-base font-bold text-foreground">
              Solo consulta. No permite vender sin internet.
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Catalogo guardado en este equipo. Precio y stock pueden estar
              desactualizados.
            </p>
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              {tenantName}
            </p>
          </div>
          <div className="grid gap-1 text-sm font-semibold text-muted-foreground lg:text-right">
            {meta ? (
              <>
                <span>Ultima actualizacion: {formatSavedAt(meta.saved_at)}</span>
                <span>Productos guardados: {meta.product_count}</span>
                {typeof meta.sale_unit_count === "number" ? (
                  <span>Presentaciones guardadas: {meta.sale_unit_count}</span>
                ) : null}
              </>
            ) : (
              <span>Todavia no hay catalogo guardado en este equipo.</span>
            )}
          </div>
        </div>
      </div>

      {!hasCatalog ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-card-foreground">
          <div className="flex gap-3">
            <AlertTriangle className="mt-1 size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-base font-bold">
                Todavia no hay catalogo guardado en este equipo.
              </p>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                Con internet, volve a Stock y toca Actualizar catalogo para usar
                sin internet.
              </p>
            </div>
          </div>
          {message ? (
            <p className="mt-3 text-sm font-bold text-foreground">{message}</p>
          ) : null}
        </div>
      ) : (
        <>
          <label className="grid gap-2">
            <span className="text-sm font-bold text-foreground">Buscar</span>
            <div className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-background px-4 shadow-sm focus-within:ring-2 focus-within:ring-ring/50">
              <Search className="size-5 text-muted-foreground" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar producto, codigo o codigo de barras"
                className="min-h-12 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-muted-foreground"
              />
            </div>
          </label>

          <div className="rounded-lg border border-border bg-card text-card-foreground shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border p-3">
              <div className="grid gap-1">
                <p className="text-sm font-bold">{resultLabel}</p>
                {exactLookup?.matchType === "sale_unit" ? (
                  <p className="text-sm font-bold text-primary">
                    Coincidencia por presentacion: {exactLookup.saleUnit?.name}
                  </p>
                ) : null}
              </div>
              {message ? (
                <p className="text-sm font-bold text-foreground">{message}</p>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/50 text-left text-xs font-bold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Codigo propio</th>
                    <th className="px-3 py-3">Codigo catalogo</th>
                    <th className="px-3 py-3">Producto</th>
                    <th className="px-3 py-3">Precio</th>
                    <th className="px-3 py-3">Stock estimado</th>
                    <th className="px-3 py-3">Marca</th>
                    <th className="px-3 py-3">Categoria</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {products.length > 0 ? (
                    products.map((product) => (
                      <tr key={product.id} className="align-top">
                        <td className="px-3 py-3 font-semibold">
                          {displayValue(product.custom_code)}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {displayValue(product.sku)}
                        </td>
                        <td className="min-w-64 px-3 py-3">
                          <p className="font-bold text-foreground">
                            {product.name}
                          </p>
                          <p className="mt-1 text-xs font-medium text-muted-foreground">
                            Barra:{" "}
                            {displayValue(
                              exactLookup?.matchType === "sale_unit" &&
                                exactLookup.product.id === product.id
                                ? exactLookup.saleUnit?.barcode
                                : product.barcode
                            )}
                          </p>
                          {exactLookup?.matchType === "sale_unit" &&
                          exactLookup.product.id === product.id ? (
                            <p className="mt-1 text-xs font-bold text-primary">
                              Coincidencia por presentacion:{" "}
                              {exactLookup.saleUnit?.name}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {formatMoney(
                            exactLookup?.matchType === "sale_unit" &&
                              exactLookup.product.id === product.id &&
                              exactLookup.saleUnit?.sale_price !== null
                              ? exactLookup.saleUnit?.sale_price ?? null
                              : product.sale_price
                          )}
                          {exactLookup?.matchType === "sale_unit" &&
                          exactLookup.product.id === product.id &&
                          exactLookup.saleUnit?.sale_price !== null ? (
                            <p className="mt-1 text-xs font-medium text-muted-foreground">
                              Precio base: {formatMoney(product.sale_price)}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 font-semibold">
                          {product.stock_quantity === null
                            ? "-"
                            : formatStockQuantity(product.stock_quantity)}
                        </td>
                        <td className="px-3 py-3">{displayValue(product.brand)}</td>
                        <td className="px-3 py-3">
                          {displayValue(product.category)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-sm font-semibold text-muted-foreground"
                      >
                        No hay productos guardados que coincidan con la busqueda.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
