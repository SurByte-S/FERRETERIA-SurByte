"use client";

import { AlertTriangle, Database } from "lucide-react";

import { formatStockQuantity } from "@/lib/format";
import type { OfflineCatalogProduct } from "@/lib/offline/catalog-store";

type OfflinePosCatalogResultsProps = {
  exactMatch?: OfflineCatalogProduct | null;
  hasError?: boolean;
  isLoading?: boolean;
  query: string;
  results: OfflineCatalogProduct[];
};

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

export function OfflinePosCatalogResults({
  exactMatch,
  hasError = false,
  isLoading = false,
  query,
  results,
}: OfflinePosCatalogResultsProps) {
  const cleanQuery = query.trim();

  return (
    <div className="grid gap-3">
      <div className="rounded-md border-2 border-primary/30 bg-card p-3 text-card-foreground">
        <div className="flex items-start gap-2">
          <Database className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-lg font-black text-primary">
              Solo consulta offline
            </h3>
            <p className="mt-1 text-base font-black text-foreground">
              No se puede vender sin internet.
            </p>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              Estos productos vienen del catalogo guardado en este equipo. Precio
              y stock pueden estar desactualizados.
            </p>
            {cleanQuery ? (
              <p className="mt-2 text-sm font-bold text-foreground">
                Busqueda: {cleanQuery}
              </p>
            ) : null}
            {exactMatch ? (
              <p className="mt-2 rounded-md border border-primary/20 bg-secondary px-2 py-1 text-sm font-black text-primary">
                Coincidencia exacta por codigo guardado.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {hasError ? (
        <div className="rounded-md border border-dashed border-border bg-card p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-1 size-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-black text-foreground">
                Con internet, anda a Stock y actualiza el catalogo para usar sin
                internet.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!hasError && isLoading ? (
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-sm font-black text-muted-foreground">
            Buscando en el catalogo guardado...
          </p>
        </div>
      ) : null}

      {!hasError && !isLoading && results.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-card p-4">
          <p className="text-sm font-black text-foreground">
            No se encontraron productos guardados con esa busqueda.
          </p>
        </div>
      ) : null}

      {!hasError && results.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/50 text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Codigo propio</th>
                <th className="px-3 py-3">Codigo catalogo</th>
                <th className="px-3 py-3">Codigo barras</th>
                <th className="px-3 py-3">Producto</th>
                <th className="px-3 py-3">Precio</th>
                <th className="px-3 py-3">Stock estimado</th>
                <th className="px-3 py-3">Marca</th>
                <th className="px-3 py-3">Categoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((product) => (
                <tr key={product.id} className="align-top">
                  <td className="px-3 py-3 font-semibold">
                    {displayValue(product.custom_code)}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {displayValue(product.sku)}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {displayValue(product.barcode)}
                  </td>
                  <td className="min-w-64 px-3 py-3">
                    <p className="font-black text-foreground">{product.name}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {formatMoney(product.sale_price)}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {product.stock_quantity === null
                      ? "-"
                      : formatStockQuantity(product.stock_quantity)}
                  </td>
                  <td className="px-3 py-3">{displayValue(product.brand)}</td>
                  <td className="px-3 py-3">{displayValue(product.category)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
